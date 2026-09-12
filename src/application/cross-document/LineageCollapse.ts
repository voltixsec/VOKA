/**
 * Phase 2A-10: LINEAGE COLLAPSE over the ACTUAL Phase 2A-9 derivation data.
 *
 * Hard rule: ONE DERIVATION FAMILY = ONE DOCUMENT VOICE.
 *
 * - `RVT original → IFC derived` must never become two independent documents in
 *   a comparison;
 * - `DWG original → DXF derived` must never become two independent documents;
 * - the inspectable open artifact supplies the EVIDENCE;
 * - the original proprietary artifact supplies the family root, the original
 *   filename, the original hash, the derivation method, the converter identity
 *   and version where applicable, the provider warnings (channel A), and the
 *   VOKA fidelity limitations (channel B);
 * - cross-document comparison happens ACROSS derivation families;
 * - nothing is ever inferred from a filename, an upload order, or a timestamp:
 *   lineage exists only because a persisted `ArtifactDerivation` row says so.
 *
 * FAMILY ROOT RULE: `derivationFamilyId` for 2A-10 purposes IS
 * `originalArtifactId`. Phase 2A-10 adds no family id to `ArtifactDerivation`
 * and never mutates a 2A-9 row.
 */

import type { LineageRole } from "@/src/domain/cross-document";
import { boundList } from "./materialization/ClaimBuilder";
import type { DerivationReadModel, SourceArtifactRef } from "./ports";

/** One comparison voice: everything a comparison needs about one derivation family. */
export type ComparisonVoice = {
  /** FAMILY ROOT. Equal to the original artifact id, or to the artifact itself when standalone. */
  derivationFamilyRootArtifactId: string;
  /** The artifact whose evidence is compared, when one exists. */
  evidenceArtifactId: string | null;
  /** Every artifact in the family that produced evidence. */
  evidenceArtifactIds: string[];
  lineageRole: LineageRole;
  /** The derivation that produced the evidence artifact, when there is one. */
  derivation: DerivationReadModel | null;
  /** ALL historical derivations of the family, newest first: history is never merged or dropped. */
  derivationHistory: DerivationReadModel[];
  originalFilename: string | null;
  originalHash: string | null;
  /** Channel A: provider/converter warnings, preserved verbatim. */
  warnings: string[];
  /** Channel B: static VOKA fidelity limitations, preserved verbatim. */
  fidelityLimitations: string[];
  /** True when VOKA can inspect the artifact that carries the family's evidence. */
  inspectable: boolean;
  /** True when the family's evidence artifact is missing or failed. */
  evidenceUnavailable: boolean;
  limitations: string[];
};

export type LineageCollapseResult = {
  voices: ComparisonVoice[];
  /** Families where lineage itself needs review. Never a document discrepancy. */
  fidelityReviewFamilies: string[];
  limitations: string[];
};

const INSPECTABLE_KINDS = new Set(["PDF", "IMAGE", "XLSX", "DXF", "IFC"]);
const PROPRIETARY_KINDS = new Set(["DWG", "RVT"]);

/**
 * Collapses artifacts and their persisted derivations into comparison voices.
 *
 * The function is total: an artifact with no derivation is a standalone voice,
 * an artifact with a succeeded derivation is folded into its original's voice,
 * and a failed or pending derivation keeps the original as a voice with no
 * evidence rather than inventing any.
 */
export function collapseDerivationFamilies(input: {
  artifacts: readonly SourceArtifactRef[];
  derivations: readonly DerivationReadModel[];
}): LineageCollapseResult {
  const limitations: string[] = [];
  const byId = new Map(input.artifacts.map((artifact) => [artifact.artifactId, artifact]));

  // A derivation only folds an artifact into a family when it actually
  // produced the derived artifact; a pending or failed derivation is history.
  const succeededByDerived = new Map<string, DerivationReadModel>();
  const historyByOriginal = new Map<string, DerivationReadModel[]>();
  for (const derivation of input.derivations) {
    const history = historyByOriginal.get(derivation.originalArtifactId) ?? [];
    history.push(derivation);
    historyByOriginal.set(derivation.originalArtifactId, history);
    if (derivation.status === "SUCCEEDED" && derivation.derivedArtifactId) {
      // The newest successful derivation of a given derived artifact wins as
      // the family's evidence link; older ones stay in history.
      const existing = succeededByDerived.get(derivation.derivedArtifactId);
      if (!existing || existing.createdAt < derivation.createdAt) succeededByDerived.set(derivation.derivedArtifactId, derivation);
    }
  }

  const familyOf = new Map<string, string>();
  for (const artifact of input.artifacts) {
    const deriving = succeededByDerived.get(artifact.artifactId);
    familyOf.set(artifact.artifactId, deriving ? deriving.originalArtifactId : artifact.artifactId);
  }

  const groups = new Map<string, SourceArtifactRef[]>();
  for (const artifact of input.artifacts) {
    const root = familyOf.get(artifact.artifactId) ?? artifact.artifactId;
    const list = groups.get(root) ?? [];
    list.push(artifact);
    groups.set(root, list);
  }

  const fidelityReviewFamilies: string[] = [];
  const voices: ComparisonVoice[] = [];
  for (const [root, members] of groups) {
    const rootArtifact = byId.get(root) ?? null;
    const inspectableMembers = members.filter((member) => INSPECTABLE_KINDS.has(member.kind));
    const proprietaryMembers = members.filter((member) => PROPRIETARY_KINDS.has(member.kind));
    const history = (historyByOriginal.get(root) ?? []).slice().sort((left, right) => (left.createdAt < right.createdAt ? 1 : -1));
    const activeDerivation = inspectableMembers
      .map((member) => succeededByDerived.get(member.artifactId))
      .filter((item): item is DerivationReadModel => Boolean(item))
      .sort((left, right) => (left.createdAt < right.createdAt ? 1 : -1))[0] ?? null;

    const warnings = boundList(activeDerivation?.warnings ?? [], 10);
    const fidelity = boundList(activeDerivation?.fidelityLimitations ?? [], 12);
    const evidenceArtifactIds = inspectableMembers.map((member) => member.artifactId).sort();
    const evidenceUnavailable = evidenceArtifactIds.length === 0;

    const voiceLimitations: string[] = [
      "one derivation family is one comparison voice: a derived file and its proprietary original are never compared as two documents",
    ];
    if (rootArtifact && PROPRIETARY_KINDS.has(rootArtifact.kind)) {
      voiceLimitations.push(
        "the original proprietary artifact supplies lineage, filename, hash, derivation method, converter identity, and fidelity limitations only; no claim was fabricated from bytes VOKA cannot parse",
      );
    }
    if (history.length > 1) {
      voiceLimitations.push(`${history.length} historical derivations of the same original are recorded; only the newest successful one supplies evidence and no derivation row was mutated`);
    }
    if (evidenceUnavailable) {
      voiceLimitations.push("this family has no inspectable artifact, so it contributed no comparison evidence");
      limitations.push(`derivation family ${root} has no inspectable evidence artifact`);
    }
    if (fidelity.length > 0) fidelityReviewFamilies.push(root);

    voices.push({
      derivationFamilyRootArtifactId: root,
      evidenceArtifactId: inspectableMembers.length === 1 ? inspectableMembers[0]!.artifactId : (activeDerivation?.derivedArtifactId ?? inspectableMembers[0]?.artifactId ?? null),
      evidenceArtifactIds,
      lineageRole: proprietaryMembers.length > 0 && inspectableMembers.length > 0
        ? "DERIVED_INSPECTED"
        : proprietaryMembers.length > 0 ? "ORIGINAL_PROPRIETARY" : "STANDALONE",
      derivation: activeDerivation,
      derivationHistory: history,
      originalFilename: rootArtifact?.originalFilename ?? null,
      originalHash: rootArtifact?.contentSha256 ?? null,
      warnings,
      fidelityLimitations: fidelity,
      inspectable: inspectableMembers.length > 0,
      evidenceUnavailable,
      limitations: boundList(voiceLimitations, 8),
    });
  }

  voices.sort((left, right) => (left.derivationFamilyRootArtifactId < right.derivationFamilyRootArtifactId ? -1 : 1));
  return { voices, fidelityReviewFamilies: boundList(fidelityReviewFamilies, 64), limitations };
}

/** True when two artifacts belong to ONE derivation family and must never be compared as two documents. */
export function sameDerivationFamily(left: { derivationFamilyRootArtifactId: string }, right: { derivationFamilyRootArtifactId: string }): boolean {
  return left.derivationFamilyRootArtifactId === right.derivationFamilyRootArtifactId;
}

/** The family key used everywhere in 2A-10 identity: the family root, by definition. */
export function familyKeyFor(familyRootArtifactId: string): string {
  return familyRootArtifactId;
}

/**
 * True when a family's lineage/fidelity itself needs review.
 *
 * This drives a separate `DERIVATION_FIDELITY_REVIEW` finding: a conversion
 * boundary is NOT an ordinary document discrepancy, and reporting it as one
 * would blame the wrong thing.
 */
export function needsFidelityReview(voice: ComparisonVoice): boolean {
  return voice.fidelityLimitations.length > 0 || voice.derivationHistory.some((derivation) => derivation.status === "SUCCEEDED" && derivation.fidelityLimitations.length > 0);
}
