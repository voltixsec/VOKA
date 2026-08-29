import { describe, expect, it } from "vitest";
import { CctvSystemTemplate } from "../CctvSystemTemplate";
import { GypsumBoardSystemTemplate } from "../GypsumBoardSystemTemplate";
import { AccessControlSystemTemplate } from "../AccessControlSystemTemplate";

describe("localized engineering explanations preserve the same numerical evidence", () => {
  it.each([
    new CctvSystemTemplate().calculate({ cameraCount: 36, includeInstallation: true }),
    new GypsumBoardSystemTemplate().calculate({ areaM2: 200, layersCount: 2, includeInstallation: true, includeInsulation: true }),
    new AccessControlSystemTemplate().calculate({ doorCount: 5, accessDirection: "ENTRY_ONLY", includeInstallation: true, cableMetersPerDoor: 30 }),
  ])("$systemType exposes both locales without translating numbers or changing quantities", (result) => {
    expect(result.status).toBe("COMPLETE");
    for (const component of result.components) {
      expect(component.formulaExplanationAr).toBeTruthy();
      expect(component.formulaExplanation).toBeTruthy();
      expect(component.formulaExplanation).not.toMatch(/[\u0600-\u06ff]/);
      expect(component.formulaExplanationAr?.replace(/NVR|PoE/g, "")).not.toMatch(/[a-z]/i);
      const numbers = (value: string) => value.match(/\d+(?:\.\d+)?/g) ?? [];
      expect(numbers(component.formulaExplanationAr!)).toEqual(numbers(component.formulaExplanation!));
      expect(component.nameEn).not.toMatch(/[\u0600-\u06ff]/);
      expect(component.nameAr.replace(/CCTV|NVR|IP|PoE|RJ45|Cat6|\d+MP|H\.265|PTZ/g, "")).not.toMatch(/[a-z]/i);
    }
  });
});
