// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import DashboardPage from "../page";

let isArabic = false;

vi.mock("@/components/i18n/LanguageProvider", () => ({
  useLanguage: () => ({ isArabic }),
}));

afterEach(() => cleanup());

describe("DashboardPage localization", () => {
  it("renders the English dashboard copy in English mode", () => {
    isArabic = false;
    render(<DashboardPage />);
    expect(screen.getByRole("heading", { name: "Dashboard" })).toBeTruthy();
    expect(screen.getByText("Open Quotations")).toBeTruthy();
  });

  it("renders Arabic copy without the known hard-coded English labels", () => {
    isArabic = true;
    const { container } = render(<DashboardPage />);
    expect(container.querySelector("section")?.getAttribute("dir")).toBe("rtl");
    expect(screen.getByRole("heading", { name: "لوحة التحكم" })).toBeTruthy();
    expect(screen.getByText("عروض الأسعار المفتوحة")).toBeTruthy();
    expect(screen.getByText("مسار مبيعات VOKA")).toBeTruthy();
    expect(screen.queryByText("Dashboard")).toBeNull();
    expect(screen.queryByText("Overview")).toBeNull();
    expect(screen.queryByText("Customers")).toBeNull();
    expect(screen.queryByText("Open Quotations")).toBeNull();
    expect(screen.queryByText("Approved Deals")).toBeNull();
  });
});
