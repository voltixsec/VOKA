import type { LiveResultItem, LiveResultStatus, StructuredLiveResult, WorkingCommercialDraft } from "./types";
import { projectSystemUnderstanding } from "./system-understanding";

function sourceStatus(source: string): LiveResultStatus {
  if (source.startsWith("USER_")) return "CONFIRMED";
  if (source === "VERIFIED_DATABASE" || source === "VERIFIED_DOCUMENT" || source === "TRUSTED_PROFILE" || source === "DETERMINISTIC_DERIVATION") return "VERIFIED";
  if (source === "RESEARCHED" || source === "AI_INFERRED" || source === "DEFAULT") return "PROVISIONAL";
  return "NEEDS_CONFIRMATION";
}

const labels: Record<string, [string, string]> = {
  "system.identity": ["النظام", "System"], "system.jurisdiction": ["الدولة", "Country / jurisdiction"],
  "system.elevatorQuantity": ["عدد المصاعد", "Elevators"], "system.numberOfStops": ["الطوابق", "Floors / stops"],
  "system.capacity": ["الحمولة", "Capacity"], "system.vehicleClass": ["نوع المركبات", "Vehicle class"],
  "system.cameraCount": ["عدد الكاميرات", "Cameras"], "system.resolutionMp": ["الدقة", "Resolution"],
  "system.storageDays": ["مدة التسجيل", "Recording retention"], "system.projectContext": ["سياق المشروع", "Project context"],
  customerMention: ["العميل", "Customer"], projectName: ["المشروع", "Project"], attentionName: ["إلى عناية", "Attention"], paymentTerms: ["الدفع", "Payment"],
  delivery: ["التسليم", "Delivery"], warranty: ["الضمان", "Warranty"], expiryDate: ["الصلاحية", "Validity"],
  validity: ["صلاحية العرض", "Validity"], currencyCode: ["العملة", "Currency"], scopeType: ["النطاق", "Scope"],
};

const summaryOrder = ["system.identity", "system.jurisdiction", "scopeType", "system.cameraCount", "system.resolutionMp", "system.storageDays", "system.elevatorQuantity", "system.numberOfStops", "system.capacity", "system.vehicleClass", "customerMention", "projectName", "attentionName", "validity", "expiryDate"];
const pendingCommercial: Record<string, [string, string]> = {
  paymentTerms: ["الدفع", "Payment"], delivery: ["التسليم", "Delivery"], warranty: ["الضمان", "Warranty"], expiryDate: ["صلاحية العرض", "Validity"],
};

function displayValues(key: string, value: unknown) {
  const raw = String(value);
  if (key === "system.identity" && /vehicle|car\s*(?:elevator|lift)|مصعد\s*(?:سيارات|عربيات)/i.test(raw)) return { value: raw, valueAr: "نظام مصعد سيارات", valueEn: "Vehicle Elevator" };
  if (key === "system.identity" && /CCTV|surveillance|كاميرات\s*مراقبة/i.test(raw)) return { value: raw, valueAr: "نظام كاميرات مراقبة", valueEn: "CCTV security system" };
  if (key === "system.jurisdiction" && /kuwait|الكويت/i.test(raw)) return { value: raw, valueAr: "الكويت", valueEn: "Kuwait" };
  if (key === "scopeType") {
    const scopes: Record<string, [string, string]> = {
      SUPPLY_AND_INSTALLATION: ["توريد وتركيب", "Supply and installation"], SUPPLY_ONLY: ["توريد فقط", "Supply only"], INSTALLATION_ONLY: ["تركيب فقط", "Installation only"],
      MAINTENANCE: ["صيانة", "Maintenance"], CONSULTATION: ["استشارة", "Consultation"], SERVICE: ["خدمة", "Service"],
    };
    const scope = scopes[raw];
    if (scope) return { value: raw, valueAr: scope[0], valueEn: scope[1] };
  }
  if (key === "system.vehicleClass" && raw === "SUV") return { value: raw, valueAr: "سيارات SUV", valueEn: "SUV" };
  if (key === "system.cameraCount") return { value: raw, valueAr: `${raw} كاميرا`, valueEn: `${raw} cameras` };
  if (key === "system.resolutionMp") return { value: raw, valueAr: `${raw}MP`, valueEn: `${raw}MP` };
  if (key === "system.storageDays") return { value: raw, valueAr: `${raw} يوم`, valueEn: `${raw} days` };
  return { value: raw, valueAr: raw, valueEn: raw };
}

function localizedDisplayValues(draft: WorkingCommercialDraft, key: string, value: unknown) {
  const smartSystem = draft.canonicalProposal?.smartSystem;
  if (key === "system.identity" && smartSystem) {
    return { value: String(value), valueAr: smartSystem.systemNameAr, valueEn: smartSystem.systemNameEn };
  }
  return displayValues(key, value);
}

export function projectStructuredResult(draft: WorkingCommercialDraft): StructuredLiveResult {
  const facts: LiveResultItem[] = [];
  const ledgerFacts = draft.transactionalState?.ledger.facts ?? {};
  for (const [key, fact] of Object.entries(ledgerFacts)) {
    const label = labels[key];
    if (!label || typeof fact.value === "object") continue;
    const values = localizedDisplayValues(draft, key, fact.value === "DEFERRED" ? "DEFERRED" : fact.value);
    facts.push({ key, labelAr: label[0], labelEn: label[1], ...values, status: fact.value === "DEFERRED" ? "DEFERRED" : sourceStatus(fact.source) });
  }
  // Compatibility for drafts created before the transactional ledger was
  // introduced. The UI still consumes this one projection, never raw fields.
  if (!Object.keys(ledgerFacts).length) {
    const proposal = draft.canonicalProposal;
    const legacyValues: Record<string, unknown> = {
      "system.identity": proposal?.smartSystem?.systemNameEn ?? proposal?.agenticState?.systemName,
      "system.jurisdiction": proposal?.agenticState?.provisionalSystem?.jurisdiction,
      customerMention: proposal?.customer?.mention ?? proposal?.customer?.name ?? draft.fields.customerMention,
      projectName: proposal?.proposal?.projectName,
      attentionName: proposal?.proposal?.attentionName,
      expiryDate: proposal?.proposal?.expiryDate,
      scopeType: proposal?.proposal?.scopeType ?? draft.fields.scopeType,
    };
    for (const [key, raw] of Object.entries(legacyValues)) {
      const label = labels[key];
      if (raw == null || !label) continue;
      // Legacy payloads have no source ledger, so their values may be shown in
      // the summary but must never masquerade as confirmed inline facts.
      facts.push({ key, labelAr: label[0], labelEn: label[1], ...localizedDisplayValues(draft, key, raw), status: "PROVISIONAL" });
    }
  }
  for (const [index, line] of (draft.canonicalProposal?.lines ?? []).entries()) {
    facts.push({ key: `line.${index}`, labelAr: line.itemNameAr ?? line.itemName, labelEn: line.itemNameEn ?? line.itemName, value: line.quantity == null ? "?" : String(line.quantity), status: line.unitPrice == null ? "PRICE_REQUIRED" : line.catalogItemId ? "VERIFIED" : "PROVISIONAL" });
  }
  const evidence = draft.canonicalProposal?.agenticState?.provisionalSystem?.evidence.map(({ title, url, publisher }) => ({ title, url, publisher })) ?? [];
  const byKey = new Map(facts.map((fact) => [fact.key, fact]));
  const summary = summaryOrder.flatMap((key) => {
    if (key === "expiryDate" && byKey.has("validity")) return [];
    const fact = byKey.get(key);
    return fact ? [fact] : [];
  });
  const stillNeeded = draft.missingRequired.flatMap((missing) => {
    const field = missing.sourceField ?? missing.key;
    const label = pendingCommercial[field];
    if (!label || missing.state === "DEFERRED" || (field === "expiryDate" && byKey.has("validity")) || byKey.has(field)) return [];
    return [{ key: field, labelAr: label[0], labelEn: label[1] }];
  }).filter((item, index, all) => all.findIndex((candidate) => candidate.key === item.key) === index);
  const lines = draft.canonicalProposal?.lines ?? [];
  return {
    summary, stillNeeded,
    commercial: { lineCount: lines.length, priceRequiredCount: lines.filter((line) => line.unitPrice == null).length, draftReady: draft.status === "READY_FOR_REVIEW" },
    facts, evidence, systemUnderstanding: projectSystemUnderstanding(draft), readiness: draft.readinessStage ?? "CONVERSATION_UNDERSTOOD",
  };
}
