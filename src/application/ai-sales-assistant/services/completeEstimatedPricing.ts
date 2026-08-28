import type { SalesAssistantDraftProposal } from "../dto/AISalesAssistantDto";
import type { AISalesAssistantPort } from "../ports/AISalesAssistantPort";
import { QuotationCalculator } from "../../../domain/quotation";

/** Estimates never overwrite internal prices, never use FX, and never claim web verification. */
export async function completeEstimatedPricing(proposal: SalesAssistantDraftProposal, provider?: AISalesAssistantPort | null) {
  const unresolved = proposal.lines.map((line, index) => ({ line, key: String(index) })).filter(({ line }) => line.unitPrice === null && line.resolutionStatus !== "AMBIGUOUS");
  if (!unresolved.length || !provider?.estimatePrices) return proposal;
  const region = proposal.customer.countryCode ?? proposal.metadata.region ?? null;
  if (!region) return proposal;
  try {
    const output = await provider.estimatePrices({ currency: proposal.proposal.currencyCode, region, lines: unresolved.map(({ line, key }) => ({ key, name: line.itemName, unit: line.unitName })) });
    if (!output || typeof output !== "object" || !Array.isArray((output as { prices?: unknown }).prices)) return proposal;
    const prices = (output as { prices: unknown[] }).prices;
    for (const { line, key } of unresolved) {
      const matches = prices.filter((entry): entry is { key: string; price: number } => !!entry && typeof entry === "object" && (entry as { key?: unknown }).key === key);
      if (matches.length !== 1) continue;
      const price = matches[0].price;
      if (typeof price !== "number" || !Number.isFinite(price) || price <= 0 || price > 1_000_000_000) continue;
      line.unitPrice = price;
      line.priceSource = "AI_ESTIMATED";
      line.priceEstimate = { region, reference: "AI budget estimate; no live market source", confidence: "LOW", verified: false };
      line.reviewRequired = true;
      proposal.estimateNotice = true;
    }
  } catch { proposal.metadata.warnings.push("AI price estimation unavailable; unresolved prices remain for human review."); }
  if (proposal.lines.length && proposal.lines.every((line) => line.quantity !== null && line.unitPrice !== null)) {
    const result = QuotationCalculator.calculate(proposal.lines.map((line, index) => ({ ...line, position: index + 1, quantity: line.quantity!, unitPrice: line.unitPrice! })));
    proposal.financials = result.totals;
    proposal.lines.forEach((line) => { line.subtotal = line.quantity! * line.unitPrice!; });
  }
  proposal.reviewRequired = true;
  return proposal;
}
