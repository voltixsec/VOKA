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
  return vi.fn().mockImplementation(
    (input: string, init?: RequestInit) => {
      if (input === "/api/auth/me") {
        return Promise.resolve(
          response({
            activeCompanyId: "company-1",
          }),
        );
      }

      if (input.startsWith("/api/customers")) {
        return Promise.resolve(
          response({
            customers: [
              {
                id: "customer-1",
                name: "Acme",
              },
            ],
          }),
        );
      }

      if (
        input.startsWith("/api/catalog/items") &&
        init?.method !== "POST"
      ) {
        return Promise.resolve(
          response([
            {
              id: "catalog-1",
              name: "Taxed service",
              code: "SRV-1",
              type: "SERVICE",
              salePrice: 100,
              taxRateId: "tax-10",
              unitId: "unit-pcs",
              description: "Catalog scope",
              isActive: true,
            },
          ]),
        );
      }

      if (
        input === "/api/catalog/items" &&
        init?.method === "POST"
      ) {
        return Promise.resolve(
          response({
            id: "catalog-created",
            companyId: "company-1",
            name: "Created product",
            nameEn: "Created product",
            nameAr: null,
            code: "PROD-100",
            type: "PRODUCT",
            salePrice: 25,
            purchasePrice: null,
            taxRateId: "tax-5",
            unitId: "unit-pcs",
            description: null,
            descriptionAr: null,
            descriptionEn: null,
            sku: null,
            barcode: null,
            isActive: true,
          }),
        );
      }

      if (input === "/api/units") {
        return Promise.resolve(
          response([
            {
              id: "unit-pcs",
              name: "Pieces",
              nameAr: "\u0639\u062f\u062f",
              nameEn: "Pieces",
              symbol: "PCS",
            },
          ]),
        );
      }

      if (input === "/api/tax-rates") {
        return Promise.resolve(
          response([
            {
              id: "tax-5",
              name: "VAT 5",
              percentage: 5,
              isSystem: false,
            },
            {
              id: "tax-10",
              name: "VAT 10",
              percentage: 10,
              isSystem: true,
            },
          ]),
        );
      }

      if (
        input ===
        "/api/companies/current/quotation-terms"
      ) {
        return Promise.resolve(
          response({
            templates: [],
          }),
        );
      }

      if (input === "/api/companies/current") {
        return Promise.resolve(
          response({
            defaultCurrency: "KWD",
          }),
        );
      }

      if (
        input === "/api/quotations" &&
        init?.method === "POST"
      ) {
        return Promise.resolve(
          response({
            id: "quotation-1",
          }),
        );
      }

      throw new Error(
        `Unexpected fetch: ${input}`,
      );
    },
  );
}

function selectFor(
  label: string,
): HTMLSelectElement {
  const select = screen
    .getByText(label)
    .closest("label")
    ?.querySelector("select");

  if (!select) {
    throw new Error(
      `Select missing for ${label}`,
    );
  }

  return select;
}

function inputFor(
  label: string,
): HTMLInputElement {
  const input = screen
    .getByText(label)
    .closest("label")
    ?.querySelector("input");

  if (!input) {
    throw new Error(
      `Input missing for ${label}`,
    );
  }

  return input;
}

function postBody(
  fetchMock: ReturnType<typeof vi.fn>,
) {
  const call =
    fetchMock.mock.calls.find(
      ([input, init]) =>
        input === "/api/quotations" &&
        init?.method === "POST",
    );

  if (!call) {
    throw new Error(
      "POST request missing",
    );
  }

  return JSON.parse(
    String(call[1]?.body),
  );
}

async function chooseCustomer() {
  await screen.findByRole(
    "option",
    {
      name: "Acme",
    },
  );

  fireEvent.change(
    selectFor("Customer"),
    {
      target: {
        value: "customer-1",
      },
    },
  );
}

async function quickCreateLine(
  value: string,
  index = 1,
) {
  const item = await screen.findByRole(
    "combobox",
    {
      name: `Item ${index}`,
    },
  );

  fireEvent.focus(item);

  fireEvent.change(item, {
    target: {
      value,
    },
  });

  const createButton =
    await screen.findByRole(
      "button",
      {
        name: `Create "${value}"`,
      },
    );

  fireEvent.click(createButton);

  return item as HTMLInputElement;
}

async function selectCatalogItem(
  index = 1,
) {
  const item = await screen.findByRole(
    "combobox",
    {
      name: `Item ${index}`,
    },
  );

  fireEvent.focus(item);

  const option =
    await screen.findByRole(
      "button",
      {
        name: /Taxed service/,
      },
    );

  fireEvent.click(option);

  return item as HTMLInputElement;
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

describe(
  "NewQuotationPage dense composer",
  () => {
    it(
      "starts with one blank quotation row",
      async () => {
        vi.stubGlobal(
          "fetch",
          fetchForCreate(),
        );

        render(
          createElement(
            NewQuotationPage,
          ),
        );

        await screen.findByText(
          "Quotation information",
        );

        const item =
          await screen.findByRole(
            "combobox",
            {
              name: "Item 1",
            },
          );

        expect(
          (
            item as HTMLInputElement
          ).value,
        ).toBe("");

        expect(
          screen.getByRole(
            "button",
            {
              name: "Add",
            },
          ),
        ).toBeTruthy();
      },
    );

    it.each([
      [
        "2026-09-15",
        "2026-09-15T23:59:59.999+03:00",
      ],
      ["", undefined],
    ] as const)(
      "submits optional expiry %s",
      async (
        selected,
        expected,
      ) => {
        const fetchMock =
          fetchForCreate();

        vi.stubGlobal(
          "fetch",
          fetchMock,
        );

        render(
          createElement(
            NewQuotationPage,
          ),
        );

        await screen.findByText(
          "Quotation information",
        );

        await chooseCustomer();

        await quickCreateLine(
          "Custom line",
        );

        if (selected) {
          fireEvent.change(
            inputFor(
              "Quotation expiry date",
            ),
            {
              target: {
                value: selected,
              },
            },
          );
        }

        fireEvent.click(
          screen.getByRole(
            "button",
            {
              name: "Create proposal",
            },
          ),
        );

        await waitFor(() =>
          expect(
            fetchMock.mock.calls.some(
              ([input, init]) =>
                input ===
                  "/api/quotations" &&
                init?.method ===
                  "POST",
            ),
          ).toBe(true),
        );

        const body =
          postBody(fetchMock);

        if (
          expected === undefined
        ) {
          expect(
            body,
          ).not.toHaveProperty(
            "expiryDate",
          );
        } else {
          expect(
            body.expiryDate,
          ).toBe(expected);
        }
      },
    );

    it(
      "quick Create makes a custom line with default PCS and no tax",
      async () => {
        const fetchMock =
          fetchForCreate();

        vi.stubGlobal(
          "fetch",
          fetchMock,
        );

        render(
          createElement(
            NewQuotationPage,
          ),
        );

        await screen.findByText(
          "Quotation information",
        );

        await chooseCustomer();

        const item =
          await quickCreateLine(
            "Custom service",
          );

        expect(
          item.value,
        ).toBe("Custom service");

        expect(
          (
            screen.getByRole(
              "textbox",
              {
                name: "Unit 1",
              },
            ) as HTMLInputElement
          ).value,
        ).toBe("PCS");

        fireEvent.click(
          screen.getByRole(
            "button",
            {
              name: "Create proposal",
            },
          ),
        );

        await waitFor(() =>
          expect(
            fetchMock.mock.calls.some(
              ([input, init]) =>
                input ===
                  "/api/quotations" &&
                init?.method ===
                  "POST",
            ),
          ).toBe(true),
        );

        const body =
          postBody(fetchMock);

        expect(
          body.lines[0],
        ).toMatchObject({
          catalogItemId: null,
          type: "CUSTOM",
          itemName:
            "Custom service",
          unitName: "PCS",
          taxRateId: null,
          taxPercentage: 0,
        });
      },
    );

    it(
      "selecting a catalog item inherits unit price and tax",
      async () => {
        const fetchMock =
          fetchForCreate();

        vi.stubGlobal(
          "fetch",
          fetchMock,
        );

        render(
          createElement(
            NewQuotationPage,
          ),
        );

        await screen.findByText(
          "Quotation information",
        );

        await chooseCustomer();

        const item =
          await selectCatalogItem();

        expect(
          item.value,
        ).toBe("Taxed service");

        expect(
          (
            screen.getByRole(
              "textbox",
              {
                name: "Unit 1",
              },
            ) as HTMLInputElement
          ).value,
        ).toBe("Pieces (PCS)");

        const unitPrice =
          screen.getByRole(
            "spinbutton",
            {
              name: "Unit price 1",
            },
          ) as HTMLInputElement;

        expect(
          Number(
            unitPrice.value,
          ),
        ).toBe(100);

        expect(
          screen.getAllByText(
            "10.000 KWD",
          ).length,
        ).toBeGreaterThanOrEqual(1);

        expect(
          screen.getByText(
            "110.000 KWD",
          ),
        ).toBeTruthy();

        fireEvent.click(
          screen.getByRole(
            "button",
            {
              name: "Create proposal",
            },
          ),
        );

        await waitFor(() =>
          expect(
            fetchMock.mock.calls.some(
              ([input, init]) =>
                input ===
                  "/api/quotations" &&
                init?.method ===
                  "POST",
            ),
          ).toBe(true),
        );

        const body =
          postBody(fetchMock);

        expect(
          body.lines[0],
        ).toMatchObject({
          catalogItemId:
            "catalog-1",
          taxRateId: "tax-10",
          taxPercentage: 10,
          unitPrice: 100,
        });
      },
    );

    it(
      "Add appends and focuses a new blank Item row",
      async () => {
        vi.stubGlobal(
          "fetch",
          fetchForCreate(),
        );

        render(
          createElement(
            NewQuotationPage,
          ),
        );

        await screen.findByText(
          "Quotation information",
        );

        await quickCreateLine(
          "First line",
        );

        fireEvent.click(
          screen.getByRole(
            "button",
            {
              name: "Add",
            },
          ),
        );

        const nextItem =
          await screen.findByRole(
            "combobox",
            {
              name: "Item 2",
            },
          );

        expect(
          (
            nextItem as HTMLInputElement
          ).value,
        ).toBe("");

        await waitFor(() => {
          expect(
            document.activeElement,
          ).toBe(nextItem);
        });
      },
    );

    it(
      "drops an unavailable catalog tax from totals and submission",
      async () => {
        const fetchMock = vi
          .fn()
          .mockImplementation(
            (
              input: string,
              init?: RequestInit,
            ) => {
              if (
                input ===
                "/api/auth/me"
              ) {
                return Promise.resolve(
                  response({
                    activeCompanyId:
                      "company-1",
                  }),
                );
              }

              if (
                input.startsWith(
                  "/api/customers",
                )
              ) {
                return Promise.resolve(
                  response({
                    customers: [
                      {
                        id:
                          "customer-1",
                        name:
                          "Acme",
                      },
                    ],
                  }),
                );
              }

              if (
                input.startsWith(
                  "/api/catalog/items",
                )
              ) {
                return Promise.resolve(
                  response([
                    {
                      id:
                        "catalog-1",
                      name:
                        "Taxed service",
                      code:
                        "SRV-1",
                      type:
                        "SERVICE",
                      salePrice:
                        100,
                      taxRateId:
                        "tax-inactive",
                      unitId:
                        "unit-pcs",
                      isActive:
                        true,
                    },
                  ]),
                );
              }

              if (
                input ===
                "/api/units"
              ) {
                return Promise.resolve(
                  response([
                    {
                      id:
                        "unit-pcs",
                      name:
                        "Pieces",
                      nameEn:
                        "Pieces",
                      nameAr:
                        "\u0639\u062f\u062f",
                      symbol:
                        "PCS",
                    },
                  ]),
                );
              }

              if (
                input ===
                "/api/tax-rates"
              ) {
                return Promise.resolve(
                  response([
                    {
                      id:
                        "tax-10",
                      name:
                        "VAT 10",
                      percentage:
                        10,
                      isSystem:
                        true,
                    },
                  ]),
                );
              }

              if (
                input ===
                "/api/companies/current/quotation-terms"
              ) {
                return Promise.resolve(
                  response({
                    templates: [],
                  }),
                );
              }

              if (
                input ===
                "/api/companies/current"
              ) {
                return Promise.resolve(
                  response({
                    defaultCurrency:
                      "KWD",
                  }),
                );
              }

              if (
                input ===
                  "/api/quotations" &&
                init?.method ===
                  "POST"
              ) {
                return Promise.resolve(
                  response({
                    id:
                      "quotation-1",
                  }),
                );
              }

              throw new Error(
                `Unexpected fetch: ${input}`,
              );
            },
          );

        vi.stubGlobal(
          "fetch",
          fetchMock,
        );

        render(
          createElement(
            NewQuotationPage,
          ),
        );

        await screen.findByText(
          "Quotation information",
        );

        await chooseCustomer();

        await selectCatalogItem();

        expect(
          screen.queryByText(
            "10.000 KWD",
          ),
        ).toBeNull();

        expect(
          screen.getAllByText(
            "100.000 KWD",
          ).length,
        ).toBeGreaterThanOrEqual(1);

        fireEvent.click(
          screen.getByRole(
            "button",
            {
              name: "Create proposal",
            },
          ),
        );

        await waitFor(() =>
          expect(
            fetchMock.mock.calls.some(
              ([input, init]) =>
                input ===
                  "/api/quotations" &&
                init?.method ===
                  "POST",
            ),
          ).toBe(true),
        );

        const body =
          postBody(fetchMock);

        expect(
          body.lines[0],
        ).toMatchObject({
          taxRateId: null,
          taxPercentage: 0,
        });

        expect(
          body.lines[0],
        ).not.toHaveProperty(
          "taxUnavailable",
        );
      },
    );

    it(
      "Create & Edit saves a catalog product and returns it to the same row",
      async () => {
        const fetchMock =
          fetchForCreate();

        vi.stubGlobal(
          "fetch",
          fetchMock,
        );

        render(
          createElement(
            NewQuotationPage,
          ),
        );

        await screen.findByText(
          "Quotation information",
        );

        const item =
          await screen.findByRole(
            "combobox",
            {
              name: "Item 1",
            },
          );

        fireEvent.focus(item);

        fireEvent.change(item, {
          target: {
            value:
              "Created product",
          },
        });

        fireEvent.click(
          await screen.findByRole(
            "button",
            {
              name:
                'Create & Edit "Created product"',
            },
          ),
        );

        expect(
          await screen.findByText(
            "Add New Product",
          ),
        ).toBeTruthy();

        const unitSelect =
          screen.getByRole(
            "combobox",
            {
              name: "Unit",
            },
          ) as HTMLSelectElement;

        fireEvent.change(
          unitSelect,
          {
            target: {
              value:
                "unit-pcs",
            },
          },
        );

        const taxSelect =
          screen.getByRole(
            "combobox",
            {
              name:
                "Default Tax Rate",
            },
          ) as HTMLSelectElement;

        fireEvent.change(
          taxSelect,
          {
            target: {
              value: "tax-5",
            },
          },
        );

        const price =
          screen.getByRole(
            "spinbutton",
            {
              name: /Sale Price/,
            },
          ) as HTMLInputElement;

        fireEvent.change(price, {
          target: {
            value: "25",
          },
        });

        fireEvent.click(
          screen.getByRole(
            "button",
            {
              name: "Save",
            },
          ),
        );

        await waitFor(() =>
          expect(
            fetchMock.mock.calls.some(
              ([input, init]) =>
                input ===
                  "/api/catalog/items" &&
                init?.method ===
                  "POST",
            ),
          ).toBe(true),
        );

        await waitFor(() => {
          expect(
            (
              screen.getByRole(
                "combobox",
                {
                  name: "Item 1",
                },
              ) as HTMLInputElement
            ).value,
          ).toBe(
            "Created product",
          );
        });

        expect(
          (
            screen.getByRole(
              "textbox",
              {
                name: "Unit 1",
              },
            ) as HTMLInputElement
          ).value,
        ).toBe("Pieces (PCS)");

        const unitPrice =
          screen.getByRole(
            "spinbutton",
            {
              name: "Unit price 1",
            },
          ) as HTMLInputElement;

        expect(
          Number(
            unitPrice.value,
          ),
        ).toBe(25);
      },
    );
  },
);
