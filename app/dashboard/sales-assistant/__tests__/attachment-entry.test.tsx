// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SalesAssistantPage from "../page";

const mocks = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("@/components/i18n/LanguageProvider", () => ({ useLanguage: () => ({ isArabic: false }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));

describe("Commercial AI attachment-first entry", () => {
  beforeEach(() => { mocks.push.mockReset(); sessionStorage.clear(); });

  it("registers one drawing PDF through the governed takeoff endpoint before routing", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { id: "draft-1", operation: "DRAWING_TAKEOFF", locale: "en", fields: { customerMention: null, currencyCode: null, paymentTerms: null, scopeType: null, sourceReference: null, lines: [] }, attachment: { name: "drawing.pdf", type: "application/pdf", size: 8 }, turns: [{ source: "TEXT", text: "Count CCTV cameras in this drawing" }], contextText: "Count CCTV cameras in this drawing", missingRequired: [], recommended: [], status: "READY_FOR_REVIEW", clarification: null, requiresHumanReview: true, executed: false } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { session: { id: "takeoff-1" } } }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<SalesAssistantPage />);
    fireEvent.change(screen.getByLabelText("Attach commercial file"), { target: { files: [new File(["%PDF-1.7"], "drawing.pdf", { type: "application/pdf" })] } });
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Count CCTV cameras in this drawing" } });
    fireEvent.click(screen.getByRole("button", { name: "Understand & review operation" }));
    fireEvent.click(await screen.findByRole("button", { name: "Open for human review" }));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/dashboard/takeoff?sessionId=takeoff-1"));
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/drawing-takeoffs", expect.objectContaining({ method: "POST", body: expect.any(FormData) }));
  });

  it("keeps a general attachment associated with a commercial conversation without executing", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { id: "draft-2", operation: "QUOTATION", locale: "en", fields: { customerMention: null, currencyCode: null, paymentTerms: null, scopeType: null, sourceReference: null, lines: [] }, attachment: { name: "supplier-quote.pdf", type: "application/pdf", size: 8 }, turns: [{ source: "TEXT", text: "Create a quotation from this supplier document" }], contextText: "Create a quotation from this supplier document", missingRequired: [{ key: "customer", required: true, labelAr: "العميل", labelEn: "Customer" }], recommended: [], status: "NEEDS_CLARIFICATION", clarification: { ar: "من هو العميل؟", en: "Who is the customer?", suggestions: [] }, requiresHumanReview: true, executed: false } }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<SalesAssistantPage />);
    fireEvent.change(screen.getByLabelText("Attach commercial file"), { target: { files: [new File(["%PDF-1.7"], "supplier-quote.pdf", { type: "application/pdf" })] } });
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Create a quotation from this supplier document" } });
    fireEvent.click(screen.getByRole("button", { name: "Understand & review operation" }));
    expect(await screen.findByText(/Who is the customer/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mocks.push).not.toHaveBeenCalled();
    expect(JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body)).attachment.name).toBe("supplier-quote.pdf");
  });
});
