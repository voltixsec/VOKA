import { describe, expect, it } from "vitest";
import { buildDocumentVerificationUrl } from "../DocumentVerificationToken";
import { CryptoDocumentVerificationTokenGenerator } from "@/src/infrastructure/document-verification/CryptoDocumentVerificationTokenGenerator";

describe("document verification tokens", () => {
  it("generates unique URL-safe cryptographic tokens", () => {
    const generator = new CryptoDocumentVerificationTokenGenerator();
    const tokens = new Set(Array.from({ length: 20 }, () => generator.generate()));
    expect(tokens.size).toBe(20);
    for (const token of tokens) expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it.each([
    ["https://voka.example", "https://voka.example/verify/abcdefghijklmnopqrstuvwxyz_ABCDEFG-123456"],
    ["https://voka.example///", "https://voka.example/verify/abcdefghijklmnopqrstuvwxyz_ABCDEFG-123456"],
  ])("normalizes the public base URL", (base, expected) => {
    expect(buildDocumentVerificationUrl(base, "abcdefghijklmnopqrstuvwxyz_ABCDEFG-123456")).toBe(expected);
  });
});
