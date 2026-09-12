/**
 * Phase 2A-10: the READ-ONLY Phase 2A-9 derivation adapter.
 *
 * It reads `ArtifactDerivation` and never writes it. 2A-10 adds no family id to
 * that table, never mutates a derivation row, and never re-runs a converter.
 * The family root is `originalArtifactId`, exactly as the accepted 2A-9 model
 * defines it, and both warning channels are preserved separately: provider
 * warnings (`warnings`) are not the same thing as VOKA's static fidelity
 * limitations (`fidelityLimitations`).
 */

import { prisma } from "@/lib/prisma";
import type { DerivationReadModel, DerivationReaderPort } from "@/src/application/cross-document/ports";

const DERIVATION_SELECT = {
  id: true,
  companyId: true,
  originalArtifactId: true,
  derivedArtifactId: true,
  derivationKind: true,
  derivationMethod: true,
  sourceFormat: true,
  derivedFormat: true,
  sourceHash: true,
  derivedHash: true,
  converterId: true,
  converterVersion: true,
  warnings: true,
  fidelityLimitations: true,
  status: true,
  optionsFingerprint: true,
  createdAt: true,
  completedAt: true,
} as const;

type DerivationRow = {
  id: string;
  companyId: string;
  originalArtifactId: string;
  derivedArtifactId: string | null;
  derivationKind: string;
  derivationMethod: string;
  sourceFormat: string;
  derivedFormat: string;
  sourceHash: string;
  derivedHash: string | null;
  converterId: string | null;
  converterVersion: string | null;
  warnings: string[];
  fidelityLimitations: string[];
  status: string;
  optionsFingerprint: string;
  createdAt: Date;
  completedAt: Date | null;
};

/** Maps one accepted 2A-9 row into the read model. No field is renamed or reinterpreted. */
export function toDerivationReadModel(row: DerivationRow): DerivationReadModel {
  return {
    derivationId: row.id,
    companyId: row.companyId,
    /** FAMILY ROOT. */
    originalArtifactId: row.originalArtifactId,
    derivedArtifactId: row.derivedArtifactId,
    derivationKind: row.derivationKind,
    derivationMethod: row.derivationMethod,
    sourceFormat: row.sourceFormat,
    derivedFormat: row.derivedFormat,
    sourceHash: row.sourceHash,
    derivedHash: row.derivedHash,
    converterId: row.converterId,
    converterVersion: row.converterVersion,
    warnings: [...row.warnings],
    fidelityLimitations: [...row.fidelityLimitations],
    status: row.status,
    optionsFingerprint: row.optionsFingerprint,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
  };
}

export class PrismaDerivationReader implements DerivationReaderPort {
  async listByOriginalArtifact(input: { companyId: string; originalArtifactId: string }): Promise<DerivationReadModel[]> {
    const rows = await prisma.artifactDerivation.findMany({
      where: { companyId: input.companyId, originalArtifactId: input.originalArtifactId },
      select: DERIVATION_SELECT,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 200,
    });
    return rows.map((row: DerivationRow) => toDerivationReadModel(row));
  }

  async listByDerivedArtifact(input: { companyId: string; derivedArtifactId: string }): Promise<DerivationReadModel[]> {
    const rows = await prisma.artifactDerivation.findMany({
      where: { companyId: input.companyId, derivedArtifactId: input.derivedArtifactId },
      select: DERIVATION_SELECT,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 200,
    });
    return rows.map((row: DerivationRow) => toDerivationReadModel(row));
  }

  async listForArtifacts(input: { companyId: string; artifactIds: readonly string[] }): Promise<DerivationReadModel[]> {
    const ids = [...new Set(input.artifactIds)];
    if (!ids.length) return [];
    const rows = await prisma.artifactDerivation.findMany({
      where: {
        companyId: input.companyId,
        OR: [{ originalArtifactId: { in: ids } }, { derivedArtifactId: { in: ids } }],
      },
      select: DERIVATION_SELECT,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 500,
    });
    return rows.map((row: DerivationRow) => toDerivationReadModel(row));
  }
}
