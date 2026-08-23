import { describe, expect, it } from "vitest";
import { ProtectedTokenValidator } from "../services/ProtectedTokenValidator";

describe("ProtectedTokenValidator exact commercial preservation", () => {
  const validCases = [
    "DS-2CD2143G2-I", "APC LR1250I", "CAT6", "IP67", "KWD", "USD",
    "GTIN 1234567890123", "EAN 1234567890123", "UPC 123456789012",
    "MPN DS-2CD2143G2-I", "Qty 10", "Quantity 8", "10 pcs", "8 cameras",
    "2.5 m", "2000 m²", "KD 125.500", "USD 250", "50%", "24 months",
    "8TB", "4MP", "220V", "support@example.com",
    "https://example.com/product/APC-LR1250I",
  ];
  it.each(validCases)("preserves %s exactly", (token) => {
    expect(ProtectedTokenValidator.validateTokens(`Source ${token}`, `مترجم Source ${token}`).valid).toBe(true);
  });
  it.each([
    ["DS-2CD2143G2-I", "ds-2cd2143g2-i"],
    ["Qty 10", "Qty 11"],
    ["2000 m²", "2,000 m²"],
    ["KD 125.500", "KD 125.5"],
    ["50%", "٥٠٪"],
    ["8TB", "8 تيرابايت"],
    ["220V", "220 فولت"],
    ["APC LR1250I", "APC lr1250i"],
  ])("rejects mutation %s -> %s", (source, target) => {
    expect(ProtectedTokenValidator.validateTokens(source, target).valid).toBe(false);
  });
  it("detects deletion and duplicate-count loss", () => {
    expect(ProtectedTokenValidator.validateTokens("50% advance and 50% delivery", "50% advance").valid).toBe(false);
    expect(ProtectedTokenValidator.validateTokens("CAT6 IP67", "CAT6").missingTokens).toContain("IP67");
  });
  it("preserves a mixed Arabic/English technical corpus", () => {
    const source = "توريد عدد 8 كاميرات 4MP موديل DS-2CD2143G2-I، CAT6، IP67، 220V، وهارد 8TB";
    const target = "Supply عدد 8 كاميرات 4MP model DS-2CD2143G2-I, CAT6, IP67, 220V, storage 8TB";
    expect(ProtectedTokenValidator.validateTokens(source, target).valid).toBe(true);
  });
});
