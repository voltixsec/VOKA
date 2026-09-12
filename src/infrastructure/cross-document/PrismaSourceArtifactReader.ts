/**
 * Phase 2A-10: the company-scoped SourceArtifact reader.
 *
 * Every query carries `companyId`, so a cross-tenant artifact id resolves to
 * "not found" instead of leaking another tenant's document. Re-opening bytes
 * goes through the accepted `LocalSourceArtifactStorage`, which refuses a
 * storage reference that is not a content-addressed `<prefix>/<sha256>` path —
 * a stored path can never be traversed or followed.
 */

import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { SourceArtifactRef, SourceArtifactReaderPort, VerifiedArtifactBytes } from "@/src/application/cross-document/ports";
import { LocalSourceArtifactStorage } from "@/src/infrastructure/source-artifacts/LocalSourceArtifactStorage";

function toRef(record: {
  id: string;
  companyId: string;
  originalFilename: string;
  kind: string;
  mimeType: string;
  contentSha256: string;
  context: string;
  processingState: string;
  createdAt: Date;
}): SourceArtifactRef {
  return {
    artifactId: record.id,
    companyId: record.companyId,
    originalFilename: record.originalFilename,
    kind: record.kind,
    mimeType: record.mimeType,
    contentSha256: record.contentSha256,
    context: record.context,
    processingState: record.processingState,
    createdAt: record.createdAt.toISOString(),
  };
}

const REF_SELECT = {
  id: true,
  companyId: true,
  originalFilename: true,
  kind: true,
  mimeType: true,
  contentSha256: true,
  context: true,
  processingState: true,
  createdAt: true,
} as const;

export class PrismaSourceArtifactReader implements SourceArtifactReaderPort {
  private readonly storage = new LocalSourceArtifactStorage();

  async listArtifacts(input: {
    companyId: string;
    artifactIds?: readonly string[];
    context?: string;
    sourceKinds?: readonly string[];
    limit: number;
  }): Promise<SourceArtifactRef[]> {
    const records = await prisma.sourceArtifact.findMany({
      where: {
        companyId: input.companyId,
        ...(input.artifactIds ? { id: { in: [...input.artifactIds] } } : {}),
        ...(input.context ? { context: input.context as never } : {}),
        ...(input.sourceKinds ? { kind: { in: [...input.sourceKinds] as never } } : {}),
      },
      select: REF_SELECT,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: Math.max(1, Math.min(input.limit, 200)),
    });
    return records.map(toRef);
  }

  async findArtifact(input: { companyId: string; artifactId: string }): Promise<SourceArtifactRef | null> {
    const record = await prisma.sourceArtifact.findFirst({
      where: { id: input.artifactId, companyId: input.companyId },
      select: { ...REF_SELECT, storageRef: true },
    });
    return record ? toRef(record) : null;
  }

  async readVerifiedBytes(input: { companyId: string; artifactId: string }): Promise<VerifiedArtifactBytes> {
    const record = await prisma.sourceArtifact.findFirst({
      where: { id: input.artifactId, companyId: input.companyId },
      select: { storageRef: true, contentSha256: true, processingState: true },
    });
    if (!record) return { status: "UNAVAILABLE", reason: "the source artifact was not found inside the active company" };
    let bytes: Buffer;
    try {
      bytes = await this.storage.get(record.storageRef);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "the retained bytes could not be read";
      return { status: "UNAVAILABLE", reason };
    }
    const actualSha256 = createHash("sha256").update(bytes).digest("hex");
    if (actualSha256 !== record.contentSha256) {
      return { status: "HASH_MISMATCH", reason: "the retained bytes do not match the recorded SHA-256", expectedSha256: record.contentSha256, actualSha256 };
    }
    return { status: "OK", bytes, sha256: actualSha256 };
  }
}
