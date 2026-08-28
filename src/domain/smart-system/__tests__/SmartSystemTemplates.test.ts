import { describe, it, expect, beforeEach } from "vitest";
import { SystemTemplateRegistry } from "../SystemTemplateRegistry";
import { GypsumBoardSystemTemplate } from "../GypsumBoardSystemTemplate";
import { CctvSystemTemplate } from "../CctvSystemTemplate";

describe("Smart System Templates V1 Foundation", () => {
  let registry: SystemTemplateRegistry;
  let gypsumTemplate: GypsumBoardSystemTemplate;
  let cctvTemplate: CctvSystemTemplate;

  beforeEach(() => {
    gypsumTemplate = new GypsumBoardSystemTemplate();
    cctvTemplate = new CctvSystemTemplate();
    registry = new SystemTemplateRegistry([gypsumTemplate, cctvTemplate]);
  });

  describe("GypsumBoardSystemTemplate", () => {
    it("generates deterministic components for a known area", () => {
      const result = gypsumTemplate.calculate({
        areaM2: 2000,
        layersCount: 1,
        wastePercentage: 5,
        includeInstallation: true,
      });

      expect(result.status).toBe("COMPLETE");
      expect(result.systemType).toBe("GYPSUM_BOARD");
      expect(result.missingInputs).toHaveLength(0);

      // Area = 2000 m², Board size = 1.2 x 2.4 = 2.88 m²
      // Net sheets = 2000 / 2.88 = 694.44
      // With 5% waste = 694.44 * 1.05 = 729.16 -> Math.ceil(729.16) = 730 sheets
      const boardComp = result.components.find(
        (c) => c.componentKey === "GYPSUM_BOARDS",
      );
      expect(boardComp).toBeDefined();
      expect(boardComp?.quantity).toBe(730);
      expect(boardComp?.provenance).toBe("CALCULATED");

      // Labor service quantity matches area
      const laborComp = result.components.find(
        (c) => c.componentKey === "GYPSUM_LABOR",
      );
      expect(laborComp).toBeDefined();
      expect(laborComp?.quantity).toBe(2000);
      expect(laborComp?.itemType).toBe("SERVICE");
    });

    it("applies wastage exactly and produces identical results on repeated execution", () => {
      const input = {
        areaM2: 500,
        layersCount: 2,
        wastePercentage: 10,
      };

      const result1 = gypsumTemplate.calculate(input);
      const result2 = gypsumTemplate.calculate(input);

      expect(result1).toEqual(result2);

      const areaInput = result1.inputs.find((i) => i.name === "areaM2");
      expect(areaInput?.provenance).toBe("USER_PROVIDED");
      expect(areaInput?.value).toBe(500);

      const wasteInput = result1.inputs.find(
        (i) => i.name === "wastePercentage",
      );
      expect(wasteInput?.provenance).toBe("USER_PROVIDED");
      expect(wasteInput?.value).toBe(10);
    });

    it("handles missing required inputs safely with NEEDS_CONFIRMATION state", () => {
      const result = gypsumTemplate.calculate({});

      expect(result.status).toBe("NEEDS_CONFIRMATION");
      expect(result.missingInputs).toContain("areaM2");
      expect(result.components).toHaveLength(0);
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it("rejects fractional layers and invalid wastage instead of silently defaulting", () => {
      expect(gypsumTemplate.calculate({ areaM2: 20, layersCount: 1.5 }).status).toBe("INVALID_INPUT");
      expect(gypsumTemplate.calculate({ areaM2: 20, wastePercentage: -1 }).status).toBe("INVALID_INPUT");
      expect(gypsumTemplate.calculate({ areaM2: 20, wastePercentage: 101 }).status).toBe("INVALID_INPUT");
    });

    it("does not add installation labor unless installation was requested", () => {
      const supply = gypsumTemplate.calculate({ areaM2: 20 });
      const installed = gypsumTemplate.calculate({ areaM2: 20, includeInstallation: true });
      expect(supply.components.some((c) => c.componentKey === "GYPSUM_LABOR")).toBe(false);
      expect(installed.components.some((c) => c.componentKey === "GYPSUM_LABOR")).toBe(true);
    });

    it("rejects invalid negative area input safely", () => {
      const result = gypsumTemplate.calculate({ areaM2: -100 });

      expect(result.status).toBe("INVALID_INPUT");
      expect(result.missingInputs).toContain("areaM2");
      expect(result.components).toHaveLength(0);
    });
  });

  describe("CctvSystemTemplate", () => {
    it("generates expected system component structure for 8 cameras", () => {
      const result = cctvTemplate.calculate({
        cameraCount: 8,
        projectContext: "villa",
        storageDays: 30,
      });

      expect(result.status).toBe("COMPLETE");
      expect(result.systemType).toBe("CCTV");

      // Camera count provenance remains USER_PROVIDED
      const cameraInput = result.inputs.find((i) => i.name === "cameraCount");
      expect(cameraInput?.provenance).toBe("USER_PROVIDED");
      expect(cameraInput?.value).toBe(8);

      // Camera component
      const cameraComp = result.components.find(
        (c) => c.componentKey === "CCTV_CAMERAS",
      );
      expect(cameraComp).toBeDefined();
      expect(cameraComp?.quantity).toBe(8);
      expect(cameraComp?.provenance).toBe("USER_PROVIDED");

      // NVR recorder component calculated (8 channels)
      const nvrComp = result.components.find(
        (c) => c.componentKey === "NVR_RECORDER",
      );
      expect(nvrComp).toBeDefined();
      expect(nvrComp?.provenance).toBe("CALCULATED");
      expect(nvrComp?.nameEn).toContain("8 Channels");

      // Cabinet suggested
      const rackComp = result.components.find(
        (c) => c.componentKey === "RACK_CABINET",
      );
      expect(rackComp).toBeDefined();
      expect(rackComp?.provenance).toBe("SUGGESTED");
    });

    it("handles missing camera count safely with NEEDS_CONFIRMATION state", () => {
      const result = cctvTemplate.calculate({});

      expect(result.status).toBe("NEEDS_CONFIRMATION");
      expect(result.missingInputs).toContain("cameraCount");
      expect(result.components).toHaveLength(0);
    });

    it("rejects fractional, negative, and unsupported camera counts", () => {
      for (const cameraCount of [-1, 1.5, 1025]) {
        const result = cctvTemplate.calculate({ cameraCount });
        expect(result.status).toBe("INVALID_INPUT");
        expect(result.components).toHaveLength(0);
      }
    });

    it("marks defaults explicitly and does not invent 4K or installation", () => {
      const result = cctvTemplate.calculate({ cameraCount: 8 });
      expect(result.inputs.find((i) => i.name === "projectContext")).toMatchObject({
        provenance: "SUGGESTED",
        isDefault: true,
      });
      expect(result.components.find((c) => c.componentKey === "CCTV_CAMERAS")?.nameEn).not.toContain("4K");
      expect(result.components.some((c) => c.componentKey === "INSTALLATION_COMMISSIONING")).toBe(false);
    });

    it("keeps independent registries isolated", () => {
      const first = new SystemTemplateRegistry([gypsumTemplate]);
      const second = new SystemTemplateRegistry([cctvTemplate]);
      expect(first.has("CCTV")).toBe(false);
      expect(second.has("GYPSUM_BOARD")).toBe(false);
      expect(registry.getAll()).toHaveLength(2);
    });
  });
});
