// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const language = vi.hoisted(() => ({ isArabic: false }));
vi.mock("@/components/i18n/LanguageProvider", () => ({ useLanguage: () => language }));
import SignatoriesPage from "../page";

describe("authorized signatories settings", () => {
  beforeEach(() => { vi.restoreAllMocks(); language.isArabic = false; });

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
    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), { target: { value: "Ahmed" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Title" }), { target: { value: "Director" } });
    fireEvent.click(screen.getByRole("button", { name: "Save signatory" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
    const options = JSON.parse((fetch.mock.calls[1][1] as RequestInit).body as string);
    expect(options).toEqual(expect.objectContaining({ nameEn: "Ahmed", titleEn: "Director", isDefault: true, allowedDocumentTypes: ["QUOTATION"] }));
  });

  it("shows only English identity fields and localized file controls in English", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ data: [] }), { status: 200 }));
    render(<SignatoriesPage />);
    await screen.findByRole("textbox", { name: "Name" });
    expect(screen.getByRole("textbox", { name: "Title" })).toBeInTheDocument();
    expect(screen.queryByText("الاسم بالعربية")).not.toBeInTheDocument();
    expect(screen.queryByText("الصفة بالعربية")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Choose file" })).toHaveLength(2);
    expect(screen.getAllByText("No file selected")).toHaveLength(2);
  });

  it("shows only Arabic identity fields, document types, and file controls in Arabic", async () => {
    language.isArabic = true;
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ data: [] }), { status: 200 }));
    render(<SignatoriesPage />);
    await screen.findByRole("textbox", { name: "الاسم" });
    expect(screen.getByRole("textbox", { name: "الصفة" })).toBeInTheDocument();
    expect(screen.queryByText("Name in English")).not.toBeInTheDocument();
    expect(screen.queryByText("Title in English")).not.toBeInTheDocument();
    expect(screen.getByText("عرض سعر")).toBeInTheDocument();
    expect(screen.getByText("أمر بيع")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "اختيار ملف" })).toHaveLength(2);
    expect(screen.getAllByText("لم يتم اختيار ملف")).toHaveLength(2);
  });
});
