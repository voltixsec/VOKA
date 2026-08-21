import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("UCL-3 migration integrity", () => {
  const migration = readFileSync(
    join(process.cwd(), "prisma/migrations/20260821180000_ucl_3_ingestion_normalization/migration.sql"),
    "utf8"
  );
  const repository = readFileSync(
    join(process.cwd(), "features/universal-library/infrastructure/prisma/PrismaUniversalLibraryRepository.ts"),
    "utf8"
  );

  it("enforces source identity, hash, trust, status data, and lifecycle constraints", () => {
    expect(migration).toContain("UniversalIngestionRecord_sourceId_sourceExternalId_key");
    expect(migration).toContain("UniversalSource_trust_score_check");
    expect(migration).toContain("UniversalIngestionRecord_status_data_check");
    expect(migration).toContain("UniversalIngestionRecord_status_transition_guard");
    expect(migration).toContain("^[0-9a-f]{64}$");
  });

  it("claims bounded work atomically and skips concurrent locks", () => {
    expect(repository).toContain("FOR UPDATE SKIP LOCKED");
    expect(repository).toContain("LIMIT ${boundedLimit}");
    expect(repository).toContain("'PROCESSING'::\"UniversalIngestionStatus\"");
  });

  it("contains no external dataset or product seed payload", () => {
    expect(migration).not.toMatch(/\bINSERT\s+INTO\s+"UniversalCatalogItem"/i);
    expect(migration).not.toMatch(/\bCOPY\s+"UniversalCatalogItem"/i);
  });
});
