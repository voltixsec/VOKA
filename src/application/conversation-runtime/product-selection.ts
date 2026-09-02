import type { CandidateProduct, ConfirmedFact, ConversationLocale, SystemConfigurationGraph, WorkspacePatch } from "./types";
import { buildSystemConfigurationGraph } from "./solution-graph";

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
  if (candidate.source === "VERIFIED_CATALOG" && candidate.price !== null) values.unitPrice = candidate.price;
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
  if (candidate.componentKey === "SURVEILLANCE_HDD") {
    const capacity = driveCapacity(candidate);
    if (capacity) values["capabilities.capacityTb"] = capacity;
  }
  return Object.fromEntries(Object.entries(values).map(([field, value]) => [prefix + field, {
    key: prefix + field, value, provenance: "USER_APPROVED", evidence, updatedAt: now,
  } satisfies ConfirmedFact]));
}

function explicitlyNamedCandidate(candidates: CandidateProduct[], message: string) {
  const normalized = message.normalize("NFKC").toLocaleLowerCase();
  const exact = candidates.filter((candidate) => [candidate.model, candidate.name, candidate.nameAr, candidate.nameEn]
    .filter((value): value is string => Boolean(value && value.trim().length >= 3))
    .some((value) => normalized.includes(value.normalize("NFKC").toLocaleLowerCase())));
  if (exact.length) return exact;
  const branded = candidates.filter((candidate) => candidate.brand && normalized.includes(candidate.brand.normalize("NFKC").toLocaleLowerCase()));
  return branded.length === 1 ? branded : [];
}

function driveCapacity(candidate: CandidateProduct) {
  const explicit = candidate.capabilities?.capacityTb;
  if (typeof explicit === "number" && Number.isFinite(explicit) && explicit > 0) return explicit;
  const values = [...new Set([candidate.name, candidate.nameEn, candidate.model].flatMap((value) =>
    [...(value ?? "").matchAll(/\b(\d+(?:\.\d+)?)\s*TB\b/giu)].map((match) => Number(match[1]))))];
  return values.length === 1 && values[0] > 0 ? values[0] : null;
}

export function resolveProductSelection(input: {
  graph: SystemConfigurationGraph | undefined;
  confirmed: Record<string, ConfirmedFact>;
  message: string;
  locale: ConversationLocale;
  now: string;
  patches?: WorkspacePatch[];
  engineeringRules?: import("@/src/application/agentic-commercial-intelligence").ResearchedEngineeringRule[];
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

  const userPatches = (input.patches ?? []).filter((patch) => patch.path.startsWith("products.candidates.")
    && ["USER_EXPLICIT", "USER_CORRECTION"].includes(patch.provenance) && patch.evidence.trim()
    && input.message.normalize("NFKC").toLocaleLowerCase().includes(patch.evidence.normalize("NFKC").toLocaleLowerCase()));
  let confirmed = { ...input.confirmed };
  const rejected = candidates.filter((candidate) => userPatches.some((patch) => patch.operation === "REJECT" && patch.path === `products.candidates.${candidate.id}`));
  for (const candidate of rejected) {
    const prefix = `product.selection.${candidate.componentKey}.`;
    if (confirmed[prefix + "id"]?.value === candidate.id) confirmed = Object.fromEntries(Object.entries(confirmed).filter(([key]) => !key.startsWith(prefix)));
  }
  const approvals = candidates.filter((candidate) => userPatches.some((patch) => patch.operation === "APPROVE" && patch.path === `products.candidates.${candidate.id}`));
  if (rejected.length && !approvals.length) return { confirmed, reply: input.locale === "ar" ? "تم إلغاء اختيار المنتج. يمكننا مراجعة البدائل." : "The product selection was removed. We can review alternatives." };
  if (!APPROVE.test(input.message) && !approvals.length) return { confirmed, reply: null as string | null };
  const selected: CandidateProduct[] = [];
  const named = explicitlyNamedCandidate(candidates, input.message);
  const option = input.message.match(/(?:الخيار|اختيار|option|choice)\s*([1-3])\b/iu);
  if (!named.length && option && groups.size !== 1) return { confirmed, reply: input.locale === "ar" ? "أي مكوّن تقصد بهذا الاختيار؟" : "Which component is this choice for?" };
  if (named.length) selected.push(...named);
  else if (approvals.length) selected.push(...approvals);
  else {
    if (option) {
      const index = Number(option[1]) - 1;
      for (const options of groups.values()) if (options[index]) selected.push(options[index]);
    }
  }
  if (!selected.length) return { confirmed, reply: null as string | null };
  const lines = input.graph?.salesBom ?? [];
  if (new Set(selected.map((candidate) => candidate.componentKey)).size !== selected.length
    || selected.some((candidate) => (lines.length > 0 && !lines.some((line) => line.id === candidate.componentKey))
      || candidates.some((other) => other.id === candidate.id && other.componentKey !== candidate.componentKey))) {
    return { confirmed: input.confirmed, reply: input.locale === "ar" ? "لم يتضح المكوّن الخاص بالاختيار. حدّد المنتج والمكوّن المقصودين." : "The selection's component is ambiguous. Please identify the product and its intended component." };
  }
  for (const candidate of selected) {
    if (candidate.source === "SUGGESTED") continue;
    const prefix = `product.selection.${candidate.componentKey}.`;
    const corrections = confirmed[prefix + "id"]?.value === candidate.id
      ? Object.fromEntries(Object.entries(confirmed).filter(([key, fact]) => key.startsWith(prefix + "capabilities.") && fact.provenance === "USER_CORRECTION")) : {};
    const next = { ...Object.fromEntries(Object.entries(confirmed).filter(([key]) => !key.startsWith(prefix))), ...selectionFacts(candidate, input.message.trim(), input.now), ...corrections };
    const graph = buildSystemConfigurationGraph(next, { engineeringRules: input.engineeringRules });
    const current = buildSystemConfigurationGraph(confirmed, { engineeringRules: input.engineeringRules });
    const storage = graph.salesBom.find((line) => line.id === "SURVEILLANCE_HDD");
    const recorder = current.salesBom.find((line) => line.id === "NVR_RECORDER");
    const bays = recorder?.commercialAttributes?.diskBays;
    const availableBays = bays && recorder?.quantity ? bays * recorder.quantity : null;
    if (candidate.componentKey === "SURVEILLANCE_HDD" && (!driveCapacity(candidate) || !availableBays || (storage?.quantity ?? Infinity) > availableBays)) {
      return { confirmed: input.confirmed, reply: input.locale === "ar"
        ? `لم أعتمد القرص: ${storage?.quantity ?? "عدد غير محدد من"} قرص مقابل ${availableBays ?? "عدد غير موثق من"} فتحة متاحة. أبقيت التكوين الحالي حتى اختيار سعة متوافقة أو تأكيد تعديل أجهزة التسجيل.`
        : `The drive was not approved: ${storage?.quantity ?? "unverified"} drives versus ${availableBays ?? "unverified"} available bays. The current architecture is unchanged; choose a compatible capacity or confirm a recorder change.` };
    }
    if (["NVR_RECORDER", "SURVEILLANCE_HDD"].includes(candidate.componentKey) && graph.compatibilityConflicts?.some((conflict) => conflict.code.startsWith("HDD_"))) {
      return { confirmed: input.confirmed, reply: input.locale === "ar" ? "لم أعتمد المنتج لوجود تعارض مع متطلبات النظام. أبقيت التكوين الحالي للمراجعة." : "The product was not approved because it conflicts with the system requirements. The current architecture is unchanged." };
    }
    confirmed = next;
  }
  return {
    confirmed,
    reply: input.locale === "ar" ? "تم اعتماد اختيار المنتج وتحديث قائمة المبيعات المحكومة." : "The product selection is approved and the governed Sales BOM is updated.",
  };
}
