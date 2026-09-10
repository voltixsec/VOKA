// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CatalogXlsxPanel } from "@/components/catalog/CatalogXlsxPanel";

describe("catalog xlsx panel", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("exposes import export and template actions and does not auto-commit", async () => {
    const onImported = vi.fn();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ data: { total: 1, valid: 0, invalid: 1, rows: [{ rowNumber: 2, values: { code: "X" }, valid: false, errors: ["INVALID_TYPE"] }] } }),
      blob: async () => new Blob(["PK"]),
    } as Response);
    render(<CatalogXlsxPanel isArabic={false} search="" filterType="ALL" onImported={onImported} />);
    expect(screen.getByRole("button", { name: "Import Excel" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export Excel" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download Template" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Import Excel" }));
    expect(screen.getByText(/Nothing is imported until you explicitly commit/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Commit Import" })).not.toBeInTheDocument();
    expect(onImported).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Download Template" }));
    await waitFor(() => expect(String(fetchMock.mock.calls.at(-1)?.[0])).toContain("/api/catalog/items/xlsx/template"));
  });
});
