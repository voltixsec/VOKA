// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  vi.useRealTimers();
  sessionStorage.clear();
});

// Superseded legacy WorkingCommercialDraft UI contract; clean-runtime coverage lives in clean-runtime-page.test.tsx.
describe.skip("SalesAssistantPage", () => {
  it("renders natural language input and prepares a draft for human review", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: { id: "draft-1", operation: "QUOTATION", locale: "en", fields: { customerMention: "Kuwait National Telecom", currencyCode: null, paymentTerms: null, scopeType: null, sourceReference: null, lines: [{ itemName: "4K IP Camera", quantity: 5 }] }, attachment: null, turns: [{ source: "TEXT", text: "Create a quotation for Kuwait National Telecom 5 4K IP Cameras" }], contextText: "Create a quotation for Kuwait National Telecom 5 4K IP Cameras", missingRequired: [], recommended: [], status: "READY_FOR_REVIEW", clarification: null, requiresHumanReview: true, executed: false } }) });

    vi.stubGlobal("fetch", fetchMock);

    render(createElement(SalesAssistantPage));

    expect(screen.getByText(/VOKA Sales Assistant/i)).toBeTruthy();

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
    expect(screen.queryByText("Sources")).toBeNull();
  });

  it("shows immediate research activity without adding presentation state to the canonical request", async () => {
    vi.useFakeTimers();
    let finish!: (value: Response) => void;
    const fetchMock = vi.fn((..._args: Parameters<typeof fetch>) => new Promise<Response>((resolve) => { finish = resolve; }));
    vi.stubGlobal("fetch", fetchMock);
    render(createElement(SalesAssistantPage));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Search the web for a complete vehicle elevator system in Kuwait" } });
    fireEvent.click(screen.getByRole("button", { name: "Start Request" }));
    expect(screen.getByTestId("pending-user-message")).toBeTruthy();
    expect(screen.getByTestId("assistant-activity").getAttribute("data-activity-stage")).toBe("UNDERSTANDING");
    const [url, requestInit] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/ai/commercial-conversation");
    expect(requestInit).toBeDefined();
    const request = JSON.parse(String(requestInit!.body));
    expect(JSON.stringify(request)).not.toMatch(/UNDERSTANDING|RESEARCHING|VERIFYING|PREPARING/);
    await act(async () => { await vi.advanceTimersByTimeAsync(600); });
    expect(screen.getByTestId("assistant-activity").getAttribute("data-activity-stage")).toBe("RESEARCHING");
    await act(async () => finish({ ok: true, json: async () => ({ data: { id: "activity", operation: "QUOTATION", documentMode: "QUOTATION", buildMode: "AUTO", locale: "en", fields: { customerMention: null, currencyCode: "KWD", paymentTerms: null, scopeType: null, sourceReference: null, lines: [] }, customerResolution: { status: "NOT_FOUND", candidates: [] }, attachment: null, turns: [], conversationMessages: [{ role: "USER", source: "TEXT", text: "Vehicle elevator" }, { role: "ASSISTANT", source: "TEXT", text: "System understood" }], contextText: "Vehicle elevator", missingRequired: [], recommended: [], status: "NEEDS_CLARIFICATION", clarification: null, requiresHumanReview: true, executed: false } }) } as Response));
    expect(screen.queryByTestId("assistant-activity")).toBeNull();
  });

  it("renders system understanding, committed-only chips, sources, and reduced-motion-safe actions", async () => {
    const summary = [
      { key: "system.identity", labelAr: "النظام", labelEn: "System", value: "Vehicle Elevator", valueAr: "نظام مصعد سيارات", valueEn: "Vehicle Elevator", status: "PROVISIONAL" },
      { key: "system.jurisdiction", labelAr: "الدولة", labelEn: "Country", value: "Kuwait", valueAr: "الكويت", valueEn: "Kuwait", status: "CONFIRMED" },
      { key: "system.numberOfStops", labelAr: "الطوابق", labelEn: "Floors", value: "6", status: "CONFIRMED" },
    ];
    const data = {
      id: "experience-v2", operation: "QUOTATION", documentMode: "QUOTATION", buildMode: "AUTO", locale: "en",
      fields: { customerMention: null, currencyCode: "KWD", paymentTerms: null, scopeType: "SUPPLY_AND_INSTALLATION", sourceReference: null, lines: [] },
      customerResolution: { status: "NOT_FOUND", candidates: [] }, attachment: null,
      turns: [{ role: "USER", source: "TEXT", text: "Vehicle elevator" }],
      conversationMessages: [{ role: "USER", source: "TEXT", text: "Vehicle elevator" }, { role: "ASSISTANT", source: "TEXT", text: "I understand the vehicle elevator system." }],
      contextText: "Vehicle elevator", missingRequired: [], recommended: [], status: "NEEDS_CLARIFICATION", clarification: null, requiresHumanReview: true, executed: false,
      structuredResult: {
        summary, facts: summary, stillNeeded: [], commercial: { lineCount: 0, priceRequiredCount: 0, draftReady: false }, readiness: "SYSTEM_PLANNED",
        systemUnderstanding: { recognized: true, confidence: "PROVISIONAL", headingAr: "تم فهم نوع النظام والتكوين العام المتوقع", headingEn: "System type and expected structure understood", descriptionAr: "بعض التفاصيل الفنية تحتاج تأكيد.", descriptionEn: "Some engineering details still need confirmation before approval.", components: [{ labelAr: "مجموعة الرفع والحركة", labelEn: "Drive and lifting assembly" }, { labelAr: "منظومة الأمان", labelEn: "Safety system" }] },
        evidence: [{ title: "Vehicle lift technical guide", url: "https://manufacturer.example/guide", publisher: "manufacturer.example" }],
      },
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data }) }));
    const { container } = render(createElement(SalesAssistantPage));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Vehicle elevator" } });
    fireEvent.click(screen.getByRole("button", { name: "Start Request" }));
    await screen.findByTestId("system-understanding");
    expect(screen.getByText("System type and expected structure understood")).toBeTruthy();
    expect(screen.getByText("Drive and lifting assembly")).toBeTruthy();
    expect(screen.getAllByTestId("committed-fact-chip")).toHaveLength(2);
    expect(screen.getByText("Sources")).toBeTruthy();
    expect(screen.getByText("Vehicle lift technical guide")).toBeTruthy();
    expect(container.textContent).not.toMatch(/PROVISIONAL|SYSTEM_PLANNED|systemProfile|requirementKey/);
    expect(screen.getByTestId("commercial-composer-input").className).toContain("motion-reduce:transition-none");
    expect(screen.getByRole("button", { name: "Copy response" })).toBeTruthy();
  });
});
