// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/components/i18n/LanguageProvider", () => ({ useLanguage: () => ({ isArabic: false }) }));
import ReportsPage from "../page";
describe("receivables aging page", () => {
  beforeEach(() => { vi.restoreAllMocks(); });
  it("renders exact aging totals and operational invoice links", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ data: { asOf: "2026-08-25T23:59:59.999Z", currencyCode: "KWD", invoiceCount: 1, totalOutstanding: "50.500", buckets: { CURRENT: "0.000", DAYS_0_30: "0.000", DAYS_31_60: "0.000", DAYS_61_90: "0.000", DAYS_90_PLUS: "50.500" }, invoices: [{ id: "i-1", number: "INV-1", dueDate: "2026-01-01T00:00:00Z", overdueDays: 236, bucket: "DAYS_90_PLUS", outstandingAmount: "50.500", customer: { name: "Customer", nameAr: null, nameEn: "Customer" } }] } }), { status: 200 }));
    render(<ReportsPage />); expect(await screen.findByRole("link", { name: "INV-1" })).toHaveAttribute("href", "/dashboard/invoices/i-1"); expect(screen.getAllByText("90+ days")).toHaveLength(2); expect(screen.getAllByText(/KWD/).length).toBeGreaterThan(0);
  });
});
