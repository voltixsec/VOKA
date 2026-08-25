// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import DashboardPage from "../page";

let isArabic = false;

vi.mock("@/components/i18n/LanguageProvider", () => ({
  useLanguage: () => ({ isArabic }),
}));

afterEach(() => cleanup());
beforeEach(() => { vi.spyOn(globalThis, "fetch").mockReturnValue(new Promise(() => {})); });

describe("DashboardPage localization", () => {
  it("renders the English dashboard copy in English mode", () => {
    isArabic = false;
    render(<DashboardPage />);
    expect(screen.getByRole("heading", { name: "Your commercial operation at a glance" })).toBeTruthy();
    expect(screen.getByText("Quotations")).toBeTruthy();
  });

  it("renders Arabic copy without the known hard-coded English labels", () => {
    isArabic = true;
    const { container } = render(<DashboardPage />);
    expect(container.querySelector("section")?.getAttribute("dir")).toBe("rtl");
    expect(screen.getByRole("heading", { name: "أعمالك التجارية في مكان واحد" })).toBeTruthy();
    expect(screen.getByText("عروض الأسعار")).toBeTruthy();
    expect(screen.getByText("الدورة التجارية")).toBeTruthy();
    expect(screen.queryByText("Dashboard")).toBeNull();
    expect(screen.queryByText("Overview")).toBeNull();
    expect(screen.queryByText("Customers")).toBeNull();
    expect(screen.queryByText("Open Quotations")).toBeNull();
    expect(screen.queryByText("Approved Deals")).toBeNull();
  });
});
