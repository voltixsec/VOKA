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

  it("allows a duration unit to localize while preserving its numeric value", () => {
    expect(ProtectedTokenValidator.validateTokens("Warranty: 24 months", "الضمان: 24 شهرًا").valid).toBe(true);
    expect(ProtectedTokenValidator.validateTokens("Warranty: 24 months", "الضمان: 12 شهرًا").valid).toBe(false);
    expect(ProtectedTokenValidator.validateTokens("Warranty: 24 months", "الضمان: شهران").valid).toBe(false);
  });

  it("keeps critical commercial and technical tokens exact", () => {
    const source = "DS-2CD2143G2-I costs KWD 1,250.000 with 50% deposit; 4MP IP67";
    expect(ProtectedTokenValidator.validateTokens(source, `توريد ${source}`).valid).toBe(true);
    expect(ProtectedTokenValidator.validateTokens(source, "DS-2CD2143G2-I costs KWD 1,250.00 with 50% deposit; 4MP IP67").valid).toBe(false);
  });

  it("supports real UTF-8 Arabic quantities, EUR, GBP, and m²", () => {
    expect(ProtectedTokenValidator.validateTokens("الكمية 8 كاميرات", "Quantity 8 cameras").valid).toBe(true);
    expect(ProtectedTokenValidator.validateTokens("عدد 8 كاميرات", "Quantity 7 cameras").valid).toBe(false);
    expect(ProtectedTokenValidator.validateTokens("EUR 99.50 and GBP 75.00", "EUR 99.50 وGBP 75.00").valid).toBe(true);
    expect(ProtectedTokenValidator.validateTokens("Area 2000 m²", "المساحة 2000 m²").valid).toBe(true);
    expect(ProtectedTokenValidator.validateTokens("€99.50 and £75.00", "€99.50 و£75.00").valid).toBe(true);
  });

  it("does not overmatch malformed decimal or IP-like strings", () => {
    expect(ProtectedTokenValidator.extractProtectedTokens("value 125x500")).toEqual([]);
    expect(ProtectedTokenValidator.extractProtectedTokens("host 192x168x1x1")).toEqual([]);
    expect(ProtectedTokenValidator.extractProtectedTokens("host 192.168.1.1.5")).toEqual([]);
    expect(ProtectedTokenValidator.extractProtectedTokens("KWD 1,250x000")).not.toContain("KWD 1,250");
  });
});
