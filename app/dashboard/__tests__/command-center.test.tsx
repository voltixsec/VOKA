// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/components/i18n/LanguageProvider", () => ({ useLanguage: () => ({ isArabic: false }) }));
import DashboardPage from "../page";

describe("dashboard command center", () => {
  beforeEach(() => { vi.restoreAllMocks(); });
  it("shows real tenant summary counts and operational links", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ data: { customers: 11, catalogItems: 22, quotations: 3, salesOrders: 4, contracts: 5, invoices: 6, payments: 7 } }), { status: 200 }));
    render(<DashboardPage />);
    expect(await screen.findByText("22")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Products & Services/ })).toHaveAttribute("href", "/dashboard/products");
    expect(screen.getByRole("link", { name: /Invoices/ })).toHaveAttribute("href", "/dashboard/invoices");
    expect(screen.getByRole("link", { name: "Start with voice" })).toHaveAttribute("href", "/dashboard/sales-assistant");
  });
  it("does not render decorative zeroes while data is loading", () => {
    vi.spyOn(globalThis, "fetch").mockReturnValue(new Promise(() => {}));
    render(<DashboardPage />);
    expect(screen.getAllByLabelText("Loading")).toHaveLength(7);
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });
});
