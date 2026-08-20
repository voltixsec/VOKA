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
      catalogItemId: "catalog-1",
      itemName: "Item",
      itemNameAr: "\u0635\u0646\u0641",
      itemNameEn: "Item",
      description: "English detail",
      descriptionAr: "تفاصيل عربية",
      descriptionEn: "English detail",
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
  unitId: "unit-1",
  taxRateId: "tax-1",
  description: "Catalog description",
};

const taxRates = [
  { id: "tax-1", name: "VAT 5", percentage: 5, isSystem: false },
  { id: "tax-10", name: "VAT 10", percentage: 10, isSystem: true },
];

const units = [
  { id: "unit-1", name: "Piece", nameAr: "حبة", nameEn: "Piece", symbol: "pcs" },
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

      if (input === "/api/units") {
        return Promise.resolve(response(units));
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

beforeEach(() => {
  isArabic = false;
  push.mockReset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("EditQuotationPage dense composer UX", () => {
  it("1. Loads existing saved quotation line correctly into dense composer", async () => {
    vi.stubGlobal("fetch", fetchForEdit());

    render(createElement(EditQuotationPage));

    expect(await screen.findByDisplayValue("Item")).toBeTruthy();
    expect(screen.getByDisplayValue("unit")).toBeTruthy();
    expect(screen.getByDisplayValue("1")).toBeTruthy();
    expect(screen.getByDisplayValue("10")).toBeTruthy();
    expect(screen.getByText("10.500 KWD")).toBeTruthy(); // 10 * 1.05 (historical tax 5%)
  });

  it("2. Historical saved tax survives normal edit/save unchanged", async () => {
    const fetchMock = fetchForEdit();
    vi.stubGlobal("fetch", fetchMock);

    render(createElement(EditQuotationPage));

    await screen.findByDisplayValue("Item");

    // Edit quantity
    const qtyInput = screen.getByLabelText("Quantity 1");
    fireEvent.change(qtyInput, { target: { value: "2" } });

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(true);
    });

    const body = patchBody(fetchMock);
    expect(body.taxRateRefreshLineIds).toEqual([]);
    expect(body.lines[0]).toMatchObject({
      id: "line-1",
      taxRateId: "tax-1",
      taxPercentage: 5,
      quantity: 2,
    });
  });

  it("3. Hidden Description UI does not lose historical saved description in payload", async () => {
    const fetchMock = fetchForEdit();
    vi.stubGlobal("fetch", fetchMock);

    render(createElement(EditQuotationPage));

    await screen.findByDisplayValue("Item");

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(true);
    });

    const body = patchBody(fetchMock);
    expect(body.lines[0]).toMatchObject({
      id: "line-1",
      description: "English detail",
      descriptionAr: "تفاصيل عربية",
      descriptionEn: "English detail",
    });
  });

  it("4. Hidden Tax UI does not refresh or lose historical tax on normal edits", async () => {
    const fetchMock = fetchForEdit();
    vi.stubGlobal("fetch", fetchMock);

    render(createElement(EditQuotationPage));

    await screen.findByDisplayValue("Item");

    // Edit unit price
    const unitPriceInput = screen.getByLabelText("Unit price 1");
    fireEvent.change(unitPriceInput, { target: { value: "20" } });

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(true);
    });

    const body = patchBody(fetchMock);
    expect(body.taxRateRefreshLineIds).toEqual([]);
    expect(body.lines[0]).toMatchObject({
      id: "line-1",
      taxRateId: "tax-1",
      taxPercentage: 5,
      unitPrice: 20,
    });
  });

  it("5. Explicit catalog item replacement/selection inherits Unit, Sale Price, active Tax, and flags taxRateRefreshLineIds", async () => {
    const fetchMock = fetchForEdit();
    vi.stubGlobal("fetch", fetchMock);

    render(createElement(EditQuotationPage));

    const itemCombobox = await screen.findByRole("combobox", { name: "Item 1" });

    fireEvent.focus(itemCombobox);
    fireEvent.change(itemCombobox, { target: { value: "Catalog camera" } });

    const selectOption = await screen.findByText("Catalog camera");
    fireEvent.click(selectOption);

    expect(screen.getByDisplayValue("Catalog camera")).toBeTruthy();
    expect(screen.getByDisplayValue("Piece (pcs)")).toBeTruthy();
    expect(screen.getByDisplayValue("25.5")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(true);
    });

    const body = patchBody(fetchMock);
    expect(body.taxRateRefreshLineIds).toEqual(["line-1"]);
    expect(body.lines[0]).toMatchObject({
      id: "line-1",
      catalogItemId: "catalog-1",
      itemName: "Catalog camera",
      unitName: "Piece (pcs)",
      unitPrice: 25.5,
      taxRateId: "tax-1",
      taxPercentage: 5,
    });
  });

  it("6. Quick Create produces CUSTOM line with PCS/عدد unit and null taxRateId/0 taxPercentage", async () => {
    const fetchMock = fetchForEdit();
    vi.stubGlobal("fetch", fetchMock);

    render(createElement(EditQuotationPage));

    const itemCombobox = await screen.findByRole("combobox", { name: "Item 1" });

    fireEvent.focus(itemCombobox);
    fireEvent.change(itemCombobox, { target: { value: "Custom Widget" } });

    const createOption = await screen.findByText('Create "Custom Widget"');
    fireEvent.click(createOption);

    expect(screen.getByDisplayValue("Custom Widget")).toBeTruthy();
    expect(screen.getByDisplayValue("PCS")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(true);
    });

    const body = patchBody(fetchMock);
    expect(body.taxRateRefreshLineIds).toEqual(["line-1"]);
    expect(body.lines[0]).toMatchObject({
      id: "line-1",
      catalogItemId: null,
      type: "CUSTOM",
      itemName: "Custom Widget",
      unitName: "PCS",
      taxRateId: null,
      taxPercentage: 0,
    });
  });

  it("7. + Add appends blank row and focuses Item input", async () => {
    vi.stubGlobal("fetch", fetchForEdit());

    render(createElement(EditQuotationPage));

    await screen.findByDisplayValue("Item");

    const addButton = screen.getByRole("button", { name: /Add|إضافة/ });
    fireEvent.click(addButton);

    const newCombobox = screen.getByRole("combobox", { name: "Item 2" });
    expect(newCombobox).toBeTruthy();
    expect((newCombobox as HTMLInputElement).value).toBe("");

    await waitFor(() => {
      expect(document.activeElement).toBe(newCombobox);
    });
  });

  it("8. Create & Edit opens CatalogItemModal, saves catalog item, returns to SAME line with filled details", async () => {
    const fetchMock = vi.fn().mockImplementation((input: string, init?: RequestInit) => {
      if (input === "/api/catalog/items" && init?.method === "POST") {
        return Promise.resolve(response({
          id: "catalog-created-1",
          name: "Created Sensor",
          code: "SENS-100",
          type: "PRODUCT",
          salePrice: 45,
          unitId: "unit-1",
          taxRateId: "tax-1",
          description: "New sensor description",
        }));
      }

      if (input.startsWith("/api/catalog/items")) return Promise.resolve(response([catalogItem]));
      if (input === "/api/tax-rates") return Promise.resolve(response(taxRates));
      if (input === "/api/units") return Promise.resolve(response(units));
      if (init?.method === "PATCH") return Promise.resolve(response(quotation));

      return Promise.resolve(response(quotation));
    });

    vi.stubGlobal("fetch", fetchMock);

    render(createElement(EditQuotationPage));

    const itemCombobox = await screen.findByRole("combobox", { name: "Item 1" });

    fireEvent.focus(itemCombobox);
    fireEvent.change(itemCombobox, { target: { value: "Created Sensor" } });

    const createAndEditOption = await screen.findByText('Create & Edit "Created Sensor"');
    fireEvent.click(createAndEditOption);

    expect(await screen.findByText("Add New Product")).toBeTruthy(); // Modal title

    const priceInput = screen.getByLabelText("Sale Price *");
    fireEvent.change(priceInput, { target: { value: "45" } });

    const saveModalButton = screen.getByRole("button", { name: "Save" });
    fireEvent.click(saveModalButton);

    await waitFor(() => {
      expect(screen.queryByText("Add New Product")).toBeNull();
    });

    expect(screen.getByDisplayValue("Created Sensor")).toBeTruthy();
    expect(screen.getByDisplayValue("Piece (pcs)")).toBeTruthy();
    expect(screen.getByDisplayValue("45")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(true);
    });

    const body = patchBody(fetchMock);
    expect(body.taxRateRefreshLineIds).toEqual(["line-1"]);
    expect(body.lines).toHaveLength(1); // No duplicate lines created
    expect(body.lines[0]).toMatchObject({
      id: "line-1",
      catalogItemId: "catalog-created-1",
      itemName: "Created Sensor",
      unitName: "Piece (pcs)",
      unitPrice: 45,
      taxRateId: "tax-1",
      taxPercentage: 5,
    });
  });

  it("9. Submit payload preserves positions, catalogItemId, saved snapshots, and localization fields", async () => {
    const fetchMock = fetchForEdit();
    vi.stubGlobal("fetch", fetchMock);

    render(createElement(EditQuotationPage));

    await screen.findByDisplayValue("Item");

    // Add explicit blank line
    fireEvent.click(screen.getByRole("button", { name: /Add|إضافة/ }));

    const secondCombobox = screen.getByRole("combobox", { name: "Item 2" });
    fireEvent.focus(secondCombobox);
    fireEvent.change(secondCombobox, { target: { value: "Second Item" } });
    fireEvent.click(await screen.findByText('Create "Second Item"'));

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(true);
    });

    const body = patchBody(fetchMock);
    expect(body.lines).toHaveLength(2);
    expect(body.lines[0]).toMatchObject({
      id: "line-1",
      position: 1,
      catalogItemId: "catalog-1",
      itemName: "Item",
      descriptionAr: "تفاصيل عربية",
      descriptionEn: "English detail",
    });
    expect(body.lines[1]).toMatchObject({
      position: 2,
      catalogItemId: null,
      itemName: "Second Item",
      unitName: "PCS",
    });
  });
});
