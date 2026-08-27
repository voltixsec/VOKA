// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import SalesAssistantPage from "../page";

vi.mock("@/components/i18n/LanguageProvider", () => ({
  useLanguage: () => ({ isArabic: false }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("SalesAssistantPage", () => {
  it("renders natural language input and prepares a draft for human review", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: { id: "draft-1", operation: "QUOTATION", locale: "en", fields: { customerMention: "Kuwait National Telecom", currencyCode: null, paymentTerms: null, scopeType: null, sourceReference: null, lines: [{ itemName: "4K IP Camera", quantity: 5 }] }, attachment: null, turns: [{ source: "TEXT", text: "Create a quotation for Kuwait National Telecom 5 4K IP Cameras" }], contextText: "Create a quotation for Kuwait National Telecom 5 4K IP Cameras", missingRequired: [], recommended: [], status: "READY_FOR_REVIEW", clarification: null, requiresHumanReview: true, executed: false } }) });

    vi.stubGlobal("fetch", fetchMock);

    render(createElement(SalesAssistantPage));

    expect(screen.getByText(/VOKA Commercial AI Entry/i)).toBeTruthy();

    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, {
      target: { value: "Create a quotation for Kuwait National Telecom 5 4K IP Cameras" },
    });

    const generateBtn = screen.getByRole("button", { name: "Understand & review operation" });
    fireEvent.click(generateBtn);

    await waitFor(() => {
      expect(screen.getByText("READY FOR REVIEW")).toBeTruthy();
    });
    expect(screen.getByText(/Kuwait National Telecom/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Open for human review" })).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
