import { describe, expect, it } from "vitest";

import {
  moveQuotationLine,
  normalizeQuotationLinePositions,
} from "../quotation-line-order";

const lines = [
  {
    id: "line-1",
    position: 1,
    descriptionEn: "First description",
    taxRateId: "tax-historical",
    taxPercentage: 7,
  },
  {
    id: "line-2",
    position: 2,
    descriptionAr: "الوصف الثاني",
    taxRateId: "tax-active",
    taxPercentage: 10,
  },
];

describe("quotation line ordering", () => {
  it("moves complete line records and normalizes positions", () => {
    expect(moveQuotationLine(lines, 1, "up")).toEqual([
      { ...lines[1], position: 1 },
      { ...lines[0], position: 2 },
    ]);
  });

  it("supports moving down without changing commercial snapshots", () => {
    const moved = moveQuotationLine(lines, 0, "down");

    expect(moved[1]).toMatchObject({
      id: "line-1",
      descriptionEn: "First description",
      taxRateId: "tax-historical",
      taxPercentage: 7,
      position: 2,
    });
  });

  it("keeps boundary moves deterministic and positions unique", () => {
    const unchanged = moveQuotationLine(lines, 0, "up");
    expect(unchanged.map((line) => line.id)).toEqual(["line-1", "line-2"]);
    expect(normalizeQuotationLinePositions([
      { id: "a", position: 8 },
      { id: "b", position: 8 },
      { id: "c" },
    ]).map((line) => line.position)).toEqual([1, 2, 3]);
  });
});
