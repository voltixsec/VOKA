import { prisma } from "@/lib/prisma";
import {
  MAX_DERIVATION_FIDELITY_LIMITATIONS,
  SourceArtifactPolicyError,
  derivationFidelityLimitations,
  derivationKindForPair,
  userProvidedDerivationKey,
  type ArtifactDerivationKind,
} from "@/src/domain/source-artifact";

/**
 * Phase 2A-9: explicit user-provided export linking.
 *
 * The user opened the authoring application (AutoCAD, Revit), exported a DXF
 * or IFC themselves, uploaded it through the normal ingest path, and now
 * explicitly identifies which original artifact it came from. VOKA records
 * that lineage honestly as USER_PROVIDED_EXPORT: no ConversionProvider runs,
 * no converter id or version is fabricated, and nothing is inferred from
 * filenames, upload order, similar names, or temporal proximity.
 *
 * Guards: same tenant, both artifacts exist, valid format pair only
 * (DWG→DXF, RVT→IFC), no self-link, no lineage cycle, idempotent per
 * source/derived hash pair.
 */

/** Bounded lineage-cycle walk depth; far deeper than any real derivation chain. */
const MAX_LINEAGE_WALK_DEPTH = 8;

export type LinkUserProvidedDerivationResult = {
  derivationKey: string;
  derivationId: string;
  derivationKind: ArtifactDerivationKind;
  idempotent: boolean;
};

export async function linkUserProvidedDerivation(input: {
  companyId: string;
  userId: string;
  originalArtifactId: string;
  derivedArtifactId: string;
}): Promise<LinkUserProvidedDerivationResult> {
  const { companyId, originalArtifactId, derivedArtifactId } = input;
  if (originalArtifactId === derivedArtifactId) {
    throw new SourceArtifactPolicyError("DERIVATION_SELF_LINK_INVALID", "An artifact cannot be linked to itself as its own derivation source.");
  }
  const [original, derived] = await Promise.all([
    prisma.sourceArtifact.findFirst({ where: { id: originalArtifactId, companyId } }),
    prisma.sourceArtifact.findFirst({ where: { id: derivedArtifactId, companyId } }),
  ]);
  if (!original || !derived) {
    throw new SourceArtifactPolicyError("SOURCE_ARTIFACT_NOT_FOUND", "Both the original and the derived artifact must exist for the active company.");
  }
  const derivationKind = derivationKindForPair(original.kind, derived.kind);
  if (!derivationKind) {
    throw new SourceArtifactPolicyError(
      "DERIVATION_PAIR_UNSUPPORTED",
      `Only a DWG original with a DXF export, or an RVT original with an IFC export, can be linked (found ${original.kind} → ${derived.kind}).`,
    );
  }
  if (derived.processingState === "FAILED") {
    throw new SourceArtifactPolicyError("DERIVATION_DERIVED_ARTIFACT_INVALID", "The exported artifact did not pass inspection, so it cannot be linked as a derivation.");
  }
  // A user export must already have passed normal ingest: kind DXF/IFC rows
  // only ever exist through the governed ingestion path, which inspected the
  // bytes and recorded their hash. The hash pair below is that evidence.

  // Bounded cycle walk: following derivation edges from the proposed derived
  // artifact must never reach the proposed original — that would make the
  // "original" downstream of its own source.
  let cyclic = false;
  let frontier: string[] = [derived.id];
  for (let depth = 0; depth < MAX_LINEAGE_WALK_DEPTH && frontier.length; depth += 1) {
    const edges = await prisma.artifactDerivation.findMany({
      where: { companyId, originalArtifactId: { in: frontier }, derivedArtifactId: { not: null } },
      select: { derivedArtifactId: true },
      take: 100,
    });
    const next = Array.from(new Set<string>(edges.map((edge: { derivedArtifactId: string | null }) => edge.derivedArtifactId).filter((id: string | null): id is string => Boolean(id))));
    if (next.includes(original.id)) {
      cyclic = true;
      break;
    }
    frontier = next;
  }
  if (cyclic) {
    throw new SourceArtifactPolicyError("DERIVATION_CYCLE_INVALID", "Linking these artifacts would create a derivation cycle; the lineage must stay a one-way chain.");
  }

  const derivationKey = userProvidedDerivationKey({ derivationKind, sourceHash: original.contentSha256, derivedHash: derived.contentSha256 });
  const existing = await prisma.artifactDerivation.findUnique({ where: { companyId_derivationKey: { companyId, derivationKey } } });
  if (existing) {
    return { derivationKey, derivationId: existing.id, derivationKind, idempotent: true };
  }
  const created = await prisma.artifactDerivation.create({
    data: {
      companyId,
      originalArtifactId: original.id,
      derivedArtifactId: derived.id,
      derivationKind,
      derivationMethod: "USER_PROVIDED_EXPORT",
      converterId: null,
      converterVersion: null,
      optionsFingerprint: "{}",
      sourceFormat: original.kind,
      derivedFormat: derived.kind,
      sourceHash: original.contentSha256,
      derivedHash: derived.contentSha256,
      status: "SUCCEEDED",
      failureReason: null,
      warnings: [],
      fidelityLimitations: derivationFidelityLimitations(derivationKind).slice(0, MAX_DERIVATION_FIDELITY_LIMITATIONS),
      derivationKey,
      completedAt: new Date(),
    },
  });
  return { derivationKey, derivationId: created.id, derivationKind, idempotent: false };
}
