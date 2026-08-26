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
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { operation: "DRAWING_TAKEOFF" } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { session: { id: "takeoff-1" } } }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<SalesAssistantPage />);
    fireEvent.change(screen.getByLabelText("Attach commercial file"), { target: { files: [new File(["%PDF-1.7"], "drawing.pdf", { type: "application/pdf" })] } });
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Count CCTV cameras in this drawing" } });
    fireEvent.click(screen.getByRole("button", { name: "Understand & review operation" }));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/dashboard/takeoff?sessionId=takeoff-1"));
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/drawing-takeoffs", expect.objectContaining({ method: "POST", body: expect.any(FormData) }));
  });

  it("does not pretend a general attachment is supported by a non-drawing workflow", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { operation: "QUOTATION" } }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<SalesAssistantPage />);
    fireEvent.change(screen.getByLabelText("Attach commercial file"), { target: { files: [new File(["%PDF-1.7"], "supplier-quote.pdf", { type: "application/pdf" })] } });
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Create a quotation from this supplier document" } });
    fireEvent.click(screen.getByRole("button", { name: "Understand & review operation" }));
    expect(await screen.findByText(/General attachments/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mocks.push).not.toHaveBeenCalled();
  });
});
