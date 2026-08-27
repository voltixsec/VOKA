// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SalesAssistantPage from "../page";

vi.mock("@/components/i18n/LanguageProvider", () => ({ useLanguage: () => ({ isArabic: false }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const base = { locale: "en", fields: { customerMention: null, currencyCode: null, paymentTerms: null, scopeType: null, sourceReference: null, lines: [{ itemName: "camera", quantity: 20 }] }, attachment: null, recommended: [], requiresHumanReview: true, executed: false } as const;

describe("commercial conversational clarification", () => {
  beforeEach(() => sessionStorage.clear());

  it("merges a typed second reply into the same draft", async () => {
    const first = { ...base, id: "same-draft", operation: "QUOTATION", turns: [{ source: "TEXT", text: "Create quotation for 20 cameras" }], contextText: "Create quotation for 20 cameras", missingRequired: [{ key: "customer", required: true, labelAr: "العميل", labelEn: "Customer" }], status: "NEEDS_CLARIFICATION", clarification: { ar: "من هو العميل؟", en: "Who is the customer?", suggestions: [] } };
    const second = { ...first, fields: { ...first.fields, customerMention: "Al Noor" }, turns: [...first.turns, { source: "TEXT", text: "Customer is Al Noor" }], contextText: "Create quotation for 20 cameras\nCustomer is Al Noor", missingRequired: [], status: "READY_FOR_REVIEW", clarification: null };
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ data: first }) }).mockResolvedValueOnce({ ok: true, json: async () => ({ data: second }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<SalesAssistantPage />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Create quotation for 20 cameras" } });
    fireEvent.click(screen.getByRole("button", { name: "Understand & review operation" }));
    await screen.findByText("Who is the customer?");
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Customer is Al Noor" } });
    fireEvent.click(screen.getByRole("button", { name: "Understand & review operation" }));
    await screen.findByText("READY FOR REVIEW");
    const body = JSON.parse(String((fetchMock.mock.calls[1]?.[1] as RequestInit).body));
    expect(body.draft.id).toBe("same-draft");
    expect(body.replySource).toBe("TEXT");
  });

  it("uses a suggestion chip as a real reply and immediately re-evaluates", async () => {
    const first = { ...base, id: "chip-draft", operation: "CONTRACT", turns: [{ source: "TEXT", text: "Create contract for Al Noor cameras" }], contextText: "Create contract for Al Noor cameras", missingRequired: [{ key: "lines", required: true, labelAr: "البنود", labelEn: "Lines" }], status: "NEEDS_CLARIFICATION", clarification: { ar: "ما البنود؟", en: "Which lines?", suggestions: [{ ar: "خدمة", en: "Service", reply: "Add one service line" }] } };
    const second = { ...first, missingRequired: [], status: "READY_FOR_REVIEW", clarification: null, turns: [...first.turns, { source: "CHIP", text: "Add one service line" }] };
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ data: first }) }).mockResolvedValueOnce({ ok: true, json: async () => ({ data: second }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<SalesAssistantPage />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Create contract for Al Noor cameras" } });
    fireEvent.click(screen.getByRole("button", { name: "Understand & review operation" }));
    fireEvent.click(await screen.findByRole("button", { name: "Service" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const body = JSON.parse(String((fetchMock.mock.calls[1]?.[1] as RequestInit).body));
    expect(body.draft.id).toBe("chip-draft");
    expect(body.replySource).toBe("CHIP");
  });
});
