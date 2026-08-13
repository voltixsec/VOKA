import { describe, expect, it } from "vitest";
import { validateCompanyImageAsset } from "../value-objects/CompanyImageAsset";

const png = "data:image/png;base64,AAAA";
const jpeg = "data:image/jpeg;base64,AAAA";

describe("company document asset validation", () => {
  it("accepts PNG", () => expect(validateCompanyImageAsset(png, "signatureUrl").valid).toBe(true));
  it("accepts JPEG", () => expect(validateCompanyImageAsset(jpeg, "stampUrl").valid).toBe(true));
  it("accepts null removal", () => expect(validateCompanyImageAsset(null, "letterheadUrl")).toEqual({ valid: true, value: null }));
  it("rejects WebP", () => expect(validateCompanyImageAsset("data:image/webp;base64,AAAA", "logoUrl")).toEqual({ valid: false, reason: "UNSUPPORTED_MIME" }));
  it.each(["not-a-data-url", "data:image/png,AAAA", "data:image/png;base64,***", "data:image/png;base64,"])("rejects malformed data: %s", (value) => {
    expect(validateCompanyImageAsset(value, "logoUrl")).toEqual({ valid: false, reason: "MALFORMED" });
  });
  it.each([
    ["signatureUrl", 500 * 1024],
    ["stampUrl", 500 * 1024],
    ["letterheadUrl", 1536 * 1024],
  ] as const)("rejects oversized %s", (field, limit) => {
    const payload = Buffer.alloc(limit + 1).toString("base64");
    expect(validateCompanyImageAsset(`data:image/png;base64,${payload}`, field)).toEqual({ valid: false, reason: "TOO_LARGE" });
  });
});
