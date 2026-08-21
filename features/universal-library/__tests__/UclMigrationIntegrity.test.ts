import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("UCL-2 migration integrity", () => {
  const migration = readFileSync(
    join(
      process.cwd(),
      "prisma/migrations/20260821120000_ucl_2_identity_enrichment/migration.sql"
    ),
    "utf8"
  );

  it("prevents ambiguous identifiers in their correct namespaces", () => {
    expect(migration).toContain("UniversalItemIdentifier_global_identity_key");
    expect(migration).toContain("UniversalItemIdentifier_manufacturer_identity_key");
    expect(migration).toContain("UniversalItemIdentifier_external_identity_key");
    expect(migration).toContain("UniversalItemIdentifier_scope_check");
  });

  it("prevents duplicate null-locale aliases and self-parent hierarchy", () => {
    expect(migration).toContain("UniversalItemAlias_identity_without_locale_key");
    expect(migration).toContain("UniversalItemAlias_identity_with_locale_key");
    expect(migration).toContain("UniversalCatalogItem_parent_not_self_check");
  });

  it("enforces exactly one correctly typed structured attribute value", () => {
    expect(migration).toContain("UniversalItemAttributeValue_exactly_one_value_check");
    expect(migration).toContain("UniversalItemAttributeValue_type_guard");
    expect(migration).toContain("validateUniversalItemAttributeValue");
    expect(migration).toContain("UniversalAttributeDefinition_type_guard");
  });
});
