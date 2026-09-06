import fs from "node:fs";
import path from "node:path";

import {
  describe,
  expect,
  it,
} from "vitest";

describe("UCL automated failure governance", () => {
  it("reserves REJECTED for explicit review decisions", () => {
    const ingestSource = fs.readFileSync(
      path.join(
        process.cwd(),
        "features/universal-library/application/use-cases/IngestSourceRecord.ts",
      ),
      "utf8",
    );

    const reviewRepo = fs.readFileSync(
      path.join(
        process.cwd(),
        "features/universal-library/infrastructure/prisma/PrismaUniversalLibraryRepository.ts",
      ),
      "utf8",
    );

    expect(ingestSource).toContain(
      'status: "FAILED"',
    );

    expect(ingestSource).not.toMatch(
      /normalizeError[\s\S]{0,500}status:\s*"REJECTED"/,
    );

    expect(reviewRepo).toMatch(
      /status:\s*"NEEDS_REVIEW"[\s\S]{0,250}status:\s*"REJECTED"/,
    );

    expect(reviewRepo).toContain(
      'decision: "REJECTED"',
    );
  });
});
