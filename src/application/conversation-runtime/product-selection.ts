import type { CandidateProduct, ConfirmedFact, ConversationLocale, SystemConfigurationGraph } from "./types";

const APPROVE = /(?:اعتمد|موافق|وافق|approve|confirm|accept|go\s+with)/iu;
const RECOMMEND = /(?:اختار\s*لي|اختارلي|رشح|recommend|choose\s+for\s+me|best\s+fit)/iu;

function selectionFacts(candidate: CandidateProduct, evidence: string, now: string) {
  const prefix = `product.selection.${candidate.componentKey}.`;
  const values: Record<string, string | number | boolean> = {
    id: candidate.id,
    componentKey: candidate.componentKey,
    name: candidate.name,
    source: candidate.source,
  };
  if (candidate.nameAr) values.nameAr = candidate.nameAr;
  if (candidate.nameEn) values.nameEn = candidate.nameEn;
  if (candidate.brand) values.brand = candidate.brand;
  if (candidate.model) values.model = candidate.model;
  if (candidate.sourceUrl) values.sourceUrl = candidate.sourceUrl;
  if (candidate.sourceTitle) values.sourceTitle = candidate.sourceTitle;
  if (candidate.source === "VERIFIED_CATALOG") values.catalogItemId = candidate.id;
  if (candidate.price !== null) values.unitPrice = candidate.price;
  if (candidate.marketPrice) {
    const market = candidate.marketPrice;
    if (market.priceAmount !== null) values["marketPrice.priceAmount"] = market.priceAmount;
    if (market.priceMin !== null) values["marketPrice.priceMin"] = market.priceMin;
    if (market.priceMax !== null) values["marketPrice.priceMax"] = market.priceMax;
    values["marketPrice.priceCurrency"] = market.priceCurrency;
    if (market.priceUnit) values["marketPrice.priceUnit"] = market.priceUnit;
    values["marketPrice.priceType"] = market.priceType;
    values["marketPrice.priceSourceUrl"] = market.priceSourceUrl;
    values["marketPrice.priceSourceTitle"] = market.priceSourceTitle;
    values["marketPrice.priceObservedAt"] = market.priceObservedAt;
  }
  if (candidate.capabilities) {
    for (const [key, value] of Object.entries(candidate.capabilities)) if (value !== undefined) values[`capabilities.${key}`] = value;
  }
  return Object.fromEntries(Object.entries(values).map(([field, value]) => [prefix + field, {
    key: prefix + field, value, provenance: "USER_APPROVED", evidence, updatedAt: now,
  } satisfies ConfirmedFact]));
}

function explicitlyNamedCandidate(candidates: CandidateProduct[], message: string) {
  const normalized = message.normalize("NFKC").toLocaleLowerCase();
  return candidates.find((candidate) => [candidate.model, candidate.brand, candidate.name, candidate.nameAr, candidate.nameEn]
    .filter((value): value is string => Boolean(value && value.trim().length >= 3))
    .some((value) => normalized.includes(value.normalize("NFKC").toLocaleLowerCase())));
}

export function resolveProductSelection(input: {
  graph: SystemConfigurationGraph | undefined;
  confirmed: Record<string, ConfirmedFact>;
  message: string;
  locale: ConversationLocale;
  now: string;
}) {
  const candidates = input.graph?.candidateProducts ?? [];
  if (!candidates.length) return { confirmed: input.confirmed, reply: null as string | null };
  const groups = new Map<string, CandidateProduct[]>();
  for (const candidate of candidates) groups.set(candidate.componentKey, [...(groups.get(candidate.componentKey) ?? []), candidate].slice(0, 3));

  if (RECOMMEND.test(input.message) && !APPROVE.test(input.message)) {
    const recommendations = [...groups.values()].flatMap((options) => options.slice(0, 1));
    const rows = recommendations.map((candidate) => [candidate.brand, candidate.model, candidate.name].filter(Boolean).join(" - "));
    return {
      confirmed: input.confirmed,
      reply: input.locale === "ar"
        ? `ترشيحي المبدئي: ${rows.join("، ")}. هذا ترشيح فقط ولم أعتمده. هل توافق على اختياره؟`
        : `My provisional recommendation is ${rows.join(", ")}. This is a recommendation only and is not approved. Would you like to approve it?`,
    };
  }

  if (!APPROVE.test(input.message)) return { confirmed: input.confirmed, reply: null as string | null };
  const selected: CandidateProduct[] = [];
  const named = explicitlyNamedCandidate(candidates, input.message);
  if (named) selected.push(named);
  else {
    const option = input.message.match(/(?:الخيار|اختيار|option|choice)?\s*([1-3])(?:\b|\s|$)/iu);
    if (option) {
      const index = Number(option[1]) - 1;
      for (const options of groups.values()) if (options[index]) selected.push(options[index]);
    }
  }
  if (!selected.length) return { confirmed: input.confirmed, reply: null as string | null };
  return {
    confirmed: Object.assign({}, input.confirmed, ...selected.map((candidate) => selectionFacts(candidate, input.message.trim(), input.now))),
    reply: input.locale === "ar" ? "تم اعتماد اختيار المنتج وتحديث قائمة المبيعات المحكومة." : "The product selection is approved and the governed Sales BOM is updated.",
  };
}
