import { describe, expect, it } from "vitest";
import { CATALOG_XLSX_FIELD_LABELS } from "../catalogXlsx";

describe("catalog xlsx arabic field labels", () => {
  it("localizes required mapping fields", () => {
    expect(CATALOG_XLSX_FIELD_LABELS.type.ar).toBe("النوع");
    expect(CATALOG_XLSX_FIELD_LABELS.code.ar).toBe("الكود");
    expect(CATALOG_XLSX_FIELD_LABELS.name.ar).toBe("الاسم");
  });
});
