import { beforeEach, describe, expect, it, vi } from "vitest";

const { execute, findUnique } = vi.hoisted(() => ({
  execute: vi.fn(),
  findUnique: vi.fn(),
}));
vi.mock("@/src/application/contract", () => ({
  GetContractUseCase: class {
    execute = execute;
  },
}));
vi.mock("@/src/infrastructure/persistence/prisma/contract/PrismaContractRepository", () => ({
  PrismaContractRepository: class {},
}));
vi.mock("@/app/api/contracts/serialize-contract", () => ({
  serializeContract: (contract: { number: string; customer: { name: string } }) => ({
    number: contract.number,
    customer: contract.customer,
    lines: [],
    milestones: [],
  }),
}));
vi.mock("@/lib/prisma", () => ({ prisma: { company: { findUnique } } }));

import { ApiError } from "@/lib/api";
import { getContractDocumentSnapshot } from "../contract-snapshot";
import { COMPANY_IDENTITY_SELECT } from "../company-document-identity";

describe("contract document snapshot", () => {
  beforeEach(() => {
    execute.mockReset();
    findUnique.mockReset();
  });

  it("attaches tenant company identity without changing contract content", async () => {
    execute.mockResolvedValue({ number: "CT-1", customer: { name: "Acme" } });
    findUnique.mockResolvedValue({
      name: "Horizon Co",
      nameEn: "Horizon Co",
      logoUrl: "data:image/png;base64,xx",
      letterheadUrl: null,
    });
    const snapshot = await getContractDocumentSnapshot("company-1", "ct-1");
    expect(execute).toHaveBeenCalledWith("company-1", "ct-1");
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: "company-1" },
      select: COMPANY_IDENTITY_SELECT,
    });
    expect(snapshot).toMatchObject({
      number: "CT-1",
      customer: { name: "Acme" },
      companyIdentity: { nameEn: "Horizon Co", logoUrl: "data:image/png;base64,xx" },
    });
  });

  it("keeps tenant isolation when contract is missing", async () => {
    execute.mockResolvedValue(null);
    await expect(getContractDocumentSnapshot("company-1", "cross")).rejects.toBeInstanceOf(ApiError);
    expect(findUnique).not.toHaveBeenCalled();
  });
});
