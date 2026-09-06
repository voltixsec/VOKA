import fs from "node:fs";
import path from "node:path";

import {
  describe,
  expect,
  it,
} from "vitest";

describe("UCL review evidence contract", () => {
  it("returns governed evidence required before publication", () => {
    const dto = fs.readFileSync(
      path.join(
        process.cwd(),
        "features/universal-library/application/staging-products/GetStagedProducts.ts",
      ),
      "utf8",
    );

    const repository = fs.readFileSync(
      path.join(
        process.cwd(),
        "features/universal-library/infrastructure/staging-products/PrismaStagedProductsRepository.ts",
      ),
      "utf8",
    );

    expect(dto).toContain(
      "normalizedData: Record<string, unknown> | null",
    );
    expect(dto).toContain(
      "sourceVerificationStatus: string",
    );
    expect(dto).toContain(
      "canonicalSourceUrl: string | null",
    );

    expect(repository).toContain(
      "normalizedData: true",
    );
    expect(repository).toContain(
      "verificationStatus: true",
    );
    expect(repository).toContain(
      "licenseReferenceUrl: true",
    );
    expect(repository).toContain(
      "sourceName:",
    );
    expect(repository).toContain(
      "sourceTrustScore:",
    );
  });

  it("shows evidence before the publish action", () => {
    const page = fs.readFileSync(
      path.join(
        process.cwd(),
        "app/dashboard/universal-library/review/page.tsx",
      ),
      "utf8",
    );

    expect(page).toContain(
      "Evidence before publication",
    );
    expect(page).toContain(
      "Normalized candidate",
    );
    expect(page).toContain(
      "Raw source payload",
    );
    expect(page).toContain(
      "item.sourceName",
    );
    expect(page).toContain(
      "item.sourceVerificationStatus",
    );
    expect(page).toContain(
      "item.matchedItemId",
    );
    expect(page).toContain(
      "Approve & Publish",
    );
  });
});
