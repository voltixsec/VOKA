import type { BrainFactProposal, CandidateFact, ConfirmedFact, FactProvenance } from "./types";

const ALLOWED_FACTS = new Set([
  "system.identity", "system.jurisdiction", "system.quantity", "system.numberOfStops", "system.vehicleClass", "system.capacity",
  "scope.type", "customer.name", "project.name", "attention.name", "commercial.payment", "commercial.delivery", "commercial.warranty", "commercial.validity",
  "system.areaM2", "system.tileSize", "system.qualityTier", "system.cameraCount", "system.resolutionMp", "system.environment", "system.cameraType", "system.storageDays", "system.layersCount",
  "document.target",
  "product.origin", "product.brand", "product.model",
]);
const PRECEDENCE: Record<FactProvenance, number> = { DEFAULT: 0, AI_INFERRED: 1, RESEARCHED: 2, DETERMINISTIC_DERIVATION: 3, TRUSTED_PROFILE: 4, VERIFIED_DATABASE: 5, VERIFIED_DOCUMENT: 6, USER_EXPLICIT: 7, USER_CORRECTION: 8 };
const NON_VALUES = /(?:مش\s*عارف|ما\s*عرفش|اختارلي|إيه\s*(?:رأيك|الأنسب|المتاح)|ساعدني|i\s+don'?t\s+know|what\s+do\s+you\s+recommend|recommend|help\s+me)/iu;

function normalized(value: string) { return value.normalize("NFKC").trim().toLocaleLowerCase(); }

export function reduceFactProposals(current: Record<string, ConfirmedFact>, proposals: BrainFactProposal[], userMessage: string, now: string) {
  const confirmed = { ...current };
  const candidates: CandidateFact[] = [];
  for (const proposal of proposals.slice(0, 24)) {
    let rejectionReason: string | null = null;
    if (!ALLOWED_FACTS.has(proposal.key)) rejectionReason = "FACT_KEY_NOT_ALLOWED";
    else if (!["string", "number", "boolean"].includes(typeof proposal.value) || (typeof proposal.value === "string" && (!proposal.value.trim() || proposal.value.length > 500 || NON_VALUES.test(proposal.value.trim())))) rejectionReason = "FACT_VALUE_INVALID";
    else if ((proposal.provenance === "USER_EXPLICIT" || proposal.provenance === "USER_CORRECTION") && (!proposal.evidence.trim() || !normalized(userMessage).includes(normalized(proposal.evidence)))) rejectionReason = "USER_EVIDENCE_NOT_VERBATIM";
    else if (proposal.provenance === "AI_INFERRED" || proposal.provenance === "RESEARCHED") rejectionReason = "REQUIRES_USER_CONFIRMATION";
    const fact: ConfirmedFact = { ...proposal, evidence: proposal.evidence.trim(), updatedAt: now };
    const existing = confirmed[proposal.key];
    if (!rejectionReason && existing && PRECEDENCE[existing.provenance] > PRECEDENCE[proposal.provenance]) rejectionReason = "LOWER_PRECEDENCE";
    if (!rejectionReason) confirmed[proposal.key] = fact;
    candidates.push({ ...fact, status: rejectionReason ? "REJECTED" : "COMMITTED", rejectionReason });
  }
  return { confirmed, candidates };
}
