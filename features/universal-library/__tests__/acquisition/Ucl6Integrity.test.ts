import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const migration = readFileSync(resolve(root, "prisma/migrations/20260821230000_ucl_6_controlled_data_acquisition/migration.sql"), "utf8");
const schema = readFileSync(resolve(root, "prisma/schema.prisma"), "utf8");
const repository = readFileSync(resolve(root, "features/universal-library/infrastructure/acquisition/PrismaAcquisitionRepository.ts"), "utf8");
const runRoute = readFileSync(resolve(root, "app/api/universal-library/acquisition/run/route.ts"), "utf8");

describe("UCL-6 schema and API integrity", () => {
  it("uses forward-only migration statements", () => {
    expect(migration).toContain('CREATE TABLE "UniversalAcquisitionRun"');
    expect(migration).not.toMatch(/DROP\s+(TABLE|COLUMN|TYPE)/i);
  });
  it("adds quota and provenance indexes", () => {
    expect(migration).toContain('"UniversalAcquisitionRun_sourceId_createdAt_idx"');
    expect(migration).toContain('"UniversalIngestionRecord_acquisitionRunId_idx"');
    expect(migration).toContain('"UniversalItemProvenance_acquisitionRunId_idx"');
  });
  it("enforces database acquisition bounds", () => expect(migration).toContain('"UniversalSource_acquisition_limits_check"'));
  it("keeps unknown governance as the schema default", () => {
    expect(schema).toMatch(/commercialUseState\s+UniversalPolicyState\s+@default\(UNKNOWN\)/);
    expect(schema).toMatch(/approvalState\s+UniversalSourceApprovalState\s+@default\(DRAFT\)/);
  });
  it("serializes quota reservation behind a database advisory lock", () => {
    expect(repository).toContain("pg_advisory_xact_lock");
    expect(repository).toContain('isolationLevel: "Serializable"');
  });
  it("atomically reserves worst-case retry requests", () => {
    expect(repository).toContain("reservedRequestCount");
    expect(repository).toContain("1 + input.source.maxRetries");
  });
  it("counts the global live pilot cap across all time", () => {
    expect(repository).toContain('where: { dryRun: false');
    expect(repository).toContain("UCL6_GLOBAL_PILOT_LIMIT");
  });
  it("requires OWNER or ADMIN", () => expect(runRoute).toContain('withCompanyAuth(["OWNER", "ADMIN"]'));
  it("rejects browser-supplied target URLs", () => expect(runRoute).toContain("ARBITRARY_URL_FORBIDDEN"));
  it("bounds API limits at the hard pilot maximum", () => expect(runRoute).toContain("> 1000"));
  it("does not expose internal exceptions", () => expect(runRoute).toContain("Acquisition run could not be completed."));
});
