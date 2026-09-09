import { describe, expect, it, vi } from "vitest";
import { validateInstalledCategoryIds } from "../governedSectors";
import { collectCategoryTreeIds } from "../persistCompanySectors";

describe("governed commercial library sectors", () => {
  it("enforces min 1 and max 3 category ids", () => {
    expect(validateInstalledCategoryIds([]).ok).toBe(false);
    expect(validateInstalledCategoryIds(["a"]).ok).toBe(true);
    expect(validateInstalledCategoryIds(["a", "b", "c"]).ok).toBe(true);
    expect(validateInstalledCategoryIds(["a", "b", "c", "d"]).ok).toBe(false);
  });

  it("includes descendant categories of an installed root", async () => {
    const findMany = vi
      .fn()
      .mockResolvedValueOnce([{ id: "child" }])
      .mockResolvedValueOnce([{ id: "leaf" }])
      .mockResolvedValueOnce([]);
    const ids = await collectCategoryTreeIds(["root"], {
      universalCategory: { findMany },
    } as never);
    expect(ids).toEqual(expect.arrayContaining(["root", "child", "leaf"]));
  });
});
