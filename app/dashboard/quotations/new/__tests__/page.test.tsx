// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { createElement } from "react";
import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import NewQuotationPage from "../page";

const push = vi.fn();

vi.mock("@/components/i18n/LanguageProvider", () => ({
  useLanguage: () => ({ isArabic: false }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

function response(data: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ data }),
  };
}

function fetchForCreate() {
  return vi.fn().mockImplementation((input: string, init?: RequestInit) => {
    if (input === "/api/auth/me") {
      return Promise.resolve(response({ activeCompanyId: "company-1" }));
    }
    if (input.startsWith("/api/customers")) {
      return Promise.resolve(response({
        customers: [{ id: "customer-1", name: "Acme" }],
      }));
    }
    if (input.startsWith("/api/catalog/items")) {
      return Promise.resolve(response([]));
    }
    if (input === "/api/companies/current/quotation-terms") {
      return Promise.resolve(response({ templates: [] }));
    }
    if (input === "/api/companies/current") {
      return Promise.resolve(response({ defaultCurrency: "KWD" }));
    }
    if (input === "/api/quotations" && init?.method === "POST") {
      return Promise.resolve(response({ id: "quotation-1" }));
    }
    throw new Error(`Unexpected fetch: ${input}`);
  });
}

function selectFor(label: string): HTMLSelectElement {
  const select = screen.getByText(label).closest("label")?.querySelector("select");
  if (!select) throw new Error(`Select missing for ${label}`);
  return select;
}

function inputFor(label: string): HTMLInputElement {
  const input = screen.getByText(label).closest("label")?.querySelector("input");
  if (!input) throw new Error(`Input missing for ${label}`);
  return input;
}

afterEach(() => {
  cleanup();
  push.mockReset();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("NewQuotationPage expiry date", () => {
  it.each([
    ["2026-09-15", "2026-09-15T23:59:59.999+03:00"],
    ["", undefined],
  ] as const)("submits optional expiry %s", async (selected, expected) => {
    const fetchMock = fetchForCreate();
    vi.stubGlobal("fetch", fetchMock);

    render(createElement(NewQuotationPage));

    await screen.findByText("Quotation information");
    fireEvent.change(selectFor("Customer"), { target: { value: "customer-1" } });
    fireEvent.change(selectFor("Add product or service"), {
      target: { value: "__custom" },
    });
    if (selected) {
      fireEvent.change(inputFor("Quotation expiry date"), {
        target: { value: selected },
      });
    }
    fireEvent.click(screen.getByRole("button", { name: "Create proposal" }));

    await waitFor(() => expect(fetchMock.mock.calls.some(
      ([input, init]) => input === "/api/quotations" && init?.method === "POST",
    )).toBe(true));
    const call = fetchMock.mock.calls.find(
      ([input, init]) => input === "/api/quotations" && init?.method === "POST",
    );
    const body = JSON.parse(String(call?.[1]?.body));

    if (expected === undefined) {
      expect(body).not.toHaveProperty("expiryDate");
    } else {
      expect(body.expiryDate).toBe(expected);
    }
  });
});
