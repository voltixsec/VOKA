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
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import NewQuotationPage from "../page";

const push = vi.fn();
let isArabic = false;

vi.mock("@/components/i18n/LanguageProvider", () => ({
  useLanguage: () => ({ isArabic }),
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
      return Promise.resolve(response([{
        id: "catalog-1",
        name: "Taxed service",
        code: "SRV-1",
        type: "SERVICE",
        salePrice: 100,
        taxRateId: "tax-10",
        description: "Catalog scope",
      }]));
    }
    if (input === "/api/tax-rates") {
      return Promise.resolve(response([
        { id: "tax-5", name: "VAT 5", percentage: 5, isSystem: false },
        { id: "tax-10", name: "VAT 10", percentage: 10, isSystem: true },
      ]));
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

function postBody(fetchMock: ReturnType<typeof vi.fn>) {
  const call = fetchMock.mock.calls.find(
    ([input, init]) => input === "/api/quotations" && init?.method === "POST",
  );
  if (!call) throw new Error("POST request missing");
  return JSON.parse(String(call[1]?.body));
}

beforeEach(() => {
  isArabic = false;
});

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

  it("loads taxes, defaults catalog tax, previews calculator totals, and submits taxRateId", async () => {
    const fetchMock = fetchForCreate();
    vi.stubGlobal("fetch", fetchMock);
    render(createElement(NewQuotationPage));

    await screen.findByText("Quotation information");
    expect(fetchMock).toHaveBeenCalledWith("/api/tax-rates");
    fireEvent.change(selectFor("Customer"), { target: { value: "customer-1" } });
    fireEvent.change(selectFor("Add product or service"), {
      target: { value: "catalog-1" },
    });

    const tax = await screen.findByRole("combobox", { name: "Tax 1" });
    expect((tax as HTMLSelectElement).value).toBe("tax-10");
    expect(screen.getByText("VAT 10 (10.00%)")).toBeTruthy();
    expect(screen.getAllByText("10.000 KWD").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("110.000 KWD")).toBeTruthy();

    fireEvent.change(selectFor("Discount type"), { target: { value: "PERCENTAGE" } });
    fireEvent.change(inputFor("Discount value"), { target: { value: "10" } });
    expect(await screen.findByText("9.000 KWD")).toBeTruthy();
    expect(screen.getByText("99.000 KWD")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Create proposal" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(
      ([input, init]) => input === "/api/quotations" && init?.method === "POST",
    )).toBe(true));
    const call = fetchMock.mock.calls.find(
      ([input, init]) => input === "/api/quotations" && init?.method === "POST",
    );
    const body = JSON.parse(String(call?.[1]?.body));
    expect(body.lines[0]).toMatchObject({ taxRateId: "tax-10" });
  });

  it("defaults a custom line to No tax and permits selecting an available rate", async () => {
    vi.stubGlobal("fetch", fetchForCreate());
    render(createElement(NewQuotationPage));

    await screen.findByText("Quotation information");
    fireEvent.change(selectFor("Add product or service"), {
      target: { value: "__custom" },
    });
    const tax = await screen.findByRole("combobox", { name: "Tax 1" });
    expect((tax as HTMLSelectElement).value).toBe("");
    expect((screen.getByRole("textbox", { name: "Description 1" }) as HTMLTextAreaElement).value).toBe("");
    expect((screen.getByRole("button", { name: "Move up 1" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Move down 1" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Remove" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(tax, { target: { value: "tax-5" } });
    expect((tax as HTMLSelectElement).value).toBe("tax-5");
  });

  it.each([
    {
      arabic: false,
      descriptionLabel: "Description 1",
      description: "English optional scope",
      locale: "en",
      localizedKey: "descriptionEn",
      inactiveKey: "descriptionAr",
      createLabel: "Create proposal",
      customOption: "+ Custom line",
    },
    {
      arabic: true,
      descriptionLabel: "الوصف 1",
      description: "وصف عربي اختياري",
      locale: "ar",
      localizedKey: "descriptionAr",
      inactiveKey: "descriptionEn",
      createLabel: "إنشاء العرض",
      customOption: "+ بند مخصص",
    },
  ])("submits the active $locale line description without populating the inactive locale", async ({
    arabic,
    descriptionLabel,
    description,
    locale,
    localizedKey,
    inactiveKey,
    createLabel,
    customOption,
  }) => {
    isArabic = arabic;
    const fetchMock = fetchForCreate();
    vi.stubGlobal("fetch", fetchMock);
    render(createElement(NewQuotationPage));

    await screen.findByText(arabic ? "بيانات العرض" : "Quotation information");
    const customerOption = screen.getByRole("option", { name: "Acme" });
    fireEvent.change(customerOption.parentElement as HTMLSelectElement, { target: { value: "customer-1" } });
    const option = screen.getByRole("option", { name: customOption });
    fireEvent.change(option.parentElement as HTMLSelectElement, { target: { value: "__custom" } });
    fireEvent.change(screen.getByRole("textbox", { name: descriptionLabel }), {
      target: { value: description },
    });
    fireEvent.click(screen.getByRole("button", { name: createLabel }));

    await waitFor(() => expect(fetchMock.mock.calls.some(
      ([input, init]) => input === "/api/quotations" && init?.method === "POST",
    )).toBe(true));
    const body = postBody(fetchMock);
    expect(body.localizationSourceLocale).toBe(locale);
    expect(body.lines[0]).toMatchObject({
      description,
      [localizedKey]: description,
      position: 1,
    });
    expect(body.lines[0]).not.toHaveProperty(inactiveKey);
  });

  it("inherits a present catalog description and preserves line fields through reordering", async () => {
    const fetchMock = fetchForCreate();
    vi.stubGlobal("fetch", fetchMock);
    render(createElement(NewQuotationPage));

    await screen.findByText("Quotation information");
    fireEvent.change(selectFor("Customer"), { target: { value: "customer-1" } });
    fireEvent.change(selectFor("Add product or service"), { target: { value: "catalog-1" } });
    expect((screen.getByRole("textbox", { name: "Description 1" }) as HTMLTextAreaElement).value).toBe("Catalog scope");
    fireEvent.change(selectFor("Add product or service"), { target: { value: "__custom" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Item 2" }), { target: { value: "Custom second" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Description 2" }), { target: { value: "Second scope" } });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Unit price 2" }), { target: { value: "20" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Tax 2" }), { target: { value: "tax-5" } });

    fireEvent.click(screen.getByRole("button", { name: "Move up 2" }));
    expect((screen.getByRole("textbox", { name: "Item 1" }) as HTMLInputElement).value).toBe("Custom second");
    expect((screen.getByRole("textbox", { name: "Description 1" }) as HTMLTextAreaElement).value).toBe("Second scope");
    const firstRow = screen.getByRole("textbox", { name: "Item 1" }).closest("div.grid");
    expect(firstRow?.textContent).toContain("21.000");

    fireEvent.click(screen.getByRole("button", { name: "Create proposal" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(
      ([input, init]) => input === "/api/quotations" && init?.method === "POST",
    )).toBe(true));
    const body = postBody(fetchMock);
    expect(body.lines.map((line: { itemName: string }) => line.itemName)).toEqual([
      "Custom second",
      "Taxed service",
    ]);
    expect(body.lines[0]).toMatchObject({
      position: 1,
      description: "Second scope",
      taxRateId: "tax-5",
      taxPercentage: 5,
    });
    expect(body.lines[1]).toMatchObject({
      position: 2,
      catalogItemId: "catalog-1",
      description: "Catalog scope",
      taxRateId: "tax-10",
      taxPercentage: 10,
    });
  });

  it("drops an unavailable catalog tax from preview and submission with a visible warning", async () => {
    const fetchMock = vi.fn().mockImplementation((input: string, init?: RequestInit) => {
      if (input === "/api/auth/me") return Promise.resolve(response({ activeCompanyId: "company-1" }));
      if (input.startsWith("/api/customers")) return Promise.resolve(response({ customers: [{ id: "customer-1", name: "Acme" }] }));
      if (input.startsWith("/api/catalog/items")) return Promise.resolve(response([{
        id: "catalog-1", name: "Taxed service", code: "SRV-1", type: "SERVICE", salePrice: 100, taxRateId: "tax-inactive",
      }]));
      if (input === "/api/tax-rates") return Promise.resolve(response([{ id: "tax-10", name: "VAT 10", percentage: 10, isSystem: true }]));
      if (input === "/api/companies/current/quotation-terms") return Promise.resolve(response({ templates: [] }));
      if (input === "/api/companies/current") return Promise.resolve(response({ defaultCurrency: "KWD" }));
      if (input === "/api/quotations" && init?.method === "POST") return Promise.resolve(response({ id: "quotation-1" }));
      throw new Error(`Unexpected fetch: ${input}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(createElement(NewQuotationPage));

    await screen.findByText("Quotation information");
    fireEvent.change(selectFor("Customer"), { target: { value: "customer-1" } });
    fireEvent.change(selectFor("Add product or service"), { target: { value: "catalog-1" } });
    expect(await screen.findByText("Catalog tax is unavailable. Select an active tax rate.")).toBeTruthy();
    expect((screen.getByRole("combobox", { name: "Tax 1" }) as HTMLSelectElement).value).toBe("");
    expect((screen.getByRole("textbox", { name: "Description 1" }) as HTMLTextAreaElement).value).toBe("");
    expect(screen.getAllByText("100.000 KWD").length).toBeGreaterThanOrEqual(1);

    fireEvent.click(screen.getByRole("button", { name: "Create proposal" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([input, init]) => input === "/api/quotations" && init?.method === "POST")).toBe(true));
    const call = fetchMock.mock.calls.find(([input, init]) => input === "/api/quotations" && init?.method === "POST");
    const body = JSON.parse(String(call?.[1]?.body));
    expect(body.lines[0]).toMatchObject({ taxRateId: null, taxPercentage: 0 });
    expect(body.lines[0]).not.toHaveProperty("taxUnavailable");
  });

  it("keeps custom-line creation usable when optional catalog and tax choices fail", async () => {
    const fetchMock = vi.fn().mockImplementation((input: string) => {
      if (input === "/api/auth/me") return Promise.resolve(response({ activeCompanyId: "company-1" }));
      if (input.startsWith("/api/customers")) return Promise.resolve(response({ customers: [{ id: "customer-1", name: "Acme" }] }));
      if (input.startsWith("/api/catalog/items") || input === "/api/tax-rates") {
        return Promise.resolve({ ok: false, status: 503, json: async () => ({}) });
      }
      if (input === "/api/companies/current/quotation-terms") return Promise.resolve(response({ templates: [] }));
      if (input === "/api/companies/current") return Promise.resolve(response({ defaultCurrency: "KWD" }));
      throw new Error(`Unexpected fetch: ${input}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(createElement(NewQuotationPage));

    expect(await screen.findByText("Catalog unavailable. You can still add a custom line.")).toBeTruthy();
    expect(screen.getByText("Available tax rates could not be loaded.")).toBeTruthy();
    fireEvent.change(selectFor("Add product or service"), { target: { value: "__custom" } });
    expect(screen.getByDisplayValue("Custom line")).toBeTruthy();
    expect((screen.getByRole("combobox", { name: "Tax 1" }) as HTMLSelectElement).value).toBe("");
  });
});
