// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ isArabic: false }));
vi.mock("@/components/i18n/LanguageProvider", () => ({ useLanguage: () => ({ isArabic: mocks.isArabic }) }));
import { DashboardCommandCenter } from "../DashboardCommandCenter";

describe("Dashboard commercial AI entry", () => {
  beforeEach(() => {
    mocks.isArabic = false;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: { customers: 1, catalogItems: 2, quotations: 3, salesOrders: 4, contracts: 5, invoices: 6, payments: 7 } }) }));
  });

  it("presents all commercial intents and routes the compact orb to the real assistant", async () => {
    render(<DashboardCommandCenter />);
    expect(screen.getByText("Tell VOKA what you want to create")).toBeInTheDocument();
    for (const intent of ["Quotation", "Invoice", "Contract", "Sales Order", "Payment", "Drawing Takeoff"]) expect(screen.getAllByText(intent).length).toBeGreaterThan(0);
    const assistantLink = screen.getByRole("link", { name: "Open commercial assistant" });
    const click = vi.spyOn(assistantLink, "click").mockImplementation(() => undefined);
    fireEvent.click(screen.getByRole("button", { name: "Open commercial voice entry" }));
    expect(click).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.getByText("7")).toBeInTheDocument());
  });

  it("renders the entry as a fully Arabic experience", async () => {
    mocks.isArabic = true;
    render(<DashboardCommandCenter />);
    expect(screen.getByText("قل أو اكتب ما تريد إنشاءه")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "افتح الإدخال الصوتي التجاري" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("7")).toBeInTheDocument());
  });

  it("uses an LTR lifecycle separator in English", async () => {
    mocks.isArabic = false;
    const { container } = render(<DashboardCommandCenter />);
    expect(container.textContent).toContain("→");
    expect(container.textContent).not.toContain("←");
  });

  it("uses an RTL lifecycle separator in Arabic", async () => {
    mocks.isArabic = true;
    const { container } = render(<DashboardCommandCenter />);
    expect(container.textContent).toContain("←");
    // The only arrow glyphs in Arabic chrome must be RTL-correct.
    expect(container.textContent).not.toContain("→");
  });
});
