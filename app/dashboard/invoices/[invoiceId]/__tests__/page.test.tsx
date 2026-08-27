// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const language = vi.hoisted(() => ({ isArabic: false }));
vi.mock("@/components/i18n/LanguageProvider", () => ({ useLanguage: () => language }));
vi.mock("next/navigation", () => ({ useParams: () => ({ invoiceId: "invoice-1" }) }));

import InvoiceDetails from "../page";

const invoice = {
  id: "invoice-1", number: "INV-202608-0002", status: "ISSUED", settlementStatus: "UNPAID",
  origin: "DIRECT", sourceKind: null, sourceId: null, sourceQuotationRevisionNumber: null,
  currencyCode: "KWD", invoiceDate: "2026-08-27", dueDate: null, customer: { name: "Acme" },
  lines: [{ position: 1, itemName: "Service", quantity: 1, unitPrice: 10, taxAmount: 0, totalAmount: 10 }],
  totals: { subtotal: 10, discountAmount: 0, taxAmount: 0, totalAmount: 10 }, paidAmount: 0,
  outstandingAmount: 10, issuedAt: "2026-08-27T13:30:00.000Z",
  issuedBy: { name: "System Administrator", role: "ADMIN" }, voidReason: null,
};

describe("invoice detail localization", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    language.isArabic = false;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) =>
      new Response(JSON.stringify(String(input).includes("/payments") ? { data: { payments: [] } } : { data: invoice }), { status: 200 }),
    );
  });

  it("presents invoice statuses and origin professionally in English", async () => {
    render(<InvoiceDetails />);
    expect(await screen.findByText("INV-202608-0002")).toBeInTheDocument();
    expect(screen.getByText("Issued")).toBeInTheDocument();
    expect(screen.getByText("Unpaid")).toBeInTheDocument();
    expect(screen.getByText("Direct")).toBeInTheDocument();
    expect(screen.queryByText("ISSUED")).not.toBeInTheDocument();
  });

  it("does not expose raw English invoice enums or system actor wording in Arabic", async () => {
    language.isArabic = true;
    render(<InvoiceDetails />);
    expect(await screen.findByText("INV-202608-0002")).toBeInTheDocument();
    expect(screen.getByText("صادرة")).toBeInTheDocument();
    expect(screen.getByText("غير مدفوعة")).toBeInTheDocument();
    expect(screen.getByText("مباشرة")).toBeInTheDocument();
    expect(screen.getByText(/مسؤول النظام/)).toBeInTheDocument();
    expect(screen.queryByText("ISSUED")).not.toBeInTheDocument();
    expect(screen.queryByText("UNPAID")).not.toBeInTheDocument();
    expect(screen.queryByText("DIRECT")).not.toBeInTheDocument();
    expect(screen.queryByText(/System Administrator/)).not.toBeInTheDocument();
  });
});
