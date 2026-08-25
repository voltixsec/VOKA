// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/i18n/LanguageProvider", () => ({ useLanguage: () => ({ isArabic: false }) }));
import SignatoriesPage from "../page";

describe("authorized signatories settings", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it("shows snapshotted governance and existing default signatory", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ data: [{ id: "s-1", nameAr: "أحمد", nameEn: "Ahmed", titleAr: "المدير", titleEn: "Director", signatureUrl: null, isActive: true, isDefault: true, allowedDocumentTypes: ["QUOTATION"] }] }), { status: 200 }));
    render(<SignatoriesPage />);
    expect(await screen.findByText("Ahmed")).toBeInTheDocument();
    expect(screen.getByText("Default")).toBeInTheDocument();
    expect(screen.getByText(/snapshotted when a document is approved/i)).toBeInTheDocument();
  });

  it("creates the first signatory as default with bounded document types", async () => {
    const fetch = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { id: "s-1" } }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [] }), { status: 200 }));
    render(<SignatoriesPage />);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const inputs = screen.getAllByRole("textbox");
    fireEvent.change(inputs[1], { target: { value: "Ahmed" } });
    fireEvent.change(inputs[3], { target: { value: "Director" } });
    fireEvent.click(screen.getByRole("button", { name: "Save signatory" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
    const options = JSON.parse((fetch.mock.calls[1][1] as RequestInit).body as string);
    expect(options).toEqual(expect.objectContaining({ nameEn: "Ahmed", titleEn: "Director", isDefault: true, allowedDocumentTypes: ["QUOTATION"] }));
  });
});
