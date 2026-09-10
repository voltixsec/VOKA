// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/i18n/LanguageProvider", () => ({
  useLanguage: () => ({ isArabic: false }),
}));

import CustomersPage from "../page";

function json(data: unknown) {
  return {
    ok: true,
    json: async () => ({ data }),
  } as Response;
}

const summaries = { total: 40, LEAD: 8, ACTIVE: 25, INACTIVE: 5, BLOCKED: 2 };

describe("customer list page", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders authoritative totals and does not show Prospect", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      json({
        customers: [{ id: "c-1", code: "C-1", name: "Acme", type: "COMPANY", status: "ACTIVE" }],
        pagination: { total: 40, page: 1, pageSize: 20, totalPages: 2 },
        summaries,
      }),
    );
    render(<CustomersPage />);
    await screen.findByText("Acme");
    expect(screen.getByText("40")).toBeInTheDocument();
    expect(screen.getByText("25")).toBeInTheDocument();
    expect(screen.getByText("8")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("40 results")).toBeInTheDocument();
    expect(screen.queryByText("Prospects")).not.toBeInTheDocument();
    expect(screen.queryByText("Prospect")).not.toBeInTheDocument();
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
  });

  it("sends search, status and type to the API and resets page on filter change", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      json({
        customers: [{ id: "c-1", code: "C-1", name: "Acme", type: "COMPANY", status: "ACTIVE" }],
        pagination: { total: 1, page: 1, pageSize: 20, totalPages: 1 },
        summaries,
      }),
    );
    render(<CustomersPage />);
    await screen.findByText("Acme");
    fireEvent.click(screen.getByRole("button", { name: "Filter" }));
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "LEAD" } });
    fireEvent.change(screen.getByLabelText("Type"), { target: { value: "INDIVIDUAL" } });
    fireEvent.change(screen.getByPlaceholderText("Search customers..."), { target: { value: "Noor" } });
    await waitFor(() => {
      expect(String(fetchMock.mock.calls.at(-1)?.[0])).toContain("search=Noor");
    });
    const last = String(fetchMock.mock.calls.at(-1)?.[0]);
    expect(last).toContain("status=LEAD");
    expect(last).toContain("type=INDIVIDUAL");
    expect(last).toContain("page=1");
    expect(last).toContain("pageSize=20");
  });

  it("requests the next page from the API", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      json({
        customers: [{ id: "c-1", code: "C-1", name: "Acme", type: "COMPANY", status: "ACTIVE" }],
        pagination: { total: 40, page: 1, pageSize: 20, totalPages: 2 },
        summaries,
      }),
    );
    render(<CustomersPage />);
    await screen.findByText("Acme");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => {
      expect(String(fetchMock.mock.calls.at(-1)?.[0])).toContain("page=2");
    });
  });
});
