import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  SystemDiscoverySeed,
  SystemComponent,
  DiscoveryEvidence,
  SystemPopulationPlanner,
  PopulationWorkItem,
} from "../../index";

describe("PIC-03A1 System/Solution Discovery Decomposition & Population Planner (CTO Suite)", () => {
  const sampleEvidence = [
    new DiscoveryEvidence({
      url: "https://example-manufacturer.com/tech-specs/cctv-system",
      title: "IP Video Surveillance System Technical Architecture",
      publisher: "Manufacturer Authority",
      sourceType: "MANUFACTURER_TECHNICAL",
    }),
  ];

  it("1. SYSTEM seed accepted", () => {
    const seed = new SystemDiscoverySeed({
      id: "seed-sys-001",
      seedType: "SYSTEM",
      nameEn: "IP Video Surveillance System",
      evidence: sampleEvidence,
      confidence: 0.95,
    });
    expect(seed.seedType).toBe("SYSTEM");
    expect(seed.id).toBe("seed-sys-001");
  });

  it("2. SOLUTION seed accepted", () => {
    const seed = new SystemDiscoverySeed({
      id: "seed-sol-001",
      seedType: "SOLUTION",
      nameEn: "Integrated Building Security Solution",
      evidence: sampleEvidence,
      confidence: 0.92,
    });
    expect(seed.seedType).toBe("SOLUTION");
    expect(seed.id).toBe("seed-sol-001");
  });

  it("3. CCTV example produces PRODUCT and SERVICE work items", () => {
    const seed = new SystemDiscoverySeed({
      id: "seed-cctv-001",
      seedType: "SYSTEM",
      nameEn: "IP Video Surveillance System",
      evidence: sampleEvidence,
      confidence: 0.95,
      components: [
        {
          key: "ip_camera",
          componentType: "PRODUCT",
          nameEn: "4MP Outdoor IP Dome Camera",
          confidence: 0.9,
        },
        {
          key: "installation_service",
          componentType: "SERVICE",
          nameEn: "CCTV Installation Service",
          confidence: 0.85,
        },
      ],
    });

    const workItems = new SystemPopulationPlanner().plan(seed);
    expect(workItems).toHaveLength(2);
    expect(workItems.find((w) => w.componentKey === "ip_camera")?.componentType).toBe("PRODUCT");
    expect(workItems.find((w) => w.componentKey === "installation_service")?.componentType).toBe("SERVICE");
  });

  it("4. PRODUCT -> GLOBAL_PRODUCT_EXPANSION", () => {
    const seed = new SystemDiscoverySeed({
      id: "seed-prod-001",
      seedType: "SYSTEM",
      nameEn: "Network Switch System",
      evidence: sampleEvidence,
      confidence: 0.9,
      components: [
        {
          key: "poe_switch",
          componentType: "PRODUCT",
          nameEn: "24-Port Managed PoE Switch",
          confidence: 0.9,
        },
      ],
    });

    const workItems = new SystemPopulationPlanner().plan(seed);
    expect(workItems[0].intention).toBe("GLOBAL_PRODUCT_EXPANSION");
  });

  it("5. SERVICE -> SERVICE_POPULATION", () => {
    const seed = new SystemDiscoverySeed({
      id: "seed-serv-001",
      seedType: "SYSTEM",
      nameEn: "System Commissioning",
      evidence: sampleEvidence,
      confidence: 0.9,
      components: [
        {
          key: "testing_commissioning",
          componentType: "SERVICE",
          nameEn: "Testing and Commissioning Service",
          confidence: 0.9,
        },
      ],
    });

    const workItems = new SystemPopulationPlanner().plan(seed);
    expect(workItems[0].intention).toBe("SERVICE_POPULATION");
  });

  it("6. quantity/unit are absent", () => {
    const comp = new SystemComponent({
      key: "camera",
      componentType: "PRODUCT",
      nameEn: "IP Camera",
      confidence: 0.9,
    });

    const seed = new SystemDiscoverySeed({
      id: "seed-no-qty",
      seedType: "SYSTEM",
      nameEn: "Surveillance",
      evidence: sampleEvidence,
      confidence: 0.9,
      components: [comp],
    });

    const workItems = new SystemPopulationPlanner().plan(seed);
    const item = workItems[0];

    expect((comp as any).quantity).toBeUndefined();
    expect((comp as any).unit).toBeUndefined();
    expect((seed as any).quantity).toBeUndefined();
    expect((item as any).quantity).toBeUndefined();
    expect((item as any).unit).toBeUndefined();
    expect((item as any).createdAt).toBeUndefined(); // persistence field cleansed
  });

  it("7. duplicate keys deduplicate", () => {
    const seed = new SystemDiscoverySeed({
      id: "seed-dedup-001",
      seedType: "SYSTEM",
      nameEn: "CCTV System",
      evidence: sampleEvidence,
      confidence: 0.9,
      components: [
        { key: "ip_camera", componentType: "PRODUCT", nameEn: "IP Camera 1", confidence: 0.9 },
        { key: "IP_CAMERA", componentType: "PRODUCT", nameEn: "IP Camera 2", confidence: 0.8 },
      ],
    });

    const workItems = new SystemPopulationPlanner().plan(seed);
    expect(workItems).toHaveLength(1);
    expect(workItems[0].normalizedComponentKey).toBe("ip_camera");
  });

  it("8. duplicate winner is independent of input order", () => {
    const compHigh = new SystemComponent({
      key: "ip_camera",
      componentType: "PRODUCT",
      nameEn: "High Conf Camera",
      confidence: 0.95,
    });
    const compLow = new SystemComponent({
      key: "IP_CAMERA",
      componentType: "PRODUCT",
      nameEn: "Low Conf Camera",
      confidence: 0.8,
    });

    const seedA = new SystemDiscoverySeed({
      id: "seed-order-1",
      seedType: "SYSTEM",
      nameEn: "System",
      evidence: sampleEvidence,
      confidence: 0.9,
      components: [compLow, compHigh],
    });

    const seedB = new SystemDiscoverySeed({
      id: "seed-order-1",
      seedType: "SYSTEM",
      nameEn: "System",
      evidence: sampleEvidence,
      confidence: 0.9,
      components: [compHigh, compLow],
    });

    const planner = new SystemPopulationPlanner();
    const itemA = planner.plan(seedA)[0];
    const itemB = planner.plan(seedB)[0];

    expect(itemA.nameEn).toBe("High Conf Camera");
    expect(itemB.nameEn).toBe("High Conf Camera");
  });

  it("9. higher-confidence duplicate wins", () => {
    const seed = new SystemDiscoverySeed({
      id: "seed-conf-win",
      seedType: "SYSTEM",
      nameEn: "CCTV",
      evidence: sampleEvidence,
      confidence: 0.9,
      components: [
        { key: "camera", componentType: "PRODUCT", nameEn: "Lower Conf", confidence: 0.7 },
        { key: "camera", componentType: "PRODUCT", nameEn: "Higher Conf", confidence: 0.9 },
      ],
    });

    const workItems = new SystemPopulationPlanner().plan(seed);
    expect(workItems[0].nameEn).toBe("Higher Conf");
  });

  it("10. evidence-count tie-break works", () => {
    const compMoreEvid = new SystemComponent({
      key: "camera",
      componentType: "PRODUCT",
      nameEn: "Camera with Evidence",
      confidence: 0.9,
      evidence: [sampleEvidence[0]],
    });
    const compLessEvid = new SystemComponent({
      key: "camera",
      componentType: "PRODUCT",
      nameEn: "Camera without Evidence",
      confidence: 0.9, // tied confidence
      evidence: [],
    });

    const seed = new SystemDiscoverySeed({
      id: "seed-evid-tie",
      seedType: "SYSTEM",
      nameEn: "CCTV",
      evidence: sampleEvidence,
      confidence: 0.9,
      components: [compLessEvid, compMoreEvid],
    });

    const workItems = new SystemPopulationPlanner().plan(seed);
    expect(workItems[0].nameEn).toBe("Camera with Evidence");
  });

  it("11. identity-population tie-break works", () => {
    const compWithHints = new SystemComponent({
      key: "camera",
      componentType: "PRODUCT",
      nameEn: "Camera with Hints",
      confidence: 0.9,
      identityHints: { manufacturerHint: "Axis", modelNumber: "P3245" },
    });
    const compNoHints = new SystemComponent({
      key: "camera",
      componentType: "PRODUCT",
      nameEn: "Camera no Hints",
      confidence: 0.9,
    });

    const seed = new SystemDiscoverySeed({
      id: "seed-hint-tie",
      seedType: "SYSTEM",
      nameEn: "CCTV",
      evidence: sampleEvidence,
      confidence: 0.9,
      components: [compNoHints, compWithHints],
    });

    const workItems = new SystemPopulationPlanner().plan(seed);
    expect(workItems[0].nameEn).toBe("Camera with Hints");
  });

  it("12. final deterministic tie-break is stable", () => {
    const compA = new SystemComponent({
      key: "camera",
      componentType: "PRODUCT",
      nameEn: "Alpha Camera",
      confidence: 0.9,
    });
    const compB = new SystemComponent({
      key: "camera",
      componentType: "PRODUCT",
      nameEn: "Beta Camera",
      confidence: 0.9,
    });

    const seed1 = new SystemDiscoverySeed({
      id: "seed-stable-tie",
      seedType: "SYSTEM",
      nameEn: "CCTV",
      evidence: sampleEvidence,
      confidence: 0.9,
      components: [compA, compB],
    });

    const seed2 = new SystemDiscoverySeed({
      id: "seed-stable-tie",
      seedType: "SYSTEM",
      nameEn: "CCTV",
      evidence: sampleEvidence,
      confidence: 0.9,
      components: [compB, compA],
    });

    const planner = new SystemPopulationPlanner();
    const winner1 = planner.plan(seed1)[0];
    const winner2 = planner.plan(seed2)[0];

    expect(winner1.nameEn).toBe(winner2.nameEn);
  });

  it("13. equivalent logical component sets in different order produce identical ordered work-item IDs", () => {
    const seed1 = new SystemDiscoverySeed({
      id: "seed-equiv",
      seedType: "SYSTEM",
      nameEn: "CCTV",
      evidence: sampleEvidence,
      confidence: 0.9,
      components: [
        { key: "nvr", componentType: "PRODUCT", nameEn: "NVR", confidence: 0.9 },
        { key: "camera", componentType: "PRODUCT", nameEn: "Camera", confidence: 0.9 },
      ],
    });

    const seed2 = new SystemDiscoverySeed({
      id: "seed-equiv",
      seedType: "SYSTEM",
      nameEn: "CCTV",
      evidence: sampleEvidence,
      confidence: 0.9,
      components: [
        { key: "camera", componentType: "PRODUCT", nameEn: "Camera", confidence: 0.9 },
        { key: "nvr", componentType: "PRODUCT", nameEn: "NVR", confidence: 0.9 },
      ],
    });

    const planner = new SystemPopulationPlanner();
    const items1 = planner.plan(seed1);
    const items2 = planner.plan(seed2);

    expect(items1.map((i) => i.id)).toEqual(items2.map((i) => i.id));
    expect(items1.map((i) => i.normalizedComponentKey)).toEqual(["camera", "nvr"]);
  });

  it("14. empty seed English name fails", () => {
    expect(
      () =>
        new SystemDiscoverySeed({
          id: "s1",
          seedType: "SYSTEM",
          nameEn: "   ",
          evidence: sampleEvidence,
          confidence: 0.9,
        })
    ).toThrow("nameEn cannot be empty");
  });

  it("15. zero seed evidence fails", () => {
    expect(
      () =>
        new SystemDiscoverySeed({
          id: "s1",
          seedType: "SYSTEM",
          nameEn: "CCTV",
          evidence: [],
          confidence: 0.9,
        })
    ).toThrow("requires at least one genuine evidence reference");
  });

  it("16. empty component key fails", () => {
    expect(
      () =>
        new SystemComponent({
          key: "   ",
          componentType: "PRODUCT",
          nameEn: "Camera",
          confidence: 0.9,
        })
    ).toThrow("key cannot be empty");
  });

  it("17. empty component English name fails", () => {
    expect(
      () =>
        new SystemComponent({
          key: "cam",
          componentType: "PRODUCT",
          nameEn: "   ",
          confidence: 0.9,
        })
    ).toThrow("nameEn cannot be empty");
  });

  it("18. invalid seed confidence fails", () => {
    expect(
      () =>
        new SystemDiscoverySeed({
          id: "s1",
          seedType: "SYSTEM",
          nameEn: "CCTV",
          evidence: sampleEvidence,
          confidence: 1.5,
        })
    ).toThrow("confidence must be a finite number between 0 and 1");
  });

  it("19. invalid component confidence fails", () => {
    expect(
      () =>
        new SystemComponent({
          key: "cam",
          componentType: "PRODUCT",
          nameEn: "Camera",
          confidence: -0.1,
        })
    ).toThrow("confidence must be a finite number between 0 and 1");
  });

  it("20. max bound 0 fails", () => {
    const seed = new SystemDiscoverySeed({
      id: "s1",
      seedType: "SYSTEM",
      nameEn: "CCTV",
      evidence: sampleEvidence,
      confidence: 0.9,
      components: [{ key: "cam", componentType: "PRODUCT", nameEn: "Camera", confidence: 0.9 }],
    });
    expect(() => new SystemPopulationPlanner().plan(seed, { maxWorkItemsBound: 0 })).toThrow(
      "Invalid maxWorkItemsBound"
    );
  });

  it("21. negative max bound fails", () => {
    const seed = new SystemDiscoverySeed({
      id: "s1",
      seedType: "SYSTEM",
      nameEn: "CCTV",
      evidence: sampleEvidence,
      confidence: 0.9,
      components: [{ key: "cam", componentType: "PRODUCT", nameEn: "Camera", confidence: 0.9 }],
    });
    expect(() => new SystemPopulationPlanner().plan(seed, { maxWorkItemsBound: -5 })).toThrow(
      "Invalid maxWorkItemsBound"
    );
  });

  it("22. NaN max bound fails", () => {
    const seed = new SystemDiscoverySeed({
      id: "s1",
      seedType: "SYSTEM",
      nameEn: "CCTV",
      evidence: sampleEvidence,
      confidence: 0.9,
      components: [{ key: "cam", componentType: "PRODUCT", nameEn: "Camera", confidence: 0.9 }],
    });
    expect(() => new SystemPopulationPlanner().plan(seed, { maxWorkItemsBound: NaN })).toThrow(
      "Invalid maxWorkItemsBound"
    );
  });

  it("23. fractional max bound fails", () => {
    const seed = new SystemDiscoverySeed({
      id: "s1",
      seedType: "SYSTEM",
      nameEn: "CCTV",
      evidence: sampleEvidence,
      confidence: 0.9,
      components: [{ key: "cam", componentType: "PRODUCT", nameEn: "Camera", confidence: 0.9 }],
    });
    expect(() => new SystemPopulationPlanner().plan(seed, { maxWorkItemsBound: 1.5 })).toThrow(
      "Invalid maxWorkItemsBound"
    );
  });

  it("24. over-maximum max bound fails", () => {
    const seed = new SystemDiscoverySeed({
      id: "s1",
      seedType: "SYSTEM",
      nameEn: "CCTV",
      evidence: sampleEvidence,
      confidence: 0.9,
      components: [{ key: "cam", componentType: "PRODUCT", nameEn: "Camera", confidence: 0.9 }],
    });
    expect(() => new SystemPopulationPlanner().plan(seed, { maxWorkItemsBound: 150 })).toThrow(
      "Invalid maxWorkItemsBound"
    );
  });

  it("25. oversized collections fail", () => {
    const oversizedAliases = Array.from({ length: 25 }, (_, i) => `Alias ${i}`);
    expect(
      () =>
        new SystemDiscoverySeed({
          id: "s1",
          seedType: "SYSTEM",
          nameEn: "CCTV",
          aliasesEn: oversizedAliases,
          evidence: sampleEvidence,
          confidence: 0.9,
        })
    ).toThrow("AliasesEn collection bound exceeded");
  });

  it("26. malformed collection members fail", () => {
    expect(
      () =>
        new SystemDiscoverySeed({
          id: "s1",
          seedType: "SYSTEM",
          nameEn: "CCTV",
          aliasesEn: ["valid", 123 as any],
          evidence: sampleEvidence,
          confidence: 0.9,
        })
    ).toThrow("Invalid non-string member in AliasesEn");

    expect(
      () =>
        new DiscoveryEvidence({
          url: "https://example.com",
          claimSupport: ["valid claim", null as any],
        })
    ).toThrow("claimSupport contains non-string member");
  });

  it("27. English-only seed valid", () => {
    const seed = new SystemDiscoverySeed({
      id: "s1",
      seedType: "SYSTEM",
      nameEn: "Fire Alarm System",
      evidence: sampleEvidence,
      confidence: 0.9,
    });
    expect(seed.nameEn).toBe("Fire Alarm System");
    expect(seed.nameAr).toBeNull();
  });

  it("28. Arabic localization pending is derived correctly", () => {
    const seed = new SystemDiscoverySeed({
      id: "s1",
      seedType: "SYSTEM",
      nameEn: "Fire Alarm System",
      nameAr: null, // missing Arabic name
      evidence: sampleEvidence,
      confidence: 0.9,
    });
    expect(seed.requiresArabicLocalization).toBe(true);
  });

  it("29. bilingual seed can report localization complete/not pending where applicable", () => {
    const seed = new SystemDiscoverySeed({
      id: "s1",
      seedType: "SYSTEM",
      nameEn: "Fire Alarm System",
      nameAr: "نظام إنذار الحريق",
      evidence: sampleEvidence,
      confidence: 0.9,
      components: [
        {
          key: "detector",
          componentType: "PRODUCT",
          nameEn: "Smoke Detector",
          nameAr: "كاشف دخان",
          confidence: 0.9,
        },
      ],
    });
    expect(seed.requiresArabicLocalization).toBe(false);
  });

  it("30. identity hints are preserved byte-for-byte", () => {
    const exactHints = {
      manufacturerHint: "Axis Communications AB",
      brandHint: "Axis",
      familyHint: "P32 Series",
      modelNumber: "P3245-LV",
      mpn: "01588-001",
      sku: "AXIS-P3245LV-4K",
      gtin: "07331021001234",
    };

    const comp = new SystemComponent({
      key: "axis_camera",
      componentType: "PRODUCT",
      nameEn: "Axis Camera",
      confidence: 0.9,
      identityHints: exactHints,
    });

    expect(comp.identityHints).toEqual(exactHints);
    expect(comp.identityHints?.modelNumber).toBe("P3245-LV");
  });

  it("31. component evidence remains distinct from seed evidence", () => {
    const compEvid = [
      new DiscoveryEvidence({
        url: "https://axis.com/p3245/specs",
        title: "P3245 Specs",
      }),
    ];

    const seed = new SystemDiscoverySeed({
      id: "s1",
      seedType: "SYSTEM",
      nameEn: "CCTV",
      evidence: sampleEvidence,
      confidence: 0.9,
      components: [
        {
          key: "cam",
          componentType: "PRODUCT",
          nameEn: "Camera",
          confidence: 0.9,
          evidence: compEvid,
        },
      ],
    });

    const workItem = new SystemPopulationPlanner().plan(seed)[0];
    expect(workItem.componentEvidence).toHaveLength(1);
    expect(workItem.componentEvidence[0].url).toBe("https://axis.com/p3245/specs");
    expect(workItem.seedEvidence).toHaveLength(1);
    expect(workItem.seedEvidence[0].url).toBe("https://example-manufacturer.com/tech-specs/cctv-system");
    expect(workItem.evidenceDiscoveryRequired).toBe(false);
  });

  it("32. unevidenced component does not receive fake seed evidence", () => {
    const seed = new SystemDiscoverySeed({
      id: "s1",
      seedType: "SYSTEM",
      nameEn: "CCTV",
      evidence: sampleEvidence,
      confidence: 0.9,
      components: [
        {
          key: "cable",
          componentType: "PRODUCT",
          nameEn: "Cat6 Cable",
          confidence: 0.8,
        },
      ],
    });

    const workItem = new SystemPopulationPlanner().plan(seed)[0];
    expect(workItem.componentEvidence).toHaveLength(0);
    expect(workItem.seedEvidence).toHaveLength(1);
  });

  it("33. unevidenced component explicitly indicates evidence discovery required", () => {
    const seed = new SystemDiscoverySeed({
      id: "s1",
      seedType: "SYSTEM",
      nameEn: "CCTV",
      evidence: sampleEvidence,
      confidence: 0.9,
      components: [
        {
          key: "cable",
          componentType: "PRODUCT",
          nameEn: "Cat6 Cable",
          confidence: 0.8,
        },
      ],
    });

    const workItem = new SystemPopulationPlanner().plan(seed)[0];
    expect(workItem.evidenceDiscoveryRequired).toBe(true);
  });

  it("34. GLOBAL remains canonical", () => {
    const seed = new SystemDiscoverySeed({
      id: "s1",
      seedType: "SYSTEM",
      nameEn: "CCTV",
      evidence: sampleEvidence,
      confidence: 0.9,
      marketRelevanceTargets: ["GCC", "KUWAIT"],
      components: [
        {
          key: "cam",
          componentType: "PRODUCT",
          nameEn: "Camera",
          confidence: 0.9,
        },
      ],
    });

    expect(seed.canonicalScope).toBe("GLOBAL");
    const workItem = new SystemPopulationPlanner().plan(seed)[0];
    expect(workItem.canonicalScope).toBe("GLOBAL");
  });

  it("35. market relevance targets are preserved as enrichment hints only", () => {
    const seed = new SystemDiscoverySeed({
      id: "s1",
      seedType: "SYSTEM",
      nameEn: "CCTV",
      evidence: sampleEvidence,
      confidence: 0.9,
      marketRelevanceTargets: ["MIDDLE_EAST", "KUWAIT"],
      components: [
        {
          key: "cam",
          componentType: "PRODUCT",
          nameEn: "Camera",
          confidence: 0.9,
        },
      ],
    });

    const workItem = new SystemPopulationPlanner().plan(seed)[0];
    expect(workItem.marketRelevanceTargets).toEqual(["MIDDLE_EAST", "KUWAIT"]);
  });

  it("36. no runtime dependency on forbidden architecture areas", () => {
    const domainDir = path.join(__dirname, "../../domain/discovery");
    const appDir = path.join(__dirname, "../../application/population");

    const filesToCheck = [
      ...fs.readdirSync(domainDir).map((f) => path.join(domainDir, f)),
      ...fs.readdirSync(appDir).map((f) => path.join(appDir, f)),
    ].filter((f) => f.endsWith(".ts"));

    const forbiddenPatterns = [
      /from\s+["'].*prisma.*["']/i,
      /from\s+["'].*openai.*["']/i,
      /from\s+["'].*ai-sales-assistant.*["']/i,
      /from\s+["'].*smart-system.*["']/i,
      /from\s+["'].*features\/catalog.*["']/i,
      /import\(["'].*prisma.*["']\)/i,
    ];

    for (const filePath of filesToCheck) {
      const content = fs.readFileSync(filePath, "utf-8");
      for (const pattern of forbiddenPatterns) {
        expect(content).not.toMatch(pattern);
      }
    }
  });
});
