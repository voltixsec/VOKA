import { describe, expect, it } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma } from "@/lib/generated/prisma/client";
import { PrismaUniversalLibraryRepository } from "../PrismaUniversalLibraryRepository";

// Opt-in local DB contract test. Every fixture is rolled back, never deleted.
describe.skipIf(process.env.UCL_CLOSE06_DB_TESTS !== "1")("CLOSE-06 PostgreSQL claims", () => {
  it("claims pending/failed/null review and stale work without replaying ready or terminal rows", async () => {
    await import("dotenv/config");
    const p = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
    const rollback = new Error("rollback test fixtures");
    try {
      await expect(p.$transaction(async tx => {
        const source = await tx.universalSource.create({ data: { name: "CLOSE06 rollback-only test", type: "SYNTHETIC" } });
        const run = await tx.universalAcquisitionRun.create({ data: { sourceId: source.id, initiatedByUserId: "synthetic-test", dryRun: false, requestedLimit: 6, policySnapshot: {} } });
        const ids: string[] = [];
        for (const [index, status] of (["RECEIVED", "FAILED", "NEEDS_REVIEW", "PROCESSING", "NEEDS_REVIEW", "REJECTED"] as const).entries()) {
          const r = await tx.universalIngestionRecord.create({ data: {
            sourceId: source.id, acquisitionRunId: run.id, sourceExternalId: `synthetic-${index}`, payloadHash: "a".repeat(64), rawPayload: {}, status,
            normalizedData: index === 4 ? { name: "Already review-ready" } : Prisma.JsonNull,
            errorMessage: status === "FAILED" || status === "REJECTED" ? "Synthetic test" : null,
            processingStartedAt: status === "PROCESSING" ? new Date(Date.now() - 16 * 60_000) : null,
          } });
          ids.push(r.id);
        }
        const repository = new PrismaUniversalLibraryRepository(new Proxy(tx, { get(target, key) {
          if (key === "$transaction") return (callback: (client: typeof tx) => unknown) => callback(tx);
          return Reflect.get(target, key);
        } }) as any);
        const counts = await repository.countBulkWizardIngestionRecords([run.id]);
        expect(counts.incompleteReview).toBe(1);
        const claimed = await repository.claimBulkWizardIngestionRecords([run.id], 10);
        expect(claimed.map(r => r.id).sort()).toEqual(ids.slice(0, 4).sort());
        expect(await repository.claimBulkWizardIngestionRecords([run.id], 10)).toHaveLength(0);
        await repository.updateIngestionRecordStatus(ids[0], "NEEDS_REVIEW", { normalizedData: { name: "Synthetic normalized" } });
        await repository.updateIngestionRecordStatus(ids[1], "FAILED", { errorMessage: "Synthetic failed attempt" });
        expect((await repository.claimBulkWizardIngestionRecords([run.id], 10)).map(r => r.id)).toEqual([ids[1]]);
        expect(await tx.universalIngestionReviewEvent.count({ where: { ingestionRecordId: { in: ids } } })).toBe(0);
        for (const [id, status] of [[ids[1], "PUBLISHED"], [ids[4], "PROCESSING"], [ids[5], "PROCESSING"]] as const) {
          await tx.$executeRawUnsafe("SAVEPOINT forbidden_transition");
          await expect(tx.universalIngestionRecord.update({ where: { id }, data: { status } })).rejects.toThrow("invalid UniversalIngestionRecord status transition");
          await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT forbidden_transition");
        }
        throw rollback;
      }, { timeout: 20_000 })).rejects.toBe(rollback);
    } finally { await p.$disconnect(); }
  });
});
