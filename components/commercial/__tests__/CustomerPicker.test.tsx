// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CustomerPicker } from "../CustomerPicker";

describe("CustomerPicker", () => {
  it("quick-creates the minimum bilingual-safe customer and keeps document context", async () => {
    const onChange = vi.fn(), onCreated = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { customer: { id: "customer-2", name: "Gulf Joy", nameEn: "Gulf Joy" } } }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<CustomerPicker customers={[]} value="" isArabic={false} onChange={onChange} onCreated={onCreated} />);
    fireEvent.change(screen.getByLabelText("Customer search"), { target: { value: "Gulf Joy" } });
    fireEvent.click(screen.getByRole("button", { name: 'Create "Gulf Joy"' }));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith("customer-2"));
    expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ id: "customer-2" }));
    expect(fetchMock).toHaveBeenCalledWith("/api/customers", expect.objectContaining({ method: "POST", body: JSON.stringify({ nameEn: "Gulf Joy", type: "COMPANY", status: "LEAD" }) }));
  });

  it("offers create-and-edit without requiring email", () => {
    render(<CustomerPicker customers={[]} value="" isArabic onChange={vi.fn()} onCreated={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("بحث العميل"), { target: { value: "شركة أفراح الخليج" } });
    fireEvent.click(screen.getByRole("button", { name: "إنشاء وتعديل..." }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByDisplayValue("شركة أفراح الخليج")).toBeInTheDocument();
    expect(dialog.getByLabelText(/البريد الإلكتروني/i)).not.toBeRequired();
  });
});
