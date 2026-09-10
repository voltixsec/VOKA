import type { BrainFactProposal, CandidateFact, ConfirmedFact, FactProvenance } from "./types";

const ALLOWED_FACTS = new Set([
  "system.identity", "system.jurisdiction", "system.quantity", "system.numberOfStops", "system.vehicleClass", "system.capacity",
  "scope.type", "customer.name", "project.name", "attention.name", "commercial.payment", "commercial.delivery", "commercial.warranty", "commercial.validity",
  "system.areaM2", "system.tileSize", "system.qualityTier", "system.cameraCount", "system.resolutionMp", "system.environment", "system.cameraType", "system.storageDays", "system.layersCount",
  "document.target",
  "system.recorderCount",
  "product.selection.NVR_RECORDER.capabilities.diskBays",
  "product.origin", "product.brand", "product.model",
  "ceramic.wastagePercent",
  "ceramic.adhesiveBags",
  "ceramic.groutKg",
  "ceramic.skirtingLm",
  "ceramic.skirtingHeightCm",
  "ceramic.levelingThicknessCm",
  "ceramic.packageAreaM2",
]);
const PRECEDENCE: Record<FactProvenance, number> = { DEFAULT: 0, AI_INFERRED: 1, RESEARCHED: 2, DETERMINISTIC_DERIVATION: 3, TRUSTED_PROFILE: 4, VERIFIED_DATABASE: 5, VERIFIED_DOCUMENT: 6, USER_EXPLICIT: 7, USER_APPROVED: 8, USER_CORRECTION: 9 };
const NON_VALUES = /(?:مش\s*عارف|ما\s*عرفش|اختارلي|إيه\s*(?:رأيك|الأنسب|المتاح)|ساعدني|i\s+don'?t\s+know|what\s+do\s+you\s+recommend|recommend|help\s+me)/iu;

function normalized(value: string) { return value.normalize("NFKC").trim().toLocaleLowerCase(); }

export function reduceFactProposals(
  current: Record<string, ConfirmedFact>,
  proposals: BrainFactProposal[],
  userMessage: string,
  now: string,
  proposalGroupId: string | null = null,
) {
  const confirmed = { ...current };
  const candidates: CandidateFact[] = [];

  for (const proposal of proposals.slice(0, 24)) {
    let rejectionReason: string | null = null;
    let status: CandidateFact["status"] = "COMMITTED";

    if (!ALLOWED_FACTS.has(proposal.key)) {
      rejectionReason = "FACT_KEY_NOT_ALLOWED";
      status = "REJECTED";
    } else if (["system.recorderCount", "product.selection.NVR_RECORDER.capabilities.diskBays"].includes(proposal.key)
      && (typeof proposal.value !== "number" || !Number.isInteger(proposal.value) || proposal.value <= 0 || proposal.value > 1024)) {
      rejectionReason = "FACT_VALUE_INVALID";
      status = "REJECTED";
    } else if (
      !["string", "number", "boolean"].includes(typeof proposal.value) ||
      (
        typeof proposal.value === "string" &&
        (!proposal.value.trim() || proposal.value.length > 500 || NON_VALUES.test(proposal.value.trim()))
      )
    ) {
      rejectionReason = "FACT_VALUE_INVALID";
      status = "REJECTED";
    } else if (
      (proposal.provenance === "USER_EXPLICIT" || proposal.provenance === "USER_CORRECTION") &&
      (
        !proposal.evidence.trim() ||
        !normalized(userMessage).includes(normalized(proposal.evidence))
      )
    ) {
      rejectionReason = "USER_EVIDENCE_NOT_VERBATIM";
      status = "REJECTED";
    } else if (
      proposal.provenance === "AI_INFERRED" ||
      proposal.provenance === "RESEARCHED"
    ) {
      rejectionReason = "REQUIRES_USER_CONFIRMATION";
      status = "PENDING_APPROVAL";
    }

    const fact: ConfirmedFact = {
      ...proposal,
      evidence: proposal.evidence.trim(),
      updatedAt: now,
    };

    const existing = confirmed[proposal.key];

    if (
      status === "COMMITTED" &&
      !rejectionReason &&
      existing &&
      PRECEDENCE[existing.provenance] > PRECEDENCE[proposal.provenance]
    ) {
      rejectionReason = "LOWER_PRECEDENCE";
      status = "REJECTED";
    }

    if (status === "COMMITTED" && !rejectionReason) {
      confirmed[proposal.key] = fact;
    }

    candidates.push({
      ...fact,
      status,
      rejectionReason,
      proposalGroupId,
    });
  }

  return { confirmed, candidates };
}

const APPROVAL_UTTERANCE =
  /(?:\u0627\u0639\u062a\u0645\u062f|\u0627\u0639\u062a\u0645\u062f\u0647\u0627|\u0627\u0639\u062a\u0645\u062f\u0647\u0645|\u0645\u0648\u0627\u0641\u0642|\u0648\u0627\u0641\u0642|approve|approved|confirm|confirmed|accept|accepted|go\s+with\s+(?:it|them|these))/iu;
const REJECTION_UTTERANCE =
  /^(?:(?:no|nope)(?:[\s،,!.؟?].*)?|(?:reject|rejected)(?:[\s،,!.؟?].*)?|not\s+(?:this|that|these|those)|don't\s+use\s+(?:this|that|them)|(?:لا|لأ|مش\s+موافق|غير\s+موافق|ارفض|ارفضها|مش\s+ده|مش\s+دي|مش\s+دول)(?:[\s،,!.؟?].*)?)$/iu;

/** Explicitly reject the latest pending proposal group without erasing an older confirmed fact. */
export function rejectPendingCandidateFacts(
  candidates: CandidateFact[],
  userMessage: string,
  now: string,
) {
  if (APPROVAL_UTTERANCE.test(userMessage.trim()) || !REJECTION_UTTERANCE.test(userMessage.trim())) {
    return { candidates: [...candidates], rejectedKeys: [] as string[] };
  }
  const pending = candidates.filter((candidate) => candidate.status === "PENDING_APPROVAL");
  const latest = pending.at(-1);
  if (!latest) return { candidates: [...candidates], rejectedKeys: [] as string[] };
  const group = latest.proposalGroupId
    ? pending.filter((candidate) => candidate.proposalGroupId === latest.proposalGroupId)
    : pending.filter((candidate) => candidate.updatedAt === latest.updatedAt);
  const groupMembers = new Set(group);
  const rejectedKeys = [...new Set(group.map((candidate) => candidate.key))];
  return {
    candidates: candidates.map((candidate) => groupMembers.has(candidate)
      ? { ...candidate, status: "REJECTED" as const, rejectionReason: "USER_REJECTED", updatedAt: now }
      : candidate),
    rejectedKeys,
  };
}

export function promotePendingCandidateFacts(
  current: Record<string, ConfirmedFact>,
  candidates: CandidateFact[],
  userMessage: string,
  now: string,
) {
  const evidence = userMessage.trim();
  const confirmed = { ...current };

  if (!evidence || !APPROVAL_UTTERANCE.test(evidence)) {
    return {
      confirmed,
      candidates: [...candidates],
      promotedKeys: [] as string[],
    };
  }

  const pending = candidates.filter(
    (candidate) =>
      candidate.status === "PENDING_APPROVAL" &&
      (candidate.provenance === "AI_INFERRED" || candidate.provenance === "RESEARCHED"),
  );

  const latest = pending.at(-1);

  if (!latest) {
    return {
      confirmed,
      candidates: [...candidates],
      promotedKeys: [] as string[],
    };
  }

  const group = latest.proposalGroupId
    ? pending.filter(
        (candidate) => candidate.proposalGroupId === latest.proposalGroupId,
      )
    : pending.filter(
        (candidate) => candidate.updatedAt === latest.updatedAt,
      );

  const promotedKeys = new Set<string>();

  for (const candidate of group) {
    const existing = confirmed[candidate.key];

    if (
      existing &&
      PRECEDENCE[existing.provenance] > PRECEDENCE.USER_APPROVED
    ) {
      continue;
    }

    confirmed[candidate.key] = {
      key: candidate.key,
      value: candidate.value,
      provenance: "USER_APPROVED",
      evidence,
      updatedAt: now,
    };

    promotedKeys.add(candidate.key);
  }

  const updatedCandidates = candidates.map((candidate) => {
    if (
      candidate.status !== "PENDING_APPROVAL" ||
      !promotedKeys.has(candidate.key) ||
      !group.some(
        (member) =>
          member.key === candidate.key &&
          member.proposalGroupId === candidate.proposalGroupId &&
          member.updatedAt === candidate.updatedAt,
      )
    ) {
      return candidate;
    }

    return {
      ...candidate,
      provenance: "USER_APPROVED" as const,
      evidence,
      updatedAt: now,
      status: "COMMITTED" as const,
      rejectionReason: null,
    };
  });

  return {
    confirmed,
    candidates: updatedCandidates,
    promotedKeys: [...promotedKeys],
  };
}
