import { describe, expect, it, vi } from "vitest";

vi.mock("next/font/google", () => ({
  IBM_Plex_Sans_Arabic: () => ({ variable: "--font-voka" }),
}));

import { metadata } from "../layout";

describe("root metadata", () => {
  it("uses valid UTF-8 branding without a replacement character", () => {
    expect(metadata.title).toBe("VOKA — Your AI Sales Employee");
    expect(String(metadata.title)).not.toContain("�");
  });
});
