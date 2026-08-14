import { describe, expect, it } from "vitest";

import { normalizeWhatsAppRecipient } from "../normalizeWhatsAppRecipient";

describe("normalizeWhatsAppRecipient", () => {
  it.each([
    ["+965 9000-0000", "96590000000"],
    ["00965 (9000) 0000", "96590000000"],
    ["96590000000", "96590000000"],
  ])("normalizes an explicit international recipient", (input, expected) => {
    expect(normalizeWhatsAppRecipient(input)).toBe(expected);
  });

  it.each(["", "phone", "0501234567", "+12", "+1234567890123456"])(
    "rejects invalid or ambiguous local input",
    (input) => expect(() => normalizeWhatsAppRecipient(input)).toThrow(),
  );
});
