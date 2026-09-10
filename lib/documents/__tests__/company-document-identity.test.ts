import { describe, expect, it } from "vitest";
import {
  decodeCompanyDocumentImage,
  localizeCompanyDocumentIdentity,
} from "../company-document-identity";

const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const company = {
  name: "Fallback Co",
  nameAr: "شركة الأفق",
  nameEn: "Horizon Co",
  addressAr: "الكويت",
  addressEn: "Kuwait City",
  poBox: "100",
  phone: "22220000",
  mobile: null,
  whatsapp: "+96590000000",
  logoUrl: PNG,
  letterheadUrl: PNG,
};

describe("company document identity", () => {
  it("localizes name and address and keeps branding urls", () => {
    expect(localizeCompanyDocumentIdentity(company, "ar")).toMatchObject({
      name: "شركة الأفق",
      address: "الكويت",
      logoUrl: PNG,
      letterheadUrl: PNG,
      phone: "22220000",
    });
    expect(localizeCompanyDocumentIdentity(company, "en").name).toBe("Horizon Co");
  });

  it("falls back to text identity when branding assets are missing", () => {
    expect(
      localizeCompanyDocumentIdentity({ nameEn: "Plain Co" }, "en"),
    ).toMatchObject({
      name: "Plain Co",
      logoUrl: null,
      letterheadUrl: null,
      address: null,
    });
  });

  it("decodes valid png data urls and ignores invalid payloads", () => {
    expect(decodeCompanyDocumentImage(PNG)?.length).toBeGreaterThan(8);
    expect(decodeCompanyDocumentImage("https://evil.example/logo.png")).toBeNull();
    expect(decodeCompanyDocumentImage("data:image/png;base64,AAAA")).toBeNull();
    expect(decodeCompanyDocumentImage(null)).toBeNull();
  });
});
