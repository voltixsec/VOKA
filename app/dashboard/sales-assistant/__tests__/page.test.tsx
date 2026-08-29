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
  sessionStorage.clear();
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

    const generateBtn = screen.getByRole("button", { name: "Start Request" });
    fireEvent.click(generateBtn);

    await waitFor(() => {
      expect(screen.getByText("Draft ready for review")).toBeTruthy();
    });
    expect(screen.getAllByText(/Kuwait National Telecom/).length).toBeGreaterThan(0);
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("");
    expect(screen.getByRole("button", { name: "Open for human review" })).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const requestBody = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body));
    expect(requestBody).toMatchObject({ documentMode: "AUTO", buildMode: "AUTO" });

    fireEvent.change(textarea, { target: { value: "A changed request" } });
    expect(screen.queryByText("Draft ready for review")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "New Request" }));
    expect((textarea as HTMLTextAreaElement).value).toBe("");
    expect(sessionStorage.getItem("voka_commercial_conversation_draft")).toBeNull();
  });

  it("renders one compact passive summary without internal statuses or schema keys", async () => {
    const summary = [
      { key: "system.identity", labelAr: "النظام", labelEn: "System", value: "Vehicle Elevator", valueAr: "نظام مصعد سيارات", valueEn: "Vehicle Elevator", status: "PROVISIONAL" },
      { key: "system.jurisdiction", labelAr: "الدولة", labelEn: "Country / jurisdiction", value: "Kuwait", status: "CONFIRMED" },
      { key: "system.numberOfStops", labelAr: "الطوابق", labelEn: "Floors / stops", value: "6", status: "CONFIRMED" },
    ];
    const data = {
      id: "draft-summary", operation: "QUOTATION", documentMode: "QUOTATION", buildMode: "AUTO", locale: "en",
      fields: { customerMention: null, currencyCode: "KWD", paymentTerms: null, scopeType: "SUPPLY_AND_INSTALLATION", sourceReference: null, lines: [] },
      attachment: null, turns: [{ role: "USER", source: "TEXT", text: "Vehicle elevator" }], conversationMessages: [{ role: "USER", source: "TEXT", text: "Vehicle elevator" }, { role: "ASSISTANT", source: "TEXT", text: "How many floors?" }],
      contextText: "Vehicle elevator", missingRequired: [], recommended: [], status: "NEEDS_CLARIFICATION", clarification: null, requiresHumanReview: true, executed: false,
      structuredResult: { summary, stillNeeded: [{ key: "paymentTerms", labelAr: "الدفع", labelEn: "Payment" }, { key: "delivery", labelAr: "التسليم", labelEn: "Delivery" }], commercial: { lineCount: 0, priceRequiredCount: 0, draftReady: false }, facts: [...summary, { key: "system.projectConfiguration", labelAr: "projectConfiguration", labelEn: "projectConfiguration", value: "x", status: "NEEDS_CONFIRMATION" }], evidence: [], readiness: "SYSTEM_PLANNED" },
    };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ data }) });
    vi.stubGlobal("fetch", fetchMock);
    render(createElement(SalesAssistantPage));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Vehicle elevator" } });
    fireEvent.click(screen.getByRole("button", { name: "Start Request" }));
    await waitFor(() => expect(screen.getByTestId("compact-request-summary")).toBeTruthy());
    expect(screen.getByText("Vehicle Elevator")).toBeTruthy();
    expect(screen.getByTestId("compact-still-needed").textContent).toMatch(/Payment.*Delivery/);
    expect(screen.queryByText("PROVISIONAL")).toBeNull();
    expect(screen.queryByText("CONFIRMED")).toBeNull();
    expect(screen.queryByText("NEEDS_CONFIRMATION")).toBeNull();
    expect(screen.queryByText("projectConfiguration")).toBeNull();
    expect(screen.queryByText("REQUIRED TO COMPLETE:")).toBeNull();
  });
});
