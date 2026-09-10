// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  customerListQueryString,
  fetchAllMatchingCustomers,
  useCustomers,
} from "../../../../hooks/useCustomers";

function page(customers: Array<{ id: string }>, pagination: object, summaries = { total: 40, LEAD: 5, ACTIVE: 30, INACTIVE: 3, BLOCKED: 2 }) {
  return {
    ok: true,
    json: async () => ({ data: { customers, pagination, summaries } }),
  } as Response;
}

describe("customer list query", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("always sends page and pageSize so page 1 is not treated as the full dataset", () => {
    expect(customerListQueryString({})).toBe("page=1&pageSize=20");
    expect(customerListQueryString({ search: " Noor ", status: "ACTIVE", type: "COMPANY", page: 2, pageSize: 20 })).toBe(
      "search=Noor&status=ACTIVE&type=COMPANY&page=2&pageSize=20",
    );
  });

  it("loads through the API with search, filters and pagination", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      page([{ id: "c-1" }], { total: 40, page: 2, pageSize: 20, totalPages: 2 }),
    );
    const { result } = renderHook(() =>
      useCustomers({ search: "Noor", status: "ACTIVE", type: "COMPANY", page: 2, pageSize: 20 }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/customers?search=Noor&status=ACTIVE&type=COMPANY&page=2&pageSize=20",
      { cache: "no-store" },
    );
    expect(result.current.pagination).toEqual({ total: 40, page: 2, pageSize: 20, totalPages: 2 });
    expect(result.current.summaries.total).toBe(40);
    expect(result.current.customers).toHaveLength(1);
  });

  it("export fetch walks every matching page instead of the visible page only", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(page([{ id: "1" }], { total: 101, page: 1, pageSize: 100, totalPages: 2 }))
      .mockResolvedValueOnce(page([{ id: "2" }], { total: 101, page: 2, pageSize: 100, totalPages: 2 }));
    const rows = await fetchAllMatchingCustomers({ search: "a", status: "LEAD", type: "" });
    expect(rows.map((row) => row.id)).toEqual(["1", "2"]);
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      "/api/customers?search=a&status=LEAD&page=1&pageSize=100",
      "/api/customers?search=a&status=LEAD&page=2&pageSize=100",
    ]);
  });
});
