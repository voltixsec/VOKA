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

import EditQuotationPage from "../page";

let isArabic = false;
const push = vi.fn();

vi.mock("@/components/i18n/LanguageProvider", () => ({
  useLanguage: () => ({ isArabic }),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ quotationId: "quotation-1" }),
  useRouter: () => ({ push }),
}));

const quotation = {
  id: "quotation-1",
  quotationNumber: "QT-1001",
  status: "DRAFT",
  currencyCode: "KWD",
  issueDate: "2026-08-14T12:00:00.000Z",
  expiryDate: "2026-09-01T23:59:59.999Z",
  lines: [
    {
      id: "line-1",
      position: 1,
      type: "PRODUCT",
      itemName: "Item",
      itemNameAr: "\u0635\u0646\u0641",
      itemNameEn: "Item",
      unitName: "unit",
      unitNameAr: "\u0648\u062d\u062f\u0629",
      unitNameEn: "unit",
      quantity: 1,
      unitPrice: 10,
      taxRateId: "tax-1",
      taxPercentage: 5,
    },
  ],
  projectName: "Project",
  projectNameAr: "\u0645\u0634\u0631\u0648\u0639",
  projectNameEn: "Project",
  attentionName: "Attention",
  attentionNameAr: "\u0639\u0646\u0627\u064a\u0629",
  attentionNameEn: "Attention",
  subjectAr: "\u0645\u0648\u0636\u0648\u0639 \u0639\u0631\u0628\u064a",
  subjectEn: "English subject",
  briefAr: "\u0645\u0644\u062e\u0635 \u0639\u0631\u0628\u064a",
  briefEn: "English brief",
  notes: "Notes",
  notesAr: "\u0645\u0644\u0627\u062d\u0638\u0627\u062a",
  notesEn: "Notes",
  termsAndConditions: "Terms",
  termsAndConditionsAr: "\u0634\u0631\u0648\u0637",
  termsAndConditionsEn: "Terms",
  discount: null,
};

const catalogItem = {
  id: "catalog-1",
  name: "Catalog camera",
  code: "CAM-1",
  type: "PRODUCT",
  salePrice: 25.5,
  taxRateId: "tax-1",
};

const taxRates = [
  { id: "tax-1", name: "VAT 5", percentage: 5, isSystem: false },
  { id: "tax-10", name: "VAT 10", percentage: 10, isSystem: true },
];

function response(data: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ data }),
  };
}

function fetchForEdit() {
  return vi.fn().mockImplementation(
    (input: string, init?: RequestInit) => {
      if (input.startsWith("/api/catalog/items")) {
        return Promise.resolve(response([catalogItem]));
      }

      if (input === "/api/tax-rates") {
        return Promise.resolve(response(taxRates));
      }

      if (init?.method === "PATCH") {
        return Promise.resolve(response(quotation));
      }

      return Promise.resolve(response(quotation));
    },
  );
}

function patchBody(fetchMock: ReturnType<typeof vi.fn>) {
  const call = fetchMock.mock.calls.find(
    ([, init]) => init?.method === "PATCH",
  );

  if (!call) {
    throw new Error("PATCH request missing");
  }

  return JSON.parse(String(call[1].body));
}

function controlFor(label: string) {
  const wrapper = screen.getByText(label).closest("label");
  const control = wrapper?.querySelector("input, textarea");

  if (!control) {
    throw new Error(`Control missing for ${label}`);
  }

  return control as HTMLInputElement | HTMLTextAreaElement;
}

beforeEach(() => {
  isArabic = false;
  push.mockReset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("EditQuotationPage active language", () => {
  it.each([
    {
      arabic: false,
      subject: "English subject",
      brief: "English brief",
      hiddenSubject: "\u0645\u0648\u0636\u0648\u0639 \u0639\u0631\u0628\u064a",
      hiddenBrief: "\u0645\u0644\u062e\u0635 \u0639\u0631\u0628\u064a",
    },
    {
      arabic: true,
      subject: "\u0645\u0648\u0636\u0648\u0639 \u0639\u0631\u0628\u064a",
      brief: "\u0645\u0644\u062e\u0635 \u0639\u0631\u0628\u064a",
      hiddenSubject: "English subject",
      hiddenBrief: "English brief",
    },
  ])("shows only the $arabic active-language subject and brief", async ({
    arabic,
    subject,
    brief,
    hiddenSubject,
    hiddenBrief,
  }) => {
    isArabic = arabic;
    vi.stubGlobal("fetch", fetchForEdit());

    render(createElement(EditQuotationPage));

    expect(await screen.findByDisplayValue(subject)).toBeTruthy();
    expect(screen.getByDisplayValue(brief)).toBeTruthy();
    expect(screen.queryByDisplayValue(hiddenSubject)).toBeNull();
    expect(screen.queryByDisplayValue(hiddenBrief)).toBeNull();
  });

  it.each([
    {
      arabic: false,
      label: "Proposal subject",
      next: "Updated English",
      sourceLocale: "en",
      expected: {
        subjectAr: "\u0645\u0648\u0636\u0648\u0639 \u0639\u0631\u0628\u064a",
        subjectEn: "Updated English",
      },
    },
    {
      arabic: true,
      label: "\u0645\u0648\u0636\u0648\u0639 \u0627\u0644\u0639\u0631\u0636",
      next: "\u0645\u0648\u0636\u0648\u0639 \u0645\u062d\u062f\u062b",
      sourceLocale: "ar",
      expected: {
        subjectAr: "\u0645\u0648\u0636\u0648\u0639 \u0645\u062d\u062f\u062b",
        subjectEn: "English subject",
      },
    },
  ])("preserves the inactive language when saving", async ({
    arabic,
    label,
    next,
    sourceLocale,
    expected,
  }) => {
    isArabic = arabic;
    const fetchMock = fetchForEdit();
    vi.stubGlobal("fetch", fetchMock);

    render(createElement(EditQuotationPage));

    await screen.findByText(label);
    fireEvent.change(controlFor(label), { target: { value: next } });
    fireEvent.click(screen.getByRole("button", {
      name: arabic ? "\u062d\u0641\u0638 \u0627\u0644\u062a\u0639\u062f\u064a\u0644\u0627\u062a" : "Save changes",
    }));

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(
        ([, init]) => init?.method === "PATCH",
      )).toBe(true);
    });
    const body = patchBody(fetchMock);

    expect(body).toMatchObject({
      localizationSourceLocale: sourceLocale,
      ...expected,
    });
  });

  it("loads catalog items without making quotation loading depend on them", async () => {
    const fetchMock = fetchForEdit();
    vi.stubGlobal("fetch", fetchMock);

    render(createElement(EditQuotationPage));

    expect(await screen.findByRole("option", {
      name: "CAM-1 - Catalog camera",
    })).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/catalog/items?pageSize=100&isActive=true",
    );
  });

  it("keeps draft editing available when optional catalog loading fails", async () => {
    const fetchMock = vi.fn().mockImplementation((input: string) => {
      if (input.startsWith("/api/catalog/items")) {
        return Promise.resolve({ ok: false, status: 500 });
      }

      return Promise.resolve(response(quotation));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(createElement(EditQuotationPage));

    expect(await screen.findByText("QT-1001")).toBeTruthy();
    expect(screen.getByText(
      "Catalog unavailable. You can still add a custom line.",
    )).toBeTruthy();
    expect(screen.getByRole("option", { name: "+ Custom line" })).toBeTruthy();
  });

  it("adds a catalog line with identity, commercial defaults, and the next position", async () => {
    const fetchMock = fetchForEdit();
    vi.stubGlobal("fetch", fetchMock);

    render(createElement(EditQuotationPage));

    const selector = await screen.findByRole("combobox", {
      name: "Add product or service",
    });
    fireEvent.change(selector, { target: { value: "catalog-1" } });
    expect(await screen.findByDisplayValue("Catalog camera")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(
      fetchMock.mock.calls.some(([, init]) => init?.method === "PATCH"),
    ).toBe(true));
    const body = patchBody(fetchMock);

    expect(body.localizationSourceLocale).toBe("en");
    expect(body.lines).toHaveLength(2);
    expect(body.lines[0]).toMatchObject({
      id: "line-1",
      itemNameAr: "\u0635\u0646\u0641",
      itemNameEn: "Item",
      position: 1,
    });
    expect(body.lines[1]).toMatchObject({
      catalogItemId: "catalog-1",
      taxRateId: "tax-1",
      type: "PRODUCT",
      itemCode: "CAM-1",
      itemName: "Catalog camera",
      itemNameEn: "Catalog camera",
      unitName: "PCS",
      unitNameEn: "PCS",
      quantity: 1,
      unitPrice: 25.5,
      taxPercentage: 5,
      position: 2,
    });
    expect(body.lines[1]).not.toHaveProperty("itemNameAr");
    expect(body.lines[1]).not.toHaveProperty("unitNameAr");
  });

  it("adds a custom line with active-language values only", async () => {
    isArabic = true;
    const fetchMock = fetchForEdit();
    vi.stubGlobal("fetch", fetchMock);

    render(createElement(EditQuotationPage));

    const selector = await screen.findByRole("combobox", {
      name: "\u0625\u0636\u0627\u0641\u0629 \u0645\u0646\u062a\u062c \u0623\u0648 \u062e\u062f\u0645\u0629",
    });
    fireEvent.change(selector, { target: { value: "__custom" } });
    fireEvent.click(screen.getByRole("button", {
      name: "\u062d\u0641\u0638 \u0627\u0644\u062a\u0639\u062f\u064a\u0644\u0627\u062a",
    }));

    await waitFor(() => expect(
      fetchMock.mock.calls.some(([, init]) => init?.method === "PATCH"),
    ).toBe(true));
    const body = patchBody(fetchMock);
    const added = body.lines[1];

    expect(body.localizationSourceLocale).toBe("ar");
    expect(added).toMatchObject({
      catalogItemId: null,
      type: "CUSTOM",
      itemCode: "",
      itemName: "\u0628\u0646\u062f \u0645\u062e\u0635\u0635",
      itemNameAr: "\u0628\u0646\u062f \u0645\u062e\u0635\u0635",
      unitName: "PCS",
      unitNameAr: "PCS",
      quantity: 1,
      unitPrice: 0,
      taxRateId: null,
      taxPercentage: 0,
      position: 2,
    });
    expect(added).not.toHaveProperty("itemNameEn");
    expect(added).not.toHaveProperty("unitNameEn");
  });

  it("loads the existing tax snapshot, updates tax selection, and previews final totals", async () => {
    const fetchMock = fetchForEdit();
    vi.stubGlobal("fetch", fetchMock);
    render(createElement(EditQuotationPage));

    const tax = await screen.findByRole("combobox", { name: "Tax 1" });
    expect((tax as HTMLSelectElement).value).toBe("saved:tax-1");
    expect(screen.getByRole("option", { name: /VAT 5 \(5\.00%\).*Use current/ })).toBeTruthy();
    expect(screen.getByText("0.500 KWD")).toBeTruthy();
    expect(screen.getByText("10.500 KWD")).toBeTruthy();

    fireEvent.change(tax, { target: { value: "active:tax-10" } });
    expect((tax as HTMLSelectElement).value).toBe("active:tax-10");
    expect(screen.getByText("1.000 KWD")).toBeTruthy();
    expect(screen.getByText("11.000 KWD")).toBeTruthy();

    const beforeUnload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(beforeUnload);
    expect(beforeUnload.defaultPrevented).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(
      fetchMock.mock.calls.some(([, init]) => init?.method === "PATCH"),
    ).toBe(true));
    expect(patchBody(fetchMock).lines[0]).toMatchObject({
      taxRateId: "tax-10",
      taxPercentage: 10,
    });
    expect(patchBody(fetchMock).taxRateRefreshLineIds).toEqual(["line-1"]);
  });

  it("loads available tax rates and catalog lines inherit their selected rate", async () => {
    const fetchMock = fetchForEdit();
    vi.stubGlobal("fetch", fetchMock);
    render(createElement(EditQuotationPage));

    expect(await screen.findByText("VAT 10 (10.00%)")).toBeTruthy();
    fireEvent.change(screen.getByRole("combobox", { name: "Add product or service" }), {
      target: { value: "catalog-1" },
    });
    const taxes = await screen.findAllByRole("combobox", { name: /Tax \d/ });
    expect((taxes[1] as HTMLSelectElement).value).toBe("active:tax-1");
    expect(fetchMock).toHaveBeenCalledWith("/api/tax-rates");
  });

  it("shows the saved snapshot separately and intentionally refreshes the same active rate", async () => {
    const fetchMock = vi.fn().mockImplementation((input: string, init?: RequestInit) => {
      if (input.startsWith("/api/catalog/items")) return Promise.resolve(response([catalogItem]));
      if (input === "/api/tax-rates") {
        return Promise.resolve(response([
          { id: "tax-1", name: "VAT current", percentage: 10, isSystem: false },
        ]));
      }
      if (init?.method === "PATCH") return Promise.resolve(response(quotation));
      return Promise.resolve(response(quotation));
    });
    vi.stubGlobal("fetch", fetchMock);
    render(createElement(EditQuotationPage));

    const tax = await screen.findByRole("combobox", { name: "Tax 1" });
    expect((tax as HTMLSelectElement).value).toBe("saved:tax-1");
    expect(screen.getByRole("option", { name: "Saved tax (5.00%)" })).toBeTruthy();
    expect(screen.getByRole("option", { name: /VAT current \(10\.00%\).*Use current/ })).toBeTruthy();
    expect(screen.getByText("0.500 KWD")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(true));
    expect(patchBody(fetchMock).taxRateRefreshLineIds).toEqual([]);
    expect(patchBody(fetchMock).lines[0]).toMatchObject({ taxRateId: "tax-1", taxPercentage: 5 });

    fireEvent.change(tax, { target: { value: "active:tax-1" } });
    expect((tax as HTMLSelectElement).value).toBe("active:tax-1");
    expect(screen.getByText("1.000 KWD")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(
      fetchMock.mock.calls.filter(([, init]) => init?.method === "PATCH"),
    ).toHaveLength(2));
    const lastPatch = fetchMock.mock.calls.filter(([, init]) => init?.method === "PATCH").at(-1);
    const refreshedBody = JSON.parse(String(lastPatch?.[1]?.body));
    expect(refreshedBody.taxRateRefreshLineIds).toEqual(["line-1"]);
    expect(refreshedBody.lines[0]).toMatchObject({ taxRateId: "tax-1", taxPercentage: 10 });
  });

  it("drops an unavailable catalog tax from preview and payload with a visible warning", async () => {
    const fetchMock = vi.fn().mockImplementation((input: string, init?: RequestInit) => {
      if (input.startsWith("/api/catalog/items")) {
        return Promise.resolve(response([{ ...catalogItem, taxRateId: "tax-inactive" }]));
      }
      if (input === "/api/tax-rates") return Promise.resolve(response(taxRates));
      if (init?.method === "PATCH") return Promise.resolve(response(quotation));
      return Promise.resolve(response(quotation));
    });
    vi.stubGlobal("fetch", fetchMock);
    render(createElement(EditQuotationPage));

    fireEvent.change(await screen.findByRole("combobox", { name: "Add product or service" }), {
      target: { value: "catalog-1" },
    });
    expect(await screen.findByText("Catalog tax is unavailable. Select an active tax rate.")).toBeTruthy();
    const taxes = screen.getAllByRole("combobox", { name: /Tax \d/ });
    expect((taxes[1] as HTMLSelectElement).value).toBe("");

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(true));
    expect(patchBody(fetchMock).lines[1]).toMatchObject({
      taxRateId: null,
      taxPercentage: 0,
    });
    expect(patchBody(fetchMock).lines[1]).not.toHaveProperty("taxUnavailable");
  });

  it("preserves final-line safety and existing remove behavior", async () => {
    vi.stubGlobal("fetch", fetchForEdit());

    render(createElement(EditQuotationPage));

    const initialRemove = await screen.findByRole("button", { name: "Remove" });
    expect((initialRemove as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByRole("combobox", {
      name: "Add product or service",
    }), { target: { value: "__custom" } });

    const removeButtons = await screen.findAllByRole("button", { name: "Remove" });
    expect(removeButtons).toHaveLength(2);
    fireEvent.click(removeButtons[0]);

    expect(screen.queryByDisplayValue("Item")).toBeNull();
    expect(screen.getByDisplayValue("Custom line")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Remove" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it.each([
    ["2026-09-15", "2026-09-15T23:59:59.999+03:00"],
    ["", null],
  ] as const)("loads and PATCHes expiry as %s", async (next, expected) => {
    const fetchMock = fetchForEdit();
    vi.stubGlobal("fetch", fetchMock);

    render(createElement(EditQuotationPage));

    const expiry = await screen.findByDisplayValue("2026-09-01");
    fireEvent.change(expiry, { target: { value: next } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(
      fetchMock.mock.calls.some(([, init]) => init?.method === "PATCH"),
    ).toBe(true));
    expect(patchBody(fetchMock).expiryDate).toBe(expected);
  });
});
