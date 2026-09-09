import { describe, expect, it, vi } from "vitest";
import { isGovernedCommercialRoot, validateInstalledCategoryIds } from "../governedSectors";
import { collectCategoryTreeIds, listGovernedRootSectors } from "../persistCompanySectors";

describe("governed commercial library sectors", () => {
  it("enforces min 1 and max 3 category ids", () => {
    expect(validateInstalledCategoryIds([]).ok).toBe(false);
    expect(validateInstalledCategoryIds(["a"]).ok).toBe(true);
    expect(validateInstalledCategoryIds(["a", "b", "c"]).ok).toBe(true);
    expect(validateInstalledCategoryIds(["a", "b", "c", "d"]).ok).toBe(false);
  });

  it("recognizes governed roots without treating subsystems as roots", () => {
    expect(isGovernedCommercialRoot({ parentId: null, code: "SECURITY_SURVEILLANCE" })).toBe(true);
    expect(isGovernedCommercialRoot({ parentId: null, nameEn: "Security & Surveillance Systems" })).toBe(true);
    expect(isGovernedCommercialRoot({ parentId: null, code: "CCTV" })).toBe(false);
    expect(isGovernedCommercialRoot({ parentId: "SECURITY_SURVEILLANCE", code: "CCTV" })).toBe(false);
  });

  it("lists roots as a read-only findMany and never creates taxonomy", async () => {
    const create = vi.fn();
    const findMany = vi.fn().mockResolvedValue([
      { id: "sec", parentId: null, code: "SECURITY_SURVEILLANCE", name: "Security & Surveillance Systems", nameEn: "Security & Surveillance Systems", nameAr: "أنظمة الأمن والمراقبة" },
      { id: "cctv-root-wrong", parentId: null, code: "CCTV", name: "CCTV" },
      { id: "hvac", parentId: null, code: "HVAC_MECHANICAL", name: "HVAC & Mechanical", nameEn: "HVAC & Mechanical" },
    ]);
    const listed = await listGovernedRootSectors({
      universalCategory: { findMany, create },
    } as never);
    expect(create).not.toHaveBeenCalled();
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(listed.map((row) => row.id)).toEqual(["sec", "hvac"]);
  });

  it("does not invent a missing root during listing", async () => {
    const create = vi.fn();
    const listed = await listGovernedRootSectors({
      universalCategory: { findMany: vi.fn().mockResolvedValue([]), create },
    } as never);
    expect(listed).toEqual([]);
    expect(create).not.toHaveBeenCalled();
  });

  it("includes descendant category ids of an installed root and excludes unrelated trees", async () => {
    const findMany = vi.fn(async ({ where }: { where: { parentId: { in: string[] } } }) => {
      const parent = where.parentId.in[0];
      if (parent === "sec") return [{ id: "cctv" }, { id: "access" }];
      if (parent === "cctv") return [{ id: "ip-cameras" }];
      return [];
    });
    const ids = await collectCategoryTreeIds(["sec"], { universalCategory: { findMany } } as never);
    expect(ids).toEqual(expect.arrayContaining(["sec", "cctv", "access", "ip-cameras"]));
    expect(ids).not.toContain("construction");
  });
});
