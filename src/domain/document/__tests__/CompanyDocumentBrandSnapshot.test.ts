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

  it("creates and parses v3 with immutable document assets and signatory identity", () => {
    const v3 = createCompanyDocumentBrandSnapshot({
      ...identity,
      letterheadUrl: "data:image/png;base64,AAAA",
      signatureUrl: "data:image/jpeg;base64,BBBB",
      stampUrl: "data:image/png;base64,CCCC",
      authorizedSignatory: { id: "signatory-1", nameAr: "أحمد", nameEn: "Ahmed", titleAr: "المدير", titleEn: "Director", signatureUrl: "data:image/png;base64,DDDD" },
    });
    expect(v3.version).toBe(3);
    expect(parseCompanyDocumentBrandSnapshot(v3)).toEqual(v3);
  });

  it("continues to parse historical v2 snapshots", () => {
    const v2 = { version: 2 as const, ...identity, letterheadUrl: null, signatureUrl: null, stampUrl: null };
    expect(parseCompanyDocumentBrandSnapshot(v2)).toEqual(v2);
  });
});
