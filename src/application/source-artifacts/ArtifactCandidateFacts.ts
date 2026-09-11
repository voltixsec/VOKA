import type { ObservationOrigin, ObservedFact, ObservationReliability, ObservationStatus, ObservationType, PageAttribution } from "@/src/domain/source-artifact";
import type { BrainFactProposal, FactProvenance, FactValue } from "@/src/application/conversation-runtime";

/**
 * Governed candidate facts produced from observed PDF text.
 *
 * Rules enforced here (they are structural, not advisory):
 * - a candidate is never approved by construction: the only status is
 *   `OBSERVED_PENDING_APPROVAL`;
 * - a candidate is only promotable when a governed fact key already exists for
 *   it (never a new invented key) and the user explicitly approves that value;
 * - observation-only facts (quantities, units, item rows, tags, models) have no
 *   governed fact key at all, so they can never be promoted into governed state;
 * - a conflicting governed fact is never overwritten: the conflict is recorded
 *   with both provenance chains and the governed value stays untouched;
 * - hidden/invisible text is excluded upstream (observations are visible-text
 *   only), so it can never create a candidate.
 */

/** A reference to governed state as the runtime projects it. No synthetic evidence field is invented. */
export type GovernedFactRef = { key: string; value: FactValue; provenance: FactProvenance };

export const ARTIFACT_CANDIDATE_STATUS = "OBSERVED_PENDING_APPROVAL" as const;
export type ArtifactCandidateStatus = typeof ARTIFACT_CANDIDATE_STATUS;

export type ArtifactCandidateFact = {
  id: string;
  artifactId: string;
  observationType: ObservationType;
  /** Governed fact key when one already exists; null means "observation only, no promotion path". */
  factKey: string | null;
  value: string;
  status: ArtifactCandidateStatus;
  pageNumber: number | null;
  attribution: PageAttribution;
  locator: string;
  snippet: string;
  reliability: ObservationReliability;
  limitations: string[];
  conflicts: ArtifactFactConflict[];
  /**
   * Phase 2A-2: which reading the candidate came from. Absent for native
   * readings; present with `textSource: "OCR"` and the engine identity for
   * OCR-derived candidates. Promotion rules are unchanged: OCR-derived
   * quantities, models, and tags still have no governed fact key.
   */
  origin?: ObservationOrigin;
};

export type ArtifactFactConflict = {
  key: string;
  /** The governed value already held by the workspace. */
  governedValue: string;
  governedProvenance: FactProvenance;
  /** The observed value from the artifact. Neither side is discarded. */
  observedValue: string;
  candidateId: string;
};

/** Observation types that may map onto an existing governed fact key. Anything else stays observation-only. */
const GOVERNED_KEY_BY_TYPE: Partial<Record<ObservationType, string>> = {
  PROJECT_TITLE: "project.name",
};

export function governedFactKeyFor(type: ObservationType): string | null {
  return GOVERNED_KEY_BY_TYPE[type] ?? null;
}

const APPROVAL_UTTERANCE = /(?:اعتمد|اعتمدها|اعتمده|وافق|موافق|confirm|confirmed|approve|approved|accept|accepted|go\s+with)/iu;

function normalize(value: string) {
  return value.normalize("NFKC").trim().toLocaleLowerCase();
}

function candidateId(artifactId: string, observation: ObservedFact) {
  return `${artifactId}:${observation.type}:${observation.pageNumber ?? "unattributed"}:${observation.evidence.lineNumber ?? "na"}:${normalize(observation.value)}`;
}

/**
 * Turns observed facts into non-approved candidates and records conflicts
 * against governed state without mutating it.
 */
export function proposeArtifactCandidates(input: {
  artifactId: string;
  observations: ObservedFact[];
  governedFacts?: GovernedFactRef[];
  existing?: ArtifactCandidateFact[];
}): { candidates: ArtifactCandidateFact[]; conflicts: ArtifactFactConflict[] } {
  const confirmed = new Map((input.governedFacts ?? []).map((fact) => [fact.key, fact]));
  const conflicts: ArtifactFactConflict[] = [];
  const candidates: ArtifactCandidateFact[] = input.observations.map((observation) => {
    const id = candidateId(input.artifactId, observation);
    const factKey = governedFactKeyFor(observation.type);
    const observationConflicts: ArtifactFactConflict[] = [];
    const governed = factKey ? confirmed.get(factKey) : undefined;
    if (factKey && governed && String(governed.value) !== observation.value) {
      observationConflicts.push({
        key: factKey,
        governedValue: String(governed.value),
        governedProvenance: governed.provenance,
        observedValue: observation.value,
        candidateId: id,
      });
    }
    conflicts.push(...observationConflicts);
    return {
      id,
      artifactId: input.artifactId,
      observationType: observation.type,
      factKey,
      value: observation.value,
      status: ARTIFACT_CANDIDATE_STATUS,
      pageNumber: observation.pageNumber,
      attribution: observation.attribution,
      locator: observation.evidence.locator,
      snippet: observation.evidence.snippet,
      reliability: observation.reliability,
      limitations: [...observation.limitations],
      conflicts: observationConflicts,
      ...(observation.origin ? { origin: observation.origin } : {}),
    };
  });
  return { candidates: mergeArtifactCandidates(input.existing ?? [], candidates), conflicts };
}

/**
 * Merges incoming candidates into existing ones without resolving anything:
 * the same observation keeps its identity, and two different observed values for
 * the same governed key are both retained so a reviewer sees the conflict.
 */
export function mergeArtifactCandidates(existing: ArtifactCandidateFact[], incoming: ArtifactCandidateFact[]): ArtifactCandidateFact[] {
  const byId = new Map<string, ArtifactCandidateFact>();
  for (const candidate of existing) byId.set(candidate.id, candidate);
  const out = [...existing];
  for (const candidate of incoming) {
    if (byId.has(candidate.id)) continue;
    byId.set(candidate.id, candidate);
    out.push(candidate);
  }
  return out;
}

/**
 * Builds a governed promotion proposal only when the user explicitly approved
 * the exact observed value. Returns null otherwise, so nothing is promoted by
 * default. The proposal still has to pass the existing fact reducer, which
 * enforces the allowed-fact whitelist and provenance precedence.
 */
export function promoteArtifactCandidate(candidate: ArtifactCandidateFact, input: { userMessage: string; now: string }): BrainFactProposal | null {
  if (!candidate.factKey) return null;
  const message = input.userMessage.trim();
  if (!message || !APPROVAL_UTTERANCE.test(message)) return null;
  if (!normalize(message).includes(normalize(candidate.value))) return null;
  return {
    key: candidate.factKey,
    value: candidate.value,
    provenance: "USER_EXPLICIT",
    evidence: candidate.value,
  };
}

/** Renders a conflict without choosing a winner: both chains stay visible. */
export function renderArtifactConflict(conflict: ArtifactFactConflict, locale: "ar" | "en") {
  return locale === "ar"
    ? `يوجد تعارض: القيمة المعتمدة حالياً "${conflict.governedValue}" (${conflict.governedProvenance}) مقابل ما ورد في الملف "${conflict.observedValue}"؛ لن أستبدل القيمة المعتمدة تلقائياً.`
    : `Conflict: the governed value is "${conflict.governedValue}" (${conflict.governedProvenance}) while the file shows "${conflict.observedValue}"; the governed value was not replaced automatically.`;
}

export type { ObservationStatus };
