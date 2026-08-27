import { describe, expect, it, vi } from "vitest";

vi.mock("next/font/google", () => ({
  IBM_Plex_Sans_Arabic: () => ({ variable: "--font-voka" }),
  Cairo: () => ({ variable: "--font-cairo" }),
}));

import { metadata } from "../layout";

describe("root metadata", () => {
  it("uses valid UTF-8 branding without a replacement character", () => {
    expect(metadata.title).toBe("VOKA — Speak. Understand. Quote.");
    expect(String(metadata.title)).not.toContain("�");
  });
});
