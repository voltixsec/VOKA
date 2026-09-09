import { describe, expect, it } from "vitest";
import { validateCompanySectorSelection } from "../companySectors";

describe("company universal library sectors", () => {
  it("requires at least one sector and at most three", () => {
    expect(validateCompanySectorSelection([]).ok).toBe(false);
    expect(validateCompanySectorSelection(["CCTV"]).ok).toBe(true);
    expect(validateCompanySectorSelection(["CCTV", "BMS", "FIRE_ALARM"]).ok).toBe(true);
    expect(validateCompanySectorSelection(["CCTV", "BMS", "FIRE_ALARM", "NETWORKING"]).ok).toBe(false);
  });

  it("rejects unknown codes", () => {
    expect(validateCompanySectorSelection(["WIDGETS"]).ok).toBe(false);
  });
});
