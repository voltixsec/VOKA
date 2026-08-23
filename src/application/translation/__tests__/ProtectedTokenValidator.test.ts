import { describe, expect, it } from "vitest";
import { ProtectedTokenValidator } from "../services/ProtectedTokenValidator";

describe("ProtectedTokenValidator", () => {
  it("extracts SKUs, MPNs, and model numbers", () => {
    const text = "Supply Hikvision DS-2CD2143G2-I 4MP camera and APC LR1250I UPS";
    const tokens = ProtectedTokenValidator.extractProtectedTokens(text);
    expect(tokens).toContain("DS-2CD2143G2-I");
    expect(tokens).toContain("LR1250I");
  });

  it("extracts prices, currencies, and percentages", () => {
    const text = "Unit Price KD 1,250.500 with Discount 50% and total USD 250";
    const tokens = ProtectedTokenValidator.extractProtectedTokens(text);
    expect(tokens).toContain("KD 1,250.500");
    expect(tokens).toContain("50%");
    expect(tokens).toContain("USD 250");
  });

  it("extracts technical units, voltages, capacities, and IP ratings", () => {
    const text = "16ch NVR, 8TB HDD, 220V power supply, CAT6 cable, IP67 housing";
    const tokens = ProtectedTokenValidator.extractProtectedTokens(text);
    expect(tokens).toContain("8TB");
    expect(tokens).toContain("220V");
    expect(tokens).toContain("CAT6");
    expect(tokens).toContain("IP67");
  });

  it("extracts URLs and email addresses", () => {
    const text = "Contact support@example.com or visit https://example.com/product/APC-LR1250I";
    const tokens = ProtectedTokenValidator.extractProtectedTokens(text);
    expect(tokens).toContain("support@example.com");
    expect(tokens).toContain("https://example.com/product/APC-LR1250I");
  });

  it("validates when all protected tokens are preserved in translation", () => {
    const source = "Supply APC LR1250I UPS, Qty 10, KD 125.500";
    const target = "توريد مزود الطاقة APC LR1250I UPS, الكمية 10, KD 125.500";
    const result = ProtectedTokenValidator.validateTokens(source, target);
    expect(result.valid).toBe(true);
    expect(result.missingTokens).toHaveLength(0);
  });

  it("fails validation when a protected token is mutated or lost", () => {
    const source = "Camera DS-2CD2143G2-I with 8TB HDD";
    const target = "كاميرا مراقبة مع قرص صلب 8 ترابايت"; // lost DS-2CD2143G2-I and 8TB
    const result = ProtectedTokenValidator.validateTokens(source, target);
    expect(result.valid).toBe(false);
    expect(result.missingTokens).toContain("DS-2CD2143G2-I");
    expect(result.missingTokens).toContain("8TB");
  });
});
