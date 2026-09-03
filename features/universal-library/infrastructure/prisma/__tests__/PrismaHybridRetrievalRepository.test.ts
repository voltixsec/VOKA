import { describe, expect, it, vi } from "vitest";
import { PrismaHybridRetrievalRepository } from "../PrismaHybridRetrievalRepository";

describe("PrismaHybridRetrievalRepository integrity", () => {
  it("always scopes Company Catalog retrieval to companyId with deterministic bounds", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const repository = new PrismaHybridRetrievalRepository({ catalogItem: { findMany } } as any);
    await repository.fetchCatalogCandidates({ companyId: "tenant-a", isActive: true, limit: 40 });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ companyId: "tenant-a", isActive: true }),
      take: 40,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    }));
  });

  it("scopes adoption collapse and catalog re-fetches to the authenticated tenant", async () => {
    const adoptionFindMany = vi.fn().mockResolvedValue([]);
    const catalogFindMany = vi.fn().mockResolvedValue([]);
    const repository = new PrismaHybridRetrievalRepository({
      universalItemAdoption: { findMany: adoptionFindMany },
      catalogItem: { findMany: catalogFindMany },
    } as any);
    await repository.fetchAdoptions("tenant-a", ["ucl-1"], ["catalog-1"]);
    await repository.fetchCatalogCandidatesByIds("tenant-a", ["catalog-1"]);
    expect(adoptionFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ companyId: "tenant-a" }),
      take: 200,
    }));
    expect(catalogFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { companyId: "tenant-a", id: { in: ["catalog-1"] } },
    }));
  });

  it("excludes SYSTEM and SOLUTION from default commercial Universal retrieval", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const repository = new PrismaHybridRetrievalRepository({
      universalCatalogItem: { findMany },
    } as any);

    await repository.fetchUniversalCandidates({
      isActive: true,
      limit: 20,
    });

    expect(findMany).toHaveBeenCalledTimes(1);

    const call = findMany.mock.calls[0][0];

    expect(call.where).toEqual(
      expect.objectContaining({
        type: {
          in: [
            "PRODUCT",
            "SERVICE",
            "SHIPPING",
            "LABOR",
            "DISCOUNT",
            "CUSTOM",
          ],
        },
        isActive: true,
      })
    );

    expect(call.where.type.in).not.toContain("SYSTEM");
    expect(call.where.type.in).not.toContain("SOLUTION");
  });
  it("performs a bounded exact Universal pass and caps loaded identifiers and aliases", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const repository = new PrismaHybridRetrievalRepository({ universalCatalogItem: { findMany } } as any);
    await repository.fetchUniversalCandidates({ query: "694-1218-201234", isActive: true, limit: 40 });
    expect(findMany).toHaveBeenCalledTimes(2);
    const exactCall = findMany.mock.calls[1][0];
    expect(exactCall.take).toBe(20);
    expect(exactCall.include.identifiers.take).toBe(20);
    expect(exactCall.include.aliases.take).toBe(20);
    expect(JSON.stringify(exactCall.where)).toContain("6941218201234");
  });
});
