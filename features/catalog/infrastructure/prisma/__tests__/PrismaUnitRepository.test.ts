import { describe, expect, it, vi } from "vitest";
import { PrismaUnitRepository } from "../PrismaUnitRepository";

describe("PrismaUnitRepository tenant isolation & two-stage lookup precedence", () => {
  it("findBySymbol Stage 1: returns tenant-owned Unit when it exists", async () => {
    const findFirst = vi.fn().mockResolvedValue({
      id: "tenant-unit-1",
      companyId: "company-1",
      name: "Custom Tenant Piece",
      symbol: "PCS",
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const repository = new PrismaUnitRepository({
      unit: { findFirst },
    } as never);

    const result = await repository.findBySymbol("company-1", "PCS");

    expect(result?.id.toString()).toBe("tenant-unit-1");
    expect(findFirst).toHaveBeenCalledTimes(1);
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        companyId: "company-1",
        symbol: "PCS",
      },
    });
  });

  it("findBySymbol Stage 2: falls back to shared system Unit (companyId IS NULL) when tenant Unit is absent", async () => {
    const findFirst = vi.fn()
      .mockResolvedValueOnce(null) // Stage 1: no tenant unit
      .mockResolvedValueOnce({    // Stage 2: shared system unit
        id: "shared-unit-1",
        companyId: null,
        name: "Shared System Piece",
        symbol: "PCS",
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

    const repository = new PrismaUnitRepository({
      unit: { findFirst },
    } as never);

    const result = await repository.findBySymbol("company-1", "PCS");

    expect(result?.id.toString()).toBe("shared-unit-1");
    expect(findFirst).toHaveBeenCalledTimes(2);
    expect(findFirst).toHaveBeenNthCalledWith(1, {
      where: {
        companyId: "company-1",
        symbol: "PCS",
      },
    });
    expect(findFirst).toHaveBeenNthCalledWith(2, {
      where: {
        companyId: null,
        symbol: "PCS",
      },
    });
  });

  it("findBySymbol never queries or returns another tenant's Unit (e.g. company-2)", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);

    const repository = new PrismaUnitRepository({
      unit: { findFirst },
    } as never);

    const result = await repository.findBySymbol("company-1", "PCS");

    expect(result).toBeNull();
    // Neither stage queries company-2
    expect(findFirst).toHaveBeenNthCalledWith(1, {
      where: { companyId: "company-1", symbol: "PCS" },
    });
    expect(findFirst).toHaveBeenNthCalledWith(2, {
      where: { companyId: null, symbol: "PCS" },
    });
  });

  it("findAll includes only tenant-owned units and shared units (companyId == null)", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const repository = new PrismaUnitRepository({
      unit: { findMany },
    } as never);

    await repository.findAll({ companyId: "company-1", isActive: true });

    expect(findMany).toHaveBeenCalledWith({
      where: {
        isActive: true,
        OR: [
          { companyId: "company-1" },
          { companyId: null },
        ],
      },
      orderBy: [{ name: "asc" }],
    });
  });
});
