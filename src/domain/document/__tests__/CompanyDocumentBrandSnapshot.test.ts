import { describe, expect, it } from "vitest";
import { createCompanyDocumentBrandSnapshot, parseCompanyDocumentBrandSnapshot } from "../CompanyDocumentBrandSnapshot";

const identity = {
  nameAr: null, nameEn: "VOKA", addressAr: null, addressEn: "Kuwait",
  poBox: null, phone: null, mobile: null, whatsapp: null,
  logoUrl: null, brandTheme: "NAVY_GOLD",
};

describe("company document brand snapshot versions", () => {
  it("parses v1 unchanged without adding current asset fields", () => {
    const v1 = { version: 1 as const, ...identity };
    expect(parseCompanyDocumentBrandSnapshot(v1)).toEqual(v1);
    expect(parseCompanyDocumentBrandSnapshot(v1)).not.toHaveProperty("letterheadUrl");
  });

  it("creates and parses v2 with immutable document assets", () => {
    const v2 = createCompanyDocumentBrandSnapshot({
      ...identity,
      letterheadUrl: "data:image/png;base64,AAAA",
      signatureUrl: "data:image/jpeg;base64,BBBB",
      stampUrl: "data:image/png;base64,CCCC",
    });
    expect(v2.version).toBe(2);
    expect(parseCompanyDocumentBrandSnapshot(v2)).toEqual(v2);
  });
});
