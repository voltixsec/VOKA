import { describe, expect, it } from "vitest";
import { CctvSystemTemplate, CCTV_ENGINEERING_DEFAULT, resolveEngineeringRules, type EngineeringRuleProfile } from "..";

const company: EngineeringRuleProfile = {
  ...CCTV_ENGINEERING_DEFAULT, id: "company-cctv", name: "Company CCTV Profile",
  version: "2.1", trust: "COMPANY_APPROVED", jurisdiction: "Kuwait",
  values: { ...CCTV_ENGINEERING_DEFAULT.values, retentionDays: 60, bitrateMbps: 4, nvrUtilizationPercent: 80, poeReservedPorts: 4, cableMetersPerCamera: 40, cableRollMeters: 300, rackAllowance: 2 },
};
const authority: EngineeringRuleProfile = {
  ...company, id: "kw-authority", name: "Verified Authority Profile", version: "3.4",
  trust: "VERIFIED_AUTHORITY", authoritySource: "trusted-authority-record", values: { ...company.values, retentionDays: 90, storageReservePercent: 20 },
};

describe("jurisdiction-aware engineering rule resolution", () => {
  it("user override beats the engineering default", () => {
    expect(resolveEngineeringRules({ userOverrides: { retentionDays: 45 } }).snapshot.values.retentionDays).toBe(45);
  });

  it("verified jurisdiction rule beats the company profile and retains version/provenance", () => {
    const result = resolveEngineeringRules({ jurisdiction: "Kuwait", companyProfile: company, verifiedJurisdictionProfile: authority, resolvedAt: "2026-08-28T00:00:00.000Z" });
    expect(result.snapshot).toMatchObject({ id: "kw-authority", version: "3.4", trust: "VERIFIED_AUTHORITY", governmentVerified: true, resolvedAt: "2026-08-28T00:00:00.000Z" });
    expect(structuredClone(result.snapshot)).toEqual(result.snapshot);
  });

  it("company-approved profile beats engineering default", () => {
    expect(resolveEngineeringRules({ jurisdiction: "Kuwait", companyProfile: company }).snapshot).toMatchObject({ id: "company-cctv", trust: "COMPANY_APPROVED" });
  });

  it("missing jurisdiction profile falls back safely without a fake legal claim", () => {
    const snapshot = resolveEngineeringRules({ jurisdiction: "Kuwait" }).snapshot;
    expect(snapshot).toMatchObject({ trust: "ENGINEERING_DEFAULT", governmentVerified: false, authoritySource: null });
    expect(`${snapshot.name} ${snapshot.authoritySource ?? ""}`).not.toMatch(/law|legal|mandatory|وزارة|قانون/i);
  });

  it("rejects an untrusted authority-shaped profile as government verification", () => {
    const snapshot = resolveEngineeringRules({ jurisdiction: "Kuwait", verifiedJurisdictionProfile: { ...authority, authoritySource: null } }).snapshot;
    expect(snapshot).toMatchObject({ trust: "ENGINEERING_DEFAULT", governmentVerified: false });
  });

  it("creates a human review conflict when a user retention override is below a verified minimum", () => {
    const result = resolveEngineeringRules({ jurisdiction: "Kuwait", verifiedJurisdictionProfile: authority, userOverrides: { retentionDays: 30 } });
    expect(result.conflict).toMatchObject({ code: "RULE_CONFLICT", messages: ["User requested 30 days.", "Verified profile indicates 90 days minimum.", "Human decision required."] });
    expect(result.snapshot.values.retentionDays).toBe(30);
  });

  it("calculates storage, NVR, PoE, cable and rack from resolved profile values", () => {
    const result = new CctvSystemTemplate({ jurisdiction: "Kuwait", companyProfile: company }).calculate({ cameraCount: 64 });
    const byKey = (key: string) => result.components.find((component) => component.componentKey === key)!;
    expect(byKey("SURVEILLANCE_HDD").specification).toMatchObject({ storageDays: 60, bitrateMbps: 4, requiredUsableTb: 166, driveCapacityTb: 18 });
    expect(byKey("SURVEILLANCE_HDD")).toMatchObject({ quantity: 10, unit: "Unit", quantityStatus: "ESTIMATED" });
    expect(byKey("NVR_RECORDER")).toMatchObject({ quantity: 2, specification: { utilizationPercent: 80 } });
    expect(byKey("POE_SWITCH")).toMatchObject({ quantity: 2, specification: { reservedPorts: 4 } });
    expect(byKey("CAT6_CABLING")).toMatchObject({ quantity: 9, specification: { metersPerRoll: 300 } });
    expect(byKey("RACK_CABINET").quantity).toBe(2);
  });

  it("retains conflict and rule snapshot in the engineering output", () => {
    const result = new CctvSystemTemplate({ jurisdiction: "Kuwait", verifiedJurisdictionProfile: authority }).calculate({ cameraCount: 8, storageDays: 30 });
    expect(result.status).toBe("RULE_CONFLICT");
    expect(result.engineeringRules).toMatchObject({ version: "3.4", trust: "VERIFIED_AUTHORITY", overriddenFields: ["retentionDays"] });
  });
});
