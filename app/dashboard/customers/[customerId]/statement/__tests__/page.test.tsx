// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useParams: () => ({ customerId: "customer-1" }) }));
vi.mock("@/components/i18n/LanguageProvider", () => ({ useLanguage: () => ({ isArabic: false }) }));
import CustomerStatementPage from "../page";

describe("customer statement page", () => {
  beforeEach(() => { vi.restoreAllMocks(); });
  it("renders debit, credit, running, opening and outstanding balances", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ data: {
      customer: { id: "customer-1", code: "CUS-1", name: "Customer", nameAr: null, nameEn: "Customer" }, currencyCode: "KWD",
      openingBalance: "75.000", closingBalance: "115.000", outstandingBalance: "90.000",
      entries: [{ id: "invoice:i-1", kind: "INVOICE", date: "2026-02-01T00:00:00.000Z", reference: "INV-1", debit: "50.125", credit: "0.000", runningBalance: "125.125" }, { id: "payment:p-1", kind: "PAYMENT", date: "2026-02-02T00:00:00.000Z", reference: "PAY-1", debit: "0.000", credit: "10.125", runningBalance: "115.000" }],
    } }), { status: 200 }));
    render(<CustomerStatementPage />);
    expect(await screen.findByText("INV-1")).toBeInTheDocument(); expect(screen.getByText("PAY-1")).toBeInTheDocument();
    expect(screen.getByText("Opening balance")).toBeInTheDocument(); expect(screen.getByText("Outstanding balance")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Download PDF" })).toHaveAttribute("href", expect.stringContaining("/statement/pdf?"));
    expect(screen.getByRole("link", { name: "Download Excel" })).toHaveAttribute("href", expect.stringContaining("/statement/xlsx?"));
    expect(globalThis.fetch).toHaveBeenCalledWith(expect.stringContaining("/api/customers/customer-1/statement?"), { cache: "no-store" });
  });
});
