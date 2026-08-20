import { beforeEach, describe, expect, it, vi } from "vitest";
import { CommercialDocumentProvenance } from "@/src/domain/commercial";
import { Contract } from "@/src/domain/contract";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  save: vi.fn(),
  getNextContractNumber: vi.fn(),
  findCustomerByIdAndCompanyId: vi.fn(),
  roles: [] as string[][],
}));

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

vi.mock(
  "@/src/infrastructure/persistence/prisma/contract/PrismaContractRepository",
  () => ({
    PrismaContractRepository: class {
      list = mocks.list;
      save = mocks.save;
      getNextContractNumber = mocks.getNextContractNumber;
    },
  }),
);

vi.mock(
  "@/features/customers/infrastructure/prisma/PrismaCustomerRepository",
  () => ({
    PrismaCustomerRepository: class {
      findByIdAndCompanyId = mocks.findCustomerByIdAndCompanyId;
    },
  }),
);

vi.mock("@/lib/api", async () => {
  const errors = await vi.importActual<typeof import("@/lib/api/ApiError")>("@/lib/api/ApiError");
  const responses = await vi.importActual<typeof import("@/lib/api/ApiResponse")>("@/lib/api/ApiResponse");
  return {
    ApiError: errors.ApiError,
    apiSuccess: responses.apiSuccess,
    withCompanyAuth: (roles: readonly string[], handler: Function) => {
      mocks.roles.push([...roles]);
      return async (request: Request) => {
        try {
          return await handler(
            request,
            { user: { id: "user-1", name: "Sales User", email: "user@test.com" } },
            { companyId: "company-1", role: "SALES" },
          );
        } catch (error) {
          return responses.handleApiError(error);
        }
      };
    },
  };
});

import { GET, POST } from "../route";

function sampleContract() {
  return new Contract({
    id: "contract-1",
    companyId: "company-1",
    number: "CN-202608-0001",
    provenance: CommercialDocumentProvenance.direct(),
    customerId: "customer-1",
    customer: { name: "Acme Corp", email: "info@acme.com" },
    lines: [
      {
        position: 1,
        type: "PRODUCT",
        itemName: "Widget A",
        quantity: 5,
        unitPrice: 100,
        discountValue: 0,
        discountAmount: 0,
        taxPercentage: 0,
        taxAmount: 0,
        subtotal: 500,
        totalAmount: 500,
      },
    ],
    createdByName: "Sales Agent",
    createdByRole: "SALES",
  });
}

describe("GET & POST /api/contracts", () => {
  beforeEach(() => {
    mocks.list.mockReset();
    mocks.save.mockReset();
    mocks.getNextContractNumber.mockReset();
    mocks.findCustomerByIdAndCompanyId.mockReset();
  });

  it("lists tenant contracts for authorized read roles", async () => {
    mocks.list.mockResolvedValue({
      items: [sampleContract()],
      total: 1,
      page: 1,
      pageSize: 20,
    });

    const response = await GET(
      new Request("http://localhost/api/contracts?page=1&pageSize=20"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.contracts.length).toBe(1);
    expect(body.data.contracts[0].number).toBe("CN-202608-0001");
    expect(mocks.list).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: "company-1", page: 1, pageSize: 20 }),
    );
  });

  it("creates a direct Contract when valid parameters are provided", async () => {
    mocks.findCustomerByIdAndCompanyId.mockResolvedValue({
      id: "customer-1",
      name: "Acme Corp",
      email: "info@acme.com",
    });
    mocks.getNextContractNumber.mockResolvedValue("CN-202608-0001");
    mocks.save.mockImplementation((c) => Promise.resolve(c));

    const response = await POST(
      new Request("http://localhost/api/contracts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: "customer-1",
          lines: [
            {
              position: 1,
              type: "PRODUCT",
              itemName: "Widget A",
              quantity: 5,
              unitPrice: 100,
            },
          ],
        }),
      }),
    );

    const body = await response.json();
    expect(response.status).toBe(201);
    expect(body.data.number).toBe("CN-202608-0001");
    expect(body.data.totalAmount).toBe(500);
  });

  it("rejects request if customerId or lines are missing", async () => {
    const resNoCust = await POST(
      new Request("http://localhost/api/contracts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines: [{ itemName: "A", quantity: 1, unitPrice: 10 }] }),
      }),
    );
    expect(resNoCust.status).toBe(400);

    const resNoLines = await POST(
      new Request("http://localhost/api/contracts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId: "cust-1", lines: [] }),
      }),
    );
    expect(resNoLines.status).toBe(400);
  });

  it("returns controlled boundaries for invalid status and tenant-safe missing customer", async () => {
    const invalidStatus = await GET(
      new Request("http://localhost/api/contracts?status=INVALID"),
    );
    expect(invalidStatus.status).toBe(400);
    expect(await invalidStatus.json()).toMatchObject({
      error: { code: "INVALID_CONTRACT_STATUS" },
    });

    mocks.findCustomerByIdAndCompanyId.mockResolvedValue(null);
    const missingCustomer = await POST(
      new Request("http://localhost/api/contracts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: "cross-tenant-or-missing",
          lines: [{ position: 1, type: "CUSTOM", itemName: "Line", quantity: 1, unitPrice: 10 }],
        }),
      }),
    );
    expect(missingCustomer.status).toBe(404);
    expect(await missingCustomer.json()).toMatchObject({
      error: { code: "CUSTOMER_NOT_FOUND" },
    });
  });
});
