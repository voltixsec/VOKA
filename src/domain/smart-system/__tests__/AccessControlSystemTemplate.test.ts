import { describe, expect, it } from "vitest";
import { AccessControlSystemTemplate } from "../AccessControlSystemTemplate";

describe("AccessControlSystemTemplate", () => {
  const template = new AccessControlSystemTemplate();
  it("fails safely when door count or direction is missing", () => {
    expect(template.calculate({}).status).toBe("NEEDS_CONFIRMATION");
    expect(template.calculate({ doorCount: 4 }).missingInputs).toContain("accessDirection");
    expect(template.calculate({ doorCount: -2, accessDirection: "ENTRY_ONLY" }).status).toBe("INVALID_INPUT");
  });
  it("requires explicit route allowance for installed systems", () => {
    const result = template.calculate({ doorCount: 4, accessDirection: "ENTRY_ONLY", includeInstallation: true });
    expect(result.status).toBe("NEEDS_CONFIRMATION");
    expect(result.missingInputs).toContain("cableMetersPerDoor");
    expect(result.components).toEqual([]);
  });
  it("calculates deterministically without brands, models, or prices", () => {
    const input = { doorCount: 5, accessDirection: "ENTRY_ONLY", includeInstallation: false };
    const first = template.calculate(input); expect(template.calculate(input)).toEqual(first);
    expect(first.components.find((item) => item.componentKey === "ACCESS_CONTROLLERS")?.quantity).toBe(2);
    expect(first.components.find((item) => item.componentKey === "ACCESS_READERS")?.quantity).toBe(5);
    expect(first.components.find((item) => item.componentKey === "EXIT_BUTTONS")?.quantity).toBe(5);
    expect(JSON.stringify(first)).not.toMatch(/brand|model|price/i);
  });
  it("calculates entry-exit readers and explicit installed cable", () => {
    const result = template.calculate({ doorCount: 3, accessDirection: "ENTRY_EXIT", includeInstallation: true, cableMetersPerDoor: 25 });
    expect(result.status).toBe("COMPLETE");
    expect(result.components.find((item) => item.componentKey === "ACCESS_READERS")?.quantity).toBe(6);
    expect(result.components.find((item) => item.componentKey === "ACCESS_CABLE")?.quantity).toBe(75);
    expect(result.components.some((item) => item.componentKey === "EXIT_BUTTONS")).toBe(false);
  });
});
