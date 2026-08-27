import { classifyCommercialOperation } from "../commercial-entry";
import { evaluateFormRequirements } from "./form-requirements";
import type { AdvanceConversationInput, ConversationalOperation, DraftFields, DraftLine, WorkingCommercialDraft } from "./types";
import type { CustomerCandidate } from "./types";
import { normalizeTechnicalSpeech } from "./technical-speech";

const SUPPORTED = new Set<ConversationalOperation>(["QUOTATION", "INVOICE", "CONTRACT", "SALES_ORDER", "DRAWING_TAKEOFF"]);

function clean(value: string) { return value.replace(/\s+/g, " ").trim(); }

function extractCustomer(text: string): string | null {
  const patterns = [
    /(?:العميل|للعميل|لشركة|شركة)\s+(.+?)(?=\s+(?:والدفع|الدفع|بشروط|توريد|تركيب|عدد|\d)|[،,;.]|$)/i,
    /(?:customer|client|for)\s+(.+?)(?=\s+(?:with|payment|terms|supply|install|\d)|[,;.]|$)/i,
  ];
  for (const pattern of patterns) {
    const match = clean(text.match(pattern)?.[1] ?? "");
    if (match && match.length <= 200) return match;
  }
  return null;
}

function extractLines(text: string): DraftLine[] {
  const matches = [...text.matchAll(/(\d+(?:\.\d+)?)\s*(?!%)(كامير(?:ا|ات)|جهاز|أجهزة|قطعة|قطع|وحدة|وحدات|units?|pcs?|pieces?|cameras?|items?)\s*([^،,;.\n]*)/gi)];
  return matches.map((match) => ({
    quantity: Number(match[1]),
    itemName: clean(`${match[2]} ${match[3]}`).slice(0, 300),
  })).filter((line) => line.itemName && line.quantity && line.quantity > 0);
}

function extractCurrency(text: string): string | null {
  const code = text.match(/\b(KWD|USD|EUR|SAR|AED)\b/i)?.[1];
  if (code) return code.toUpperCase();
  if (/د\s*\.?\s*ك|دينار كويتي/i.test(text)) return "KWD";
  return null;
}

function extractPaymentTerms(text: string): string | null {
  const match = text.match(/((?:الدفع|شروط الدفع)[^،,;.]*|\d+(?:\.\d+)?%\s*مقدم[^،,;.]*|(?:payment terms?|pay)\s+[^,;.]+)/i)?.[1];
  return match ? clean(match).slice(0, 500) : null;
}

function extractScope(text: string): string | null {
  if (/توريد\s*(?:و|مع)\s*تركيب|supply and install|with installation/i.test(text)) return "SUPPLY_AND_INSTALLATION";
  if (/توريد فقط|supply only/i.test(text)) return "SUPPLY_ONLY";
  if (/تركيب فقط|installation only/i.test(text)) return "INSTALLATION_ONLY";
  if (/خدمة|service/i.test(text)) return "SERVICE";
  return null;
}

function extractSource(text: string): string | null {
  return text.match(/\b(?:Q(?:T)?[-/]?\d[\w/-]*|quotation\s+(?:number\s*)?[\w/-]+|عرض\s+السعر\s+(?:رقم\s*)?[\w/-]+)\b/i)?.[0] ?? null;
}

function mergeFields(current: DraftFields, reply: string): DraftFields {
  const normalizedReply = normalizeTechnicalSpeech(reply);
  const customerMention = extractCustomer(normalizedReply);
  const newLines = extractLines(normalizedReply);
  const lines = [...current.lines];
  for (const line of newLines) {
    if (!lines.some((existing) => existing.quantity === line.quantity && existing.itemName.toLowerCase() === line.itemName.toLowerCase())) lines.push(line);
  }
  return {
    customerId: customerMention && customerMention !== current.customerMention ? null : current.customerId,
    customerMention: customerMention ?? current.customerMention,
    currencyCode: extractCurrency(normalizedReply) ?? current.currencyCode,
    paymentTerms: extractPaymentTerms(normalizedReply) ?? current.paymentTerms,
    scopeType: extractScope(normalizedReply) ?? current.scopeType,
    sourceReference: extractSource(normalizedReply) ?? current.sourceReference,
    lines,
  };
}

function clarification(missing: WorkingCommercialDraft["missingRequired"]) {
  if (!missing.length) return null;
  const labelsAr = missing.map((field) => field.labelAr).join("، ");
  const labelsEn = missing.map((field) => field.labelEn).join(", ");
  const first = missing[0].key;
  const suggestions = first === "lines"
    ? [{ ar: "أريد إضافة منتج", en: "I need a product", reply: "أريد إضافة منتج" }, { ar: "أريد إضافة خدمة", en: "I need a service", reply: "أريد إضافة خدمة" }]
    : first === "userIntent"
      ? [{ ar: "حصر الكميات فقط", en: "Quantity takeoff only", reply: "حصر الكميات فقط" }]
      : [];
  return {
    ar: `لإكمال المسودة، أحتاج: ${labelsAr}.`,
    en: `To complete the draft, I still need: ${labelsEn}.`,
    suggestions,
  };
}

export class ConversationalDraftEngine {
  advance(input: AdvanceConversationInput): WorkingCommercialDraft {
    const reply = clean(input.reply);
    if (!reply) throw new Error("CONVERSATION_REPLY_REQUIRED");
    const classified = classifyCommercialOperation(reply).operation;
    const operation = input.draft?.operation ?? input.operation ?? (classified && SUPPORTED.has(classified as ConversationalOperation) ? classified as ConversationalOperation : null);
    if (!operation) throw new Error("CONVERSATION_OPERATION_REQUIRED");
    if (input.draft && input.operation && input.operation !== input.draft.operation) throw new Error("CONVERSATION_OPERATION_IMMUTABLE");

    const turns = [...(input.draft?.turns ?? []), { source: input.replySource, text: reply }];
    const contextText = turns.map((turn) => turn.text).join("\n");
    const fields = mergeFields(input.draft?.fields ?? {
      customerId: null, customerMention: null, currencyCode: null, paymentTerms: null, scopeType: null, sourceReference: null, lines: [],
    }, reply);
    const attachment = input.attachment === undefined ? input.draft?.attachment ?? null : input.attachment;
    const requirements = evaluateFormRequirements(operation, fields, Boolean(attachment), contextText);
    const status = requirements.missingRequired.length ? "NEEDS_CLARIFICATION" : "READY_FOR_REVIEW";
    const draft: WorkingCommercialDraft = {
      id: input.draft?.id ?? crypto.randomUUID(), operation, locale: input.locale, fields, attachment,
      customerResolution: input.draft?.customerResolution ?? { status: "UNRESOLVED", candidates: [] },
      turns, contextText, ...requirements, status, clarification: null, requiresHumanReview: true, executed: false,
    };
    draft.clarification = clarification(draft.missingRequired);
    return draft;
  }
}

function comparable(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export function applyCustomerResolution(draft: WorkingCommercialDraft, candidates: CustomerCandidate[]): WorkingCommercialDraft {
  if (draft.operation === "SALES_ORDER" || draft.operation === "DRAWING_TAKEOFF" || !draft.fields.customerMention) return draft;
  const mention = comparable(draft.fields.customerMention);
  const names = (candidate: CustomerCandidate) => [candidate.name, ...(candidate.aliases ?? [])].map(comparable).filter(Boolean);
  const exact = candidates.filter((candidate) => names(candidate).includes(mention));
  const plausible = exact.length ? exact : candidates.filter((candidate) => {
    return names(candidate).some((name) => name.includes(mention) || mention.includes(name));
  });
  const status = plausible.length === 1 ? "MATCHED" : plausible.length > 1 ? "AMBIGUOUS" : "NOT_FOUND";
  const fields = { ...draft.fields, customerId: status === "MATCHED" ? plausible[0].id : null };
  const requirements = evaluateFormRequirements(draft.operation, fields, Boolean(draft.attachment), draft.contextText);
  const resolved: WorkingCommercialDraft = { ...draft, fields, customerResolution: { status, candidates: plausible.slice(0, 5) }, ...requirements, status: requirements.missingRequired.length ? "NEEDS_CLARIFICATION" : "READY_FOR_REVIEW" };
  resolved.clarification = clarification(resolved.missingRequired);
  if (status === "AMBIGUOUS") resolved.clarification = {
    ar: "وجدت أكثر من عميل مطابق. اختر العميل الصحيح.", en: "I found more than one matching customer. Choose the correct customer.",
    suggestions: plausible.slice(0, 5).map((candidate) => ({ ar: candidate.name, en: candidate.name, reply: `العميل ${candidate.name}` })),
  };
  if (status === "NOT_FOUND") resolved.clarification = {
    ar: `لم أجد العميل «${draft.fields.customerMention}» في قاعدة العملاء. راجع الاسم أو أنشئ العميل أولاً.`,
    en: `Customer “${draft.fields.customerMention}” was not found. Check the name or create the customer first.`, suggestions: [],
  };
  return resolved;
}
