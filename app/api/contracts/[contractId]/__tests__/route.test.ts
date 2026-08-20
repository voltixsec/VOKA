import { beforeEach, describe, expect, it, vi } from "vitest";
import { CommercialDocumentProvenance } from "@/src/domain/commercial";
import { Contract } from "@/src/domain/contract";

const mocks = vi.hoisted(() => ({
  findById: vi.fn(),
  roles: [] as string[][],
}));

vi.mock(
  "@/src/infrastructure/persistence/prisma/contract/PrismaContractRepository",
  () => ({
    PrismaContractRepository: class {
      findById = mocks.findById;
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
            { user: { id: "user-1", email: "user@test.com", name: "User" } },
            { companyId: "company-1" },
          );
        } catch (error) {
          return responses.handleApiError(error);
        }
      };
    },
  };
});

import { GET } from "../route";

function sampleContract() {
  return new Contract({
    id: "contract-123",
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

describe("GET /api/contracts/[contractId]", () => {
  beforeEach(() => {
    mocks.findById.mockReset();
  });

  it("returns contract details when found in tenant context", async () => {
    mocks.findById.mockResolvedValue(sampleContract());

    const request = new Request("http://localhost/api/contracts/contract-123");
    const response = await GET(request);

    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.data.id).toBe("contract-123");
    expect(body.data.number).toBe("CN-202608-0001");
    expect(mocks.findById).toHaveBeenCalledWith("company-1", "contract-123");
  });

  it("returns 404 when contract is not found or cross-tenant", async () => {
    mocks.findById.mockResolvedValue(null);

    const request = new Request("http://localhost/api/contracts/other-tenant-id");
    const response = await GET(request);

    expect(response.status).toBe(404);
  });
});
