import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("UCL explicit rejection DB contract", () => {
  it("keeps REJECTED records compatible with the database errorMessage constraint", () => {
    const repoSource = fs.readFileSync(
      path.join(
        process.cwd(),
        "features/universal-library/infrastructure/prisma/PrismaUniversalLibraryRepository.ts",
      ),
      "utf8",
    );

    const migrationSource = fs.readFileSync(
      path.join(
        process.cwd(),
        "prisma/migrations/20260905_ucl_bulk_multi_entity_staging/migration.sql",
      ),
      "utf8",
    );

    expect(migrationSource).toContain("'REJECTED'");
    expect(migrationSource).toContain('"errorMessage"');

    expect(repoSource).toContain('status: "REJECTED"');
    expect(repoSource).toContain(
      '"Rejected by explicit platform review"',
    );
    expect(repoSource).not.toMatch(
      /status:\s*"REJECTED"[\s\S]{0,250}errorMessage:\s*null/,
    );
  });
});
