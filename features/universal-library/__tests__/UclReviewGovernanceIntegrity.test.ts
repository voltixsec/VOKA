import {
  readFileSync,
} from "node:fs";

import {
  describe,
  expect,
  it,
} from "vitest";

describe(
  "UCL governed review boundary",
  () => {
    it(
      "processing never directly publishes canonical records",
      () => {
        const source =
          readFileSync(
            "features/universal-library/application/use-cases/ProcessIngestionBatch.ts",
            "utf8",
          );

        expect(source)
          .toContain(
            '"NEEDS_REVIEW"',
          );

        expect(source)
          .not.toContain(
            "repository.publishIngestionRecord",
          );
      },
    );

    it(
      "canonical publication requires review state and records an approval event",
      () => {
        const source =
          readFileSync(
            "features/universal-library/infrastructure/prisma/PrismaUniversalLibraryRepository.ts",
            "utf8",
          );

        expect(source)
          .toContain(
            'status: "NEEDS_REVIEW"',
          );

        expect(source)
          .toContain(
            "universalIngestionReviewEvent.create",
          );

        expect(source)
          .toContain(
            'decision: "APPROVED"',
          );

        expect(source)
          .toContain(
            'decision: "REJECTED"',
          );
      },
    );

    it(
      "persists immutable review decision history in the UCL schema",
      () => {
        const schema =
          readFileSync(
            "prisma/schema.prisma",
            "utf8",
          );

        expect(schema)
          .toContain(
            "model UniversalIngestionReviewEvent",
          );

        expect(schema)
          .toContain(
            "UniversalIngestionReviewDecision",
          );
      },
    );
  },
);
