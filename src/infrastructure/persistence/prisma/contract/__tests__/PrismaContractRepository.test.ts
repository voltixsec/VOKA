import { describe, expect, it, vi } from "vitest";
import { CommercialDocumentProvenance } from "../../../../../domain/commercial";
import { Contract } from "../../../../../domain/contract";

vi.mock("../PrismaContractMapper", () => ({
  PrismaContractMapper: { toDomain: vi.fn((record) => record) },
}));

import { PrismaContractRepository } from "../PrismaContractRepository";

describe("PrismaContractRepository", () => {
  it("scopes an existing-contract update by both id and companyId", async () => {
    const update = vi.fn().mockResolvedValue({ id: "contract-1" });
    const repository = new PrismaContractRepository({ contract: { update } } as any);
    const contract = Contract.restore({ id: "contract-1", companyId: "company-1",
      number: "CN-202608-0001", provenance: CommercialDocumentProvenance.direct(),
      customerId: "customer-1", customer: { name: "Customer" },
      lines: [{ position: 1, type: "CUSTOM", itemName: "Line", quantity: 1,
        unitPrice: 10, discountValue: 0, discountAmount: 0, taxPercentage: 0,
        taxAmount: 0, subtotal: 10, totalAmount: 10 }],
      createdByName: "Actor", createdByRole: "SALES" });

    await repository.save(contract);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "contract-1", companyId: "company-1" },
    }));
  });
});
