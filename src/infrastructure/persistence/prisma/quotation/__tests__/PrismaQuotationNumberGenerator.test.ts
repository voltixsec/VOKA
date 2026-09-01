import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import { PrismaQuotationNumberGenerator } from "../PrismaQuotationNumberGenerator";

describe("canonical quotation number policy", () => {
  it("allocates the next tenant/month sequence with the normal quotation format", async () => {
    const findMany = vi.fn().mockResolvedValue([
      { number: "QT-202609-0009" },
      { number: "QT-202609-0004" },
      { number: "QT-202609-LEGACY" },
    ]);
    const generator = new PrismaQuotationNumberGenerator({ quotation: { findMany } } as never);

    await expect(generator.generate("company-1", new Date("2026-09-01T12:00:00.000Z")))
      .resolves.toBe("QT-202609-0010");
    expect(findMany).toHaveBeenCalledWith({
      where: { companyId: "company-1", revisionNumber: 0, number: { startsWith: "QT-202609-" } },
      select: { number: true },
    });
  });

  it("starts each tenant/month sequence at 0001", async () => {
    const generator = new PrismaQuotationNumberGenerator({ quotation: { findMany: vi.fn().mockResolvedValue([]) } } as never);
    await expect(generator.generate("company-2", new Date("2026-10-01T00:00:00.000Z")))
      .resolves.toBe("QT-202610-0001");
  });
});
