import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks = vi.hoisted(() => ({
  findById: vi.fn(),
  roleSets: [] as string[][],
  update: vi.fn(),
}));

vi.mock(
  "@/src/infrastructure/persistence/prisma/quotation/PrismaQuotationRepository",
  () => ({
    PrismaQuotationRepository: class {
      findById = mocks.findById;
      update = mocks.update;
    },
  }),
);
vi.mock(
  "@/src/infrastructure/persistence/prisma/quotation/PrismaQuotationReferenceValidator",
  () => ({
    PrismaQuotationReferenceValidator: class {
      findInvalidReference = vi.fn();
      getCustomerSnapshot = vi.fn();
    },
  }),
);


vi.mock("@/lib/api", async () => {
  const errors = await vi.importActual<
    typeof import("@/lib/api/ApiError")
  >("@/lib/api/ApiError");
  const responses = await vi.importActual<
    typeof import("@/lib/api/ApiResponse")
  >("@/lib/api/ApiResponse");

  return {
    ApiError: errors.ApiError,
    apiSuccess: responses.apiSuccess,
    withCompanyAuth: (
      allowedRoles: readonly string[],
      handler: (
        request: Request,
        auth: never,
        company: { companyId: string },
      ) => Promise<Response>,
    ) => {
      mocks.roleSets.push([...allowedRoles]);

      return async (request: Request) => {
        try {
          return await handler(
            request,
            {} as never,
            {
              companyId: "company-1",
            },
          );
        } catch (error) {
          return responses.handleApiError(error);
        }
      };
    },
  };
});

import { Quotation } from "@/src/domain/quotation";

import { GET, PATCH } from "../route";

function createQuotation(): Quotation {
  return Quotation.restore({
    id: "quotation-1",
    companyId: "company-1",
    customerId: "customer-1",
    number: "Q-001",
    issueDate: new Date("2026-08-04T00:00:00.000Z"),
    customer: {
      name: "First United",
    },
    lines: [
      {
        position: 1,
        type: "PRODUCT",
        itemName: "Product",
        quantity: 1,
        unitPrice: 10,
      },
    ],
  });
}

describe("GET /api/quotations/[quotationId]", () => {
  beforeEach(() => {
    mocks.findById.mockReset();
  });
    mocks.update.mockReset();

  it("returns a tenant-scoped quotation to every read role", async () => {
    mocks.findById.mockResolvedValue(createQuotation());

    const response = await GET(
      new Request(
        "http://localhost/api/quotations/quotation-1",
      ),
    );
    const body = await response.json();

    expect(mocks.roleSets).toContainEqual([
      "OWNER",
      "ADMIN",
      "SALES",
      "VIEWER",
    ]);
    expect(mocks.findById).toHaveBeenCalledWith(
      "company-1",
      "quotation-1",
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe(
      "no-store",
    );
    expect(body).toMatchObject({
      success: true,
      data: {
        id: "quotation-1",
        companyId: "company-1",
        quotationNumber: "Q-001",
      },
    });
  });

  it("returns the same 404 for missing and cross-company ids", async () => {
    mocks.findById.mockResolvedValue(null);

    const response = await GET(
      new Request(
        "http://localhost/api/quotations/other-company-quotation",
      ),
    );
    const body = await response.json();

    expect(mocks.findById).toHaveBeenCalledWith(
      "company-1",
      "other-company-quotation",
    );
    expect(response.status).toBe(404);
    expect(body).toEqual({
      success: false,
      error: {
        code: "QUOTATION_NOT_FOUND",
        message: "Quotation not found.",

      },
    });
  });
  it("updates a draft quotation inside the active company", async () => {
    const quotation = createQuotation();
    mocks.findById.mockResolvedValue(quotation);
    mocks.update.mockResolvedValue(undefined);

    const response = await PATCH(
      new Request(
        "http://localhost/api/quotations/quotation-1",
        {
          method: "PATCH",
          body: JSON.stringify({
            lines: [
              {
                position: 1,
                type: "PRODUCT",
                itemName: "Updated Product",
                quantity: 2,
                unitPrice: 15,
              },
            ],
          }),
        },
      ),
    );

    const body = await response.json();

    expect(mocks.update).toHaveBeenCalledWith(
      "company-1",
      quotation,
    );
    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      data: {
        id: "quotation-1",
        totals: {
          totalAmount: 30,
        },
      },
    });
  });
});
