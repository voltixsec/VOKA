// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ isArabic: false }));
vi.mock("@/components/i18n/LanguageProvider", () => ({
  useLanguage: () => ({ isArabic: mocks.isArabic }),
}));

import ProductsPage from "../page";

function okJson(data: unknown, meta?: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => (meta ? { data, meta } : { data }),
  } as Response;
}

describe("Products page localization polish", () => {
  beforeEach(() => {
    mocks.isArabic = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string) => {
        if (input.includes("/api/catalog/items")) {
          return okJson([], { pagination: { total: 0, page: 1, pageSize: 10, totalPages: 1 } });
        }
        return okJson([]);
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("uses grammatically correct Arabic for the catalog eyebrow", async () => {
    mocks.isArabic = true;
    render(<ProductsPage />);
    expect(await screen.findByText("الكتالوج التجاري")).toBeInTheDocument();
    // The previous incorrect feminine agreement must not appear.
    expect(screen.queryByText("الكتالوج التجارية")).not.toBeInTheDocument();
  });

  it("surfaces a localized Arabic error when the catalog request fails", async () => {
    mocks.isArabic = true;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string) => {
        if (input.includes("/api/catalog/items")) {
          // Simulate a thrown non-Error rejection path so the catch fallback is exercised.
          return Promise.reject("boom");
        }
        return okJson([]);
      }),
    );
    render(<ProductsPage />);
    await waitFor(() =>
      expect(screen.getByText("تعذر تحميل البيانات")).toBeInTheDocument(),
    );
  });
});
