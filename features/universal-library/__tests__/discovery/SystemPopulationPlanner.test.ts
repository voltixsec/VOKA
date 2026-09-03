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

describe("PIC-03A1 System/Solution Discovery Decomposition & Population Planner Suite", () => {
  const sampleEvidence = [
    new DiscoveryEvidence({
      url: "https://example-manufacturer.com/tech-specs/cctv-system",
      title: "IP Video Surveillance System Technical Architecture",
      publisher: "Manufacturer Authority",
      sourceType: "MANUFACTURER_TECHNICAL",
    }),
  ];

  it("1. CCTV SYSTEM decomposes into PRODUCT and SERVICE work items", () => {
    const seed = new SystemDiscoverySeed({
      id: "seed-cctv-001",
      seedType: "SYSTEM",
      nameEn: "IP Video Surveillance System",
      nameAr: "نظام المراقبة المرئية عبر الشبكة",
      evidence: sampleEvidence,
      confidence: 0.95,
      components: [
        {
          key: "ip_camera",
          componentType: "PRODUCT",
          nameEn: "4MP Outdoor IP Dome Camera",
          nameAr: "كاميرا مراقبة خارجية 4 ميجابكسل",
          confidence: 0.9,
        },
        {
          key: "installation_service",
          componentType: "SERVICE",
          nameEn: "CCTV Installation & Configuration Service",
          nameAr: "خدمة تركيب وبرمجة كاميرات المراقبة",
          confidence: 0.85,
        },
      ],
    });

    const planner = new SystemPopulationPlanner();
    const workItems = planner.plan(seed);

    expect(workItems).toHaveLength(2);
    const productItem = workItems.find((w) => w.componentKey === "ip_camera");
    const serviceItem = workItems.find((w) => w.componentKey === "installation_service");

    expect(productItem).toBeDefined();
    expect(productItem?.componentType).toBe("PRODUCT");
    expect(productItem?.intention).toBe("GLOBAL_PRODUCT_EXPANSION");

    expect(serviceItem).toBeDefined();
    expect(serviceItem?.componentType).toBe("SERVICE");
    expect(serviceItem?.intention).toBe("SERVICE_POPULATION");
  });

  it("2. SOLUTION seed is accepted", () => {
    const seed = new SystemDiscoverySeed({
      id: "seed-sol-001",
      seedType: "SOLUTION",
      nameEn: "Integrated Building Security Solution",
      nameAr: "حلول الأمن المتكامل للمباني",
      evidence: sampleEvidence,
      confidence: 0.92,
      components: [
        {
          key: "access_control_panel",
          componentType: "PRODUCT",
          nameEn: "4-Door Network Access Control Panel",
          confidence: 0.9,
        },
      ],
    });

    expect(seed.seedType).toBe("SOLUTION");
    const planner = new SystemPopulationPlanner();
    const workItems = planner.plan(seed);

    expect(workItems).toHaveLength(1);
    expect(workItems[0].seedType).toBe("SOLUTION");
  });

  it("3. PRODUCT -> GLOBAL_PRODUCT_EXPANSION", () => {
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

  it("4. SERVICE -> SERVICE_POPULATION", () => {
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

  it("5. quantity/project engineering fields are absent from discovery contracts", () => {
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

    // Explicit runtime check that engineering quantity fields do not exist on contracts
    expect((comp as any).quantity).toBeUndefined();
    expect((comp as any).projectCount).toBeUndefined();
    expect((comp as any).unit).toBeUndefined();
    expect((comp as any).areaM2).toBeUndefined();

    expect((seed as any).quantity).toBeUndefined();
    expect((seed as any).projectCount).toBeUndefined();

    expect((item as any).quantity).toBeUndefined();
    expect((item as any).projectCount).toBeUndefined();
  });

  it("6. duplicate component keys deduplicate deterministically", () => {
    const seed = new SystemDiscoverySeed({
      id: "seed-dedup-001",
      seedType: "SYSTEM",
      nameEn: "CCTV System",
      evidence: sampleEvidence,
      confidence: 0.9,
      components: [
        { key: "ip_camera", componentType: "PRODUCT", nameEn: "IP Camera 1", confidence: 0.9 },
        { key: "IP_CAMERA", componentType: "PRODUCT", nameEn: "IP Camera Duplicate", confidence: 0.8 },
        { key: "ip-camera", componentType: "PRODUCT", nameEn: "IP Camera Hyphen", confidence: 0.7 },
        { key: "nvr_recorder", componentType: "PRODUCT", nameEn: "NVR Recorder", confidence: 0.9 },
      ],
    });

    const workItems = new SystemPopulationPlanner().plan(seed);
    expect(workItems).toHaveLength(2);
    expect(workItems.map((w) => w.normalizedComponentKey)).toEqual(["ip_camera", "nvr_recorder"]);
  });

  it("7. identical logical component sets in different input order produce identical ordered work-item IDs", () => {
    const seedA = new SystemDiscoverySeed({
      id: "seed-order-test",
      seedType: "SYSTEM",
      nameEn: "System Order A",
      evidence: sampleEvidence,
      confidence: 0.9,
      components: [
        { key: "storage_hdd", componentType: "PRODUCT", nameEn: "Storage HDD", confidence: 0.9 },
        { key: "poe_switch", componentType: "PRODUCT", nameEn: "PoE Switch", confidence: 0.9 },
        { key: "ip_camera", componentType: "PRODUCT", nameEn: "IP Camera", confidence: 0.9 },
      ],
    });

    const seedB = new SystemDiscoverySeed({
      id: "seed-order-test",
      seedType: "SYSTEM",
      nameEn: "System Order B",
      evidence: sampleEvidence,
      confidence: 0.9,
      components: [
        { key: "ip_camera", componentType: "PRODUCT", nameEn: "IP Camera", confidence: 0.9 },
        { key: "storage_hdd", componentType: "PRODUCT", nameEn: "Storage HDD", confidence: 0.9 },
        { key: "poe_switch", componentType: "PRODUCT", nameEn: "PoE Switch", confidence: 0.9 },
      ],
    });

    const planner = new SystemPopulationPlanner();
    const workItemsA = planner.plan(seedA);
    const workItemsB = planner.plan(seedB);

    expect(workItemsA.map((w) => w.id)).toEqual(workItemsB.map((w) => w.id));
    expect(workItemsA.map((w) => w.normalizedComponentKey)).toEqual(["ip_camera", "poe_switch", "storage_hdd"]);
  });

  it("8. empty seed English name fails", () => {
    expect(
      () =>
        new SystemDiscoverySeed({
          id: "seed-err-1",
          seedType: "SYSTEM",
          nameEn: "   ",
          evidence: sampleEvidence,
          confidence: 0.9,
        })
    ).toThrow("SystemDiscoverySeed nameEn cannot be empty");
  });

  it("9. zero seed evidence fails", () => {
    expect(
      () =>
        new SystemDiscoverySeed({
          id: "seed-err-2",
          seedType: "SYSTEM",
          nameEn: "Test System",
          evidence: [],
          confidence: 0.9,
        })
    ).toThrow("requires at least one genuine evidence reference");
  });

  it("10. empty component English name fails", () => {
    expect(
      () =>
        new SystemComponent({
          key: "cam-1",
          componentType: "PRODUCT",
          nameEn: "   ",
          confidence: 0.8,
        })
    ).toThrow("SystemComponent nameEn cannot be empty");
  });

  it("11. empty component key fails", () => {
    expect(
      () =>
        new SystemComponent({
          key: "   ",
          componentType: "PRODUCT",
          nameEn: "Valid Camera Name",
          confidence: 0.8,
        })
    ).toThrow("SystemComponent key cannot be empty");
  });

  it("12. maximum work-item bound fails without truncation", () => {
    const components = Array.from({ length: 15 }, (_, i) => ({
      key: `component_${i + 1}`,
      componentType: "PRODUCT" as const,
      nameEn: `Component ${i + 1}`,
      confidence: 0.8,
    }));

    const seed = new SystemDiscoverySeed({
      id: "seed-bound-test",
      seedType: "SYSTEM",
      nameEn: "Large System",
      evidence: sampleEvidence,
      confidence: 0.9,
      components,
    });

    const planner = new SystemPopulationPlanner();

    // Should fail explicitly when exceeding maxWorkItemsBound (e.g. 10)
    expect(() => planner.plan(seed, { maxWorkItemsBound: 10 })).toThrow(
      "Maximum population work items bound exceeded: 15 work items exceeds maximum allowed bound of 10"
    );
  });

  it("13. English-only discovery is valid", () => {
    const seed = new SystemDiscoverySeed({
      id: "seed-en-only",
      seedType: "SYSTEM",
      nameEn: "Fire Alarm System",
      evidence: sampleEvidence,
      confidence: 0.9,
      components: [
        {
          key: "smoke_detector",
          componentType: "PRODUCT",
          nameEn: "Optical Smoke Detector",
          confidence: 0.85,
        },
      ],
    });

    expect(seed.nameEn).toBe("Fire Alarm System");
    expect(seed.nameAr).toBeNull();
    expect(seed.requiresArabicLocalization).toBe(true);
  });

  it("14. missing Arabic human-facing content reports Arabic localization pending", () => {
    const seed = new SystemDiscoverySeed({
      id: "seed-loc-pending",
      seedType: "SYSTEM",
      nameEn: "Access Control System",
      nameAr: null, // missing Arabic
      evidence: sampleEvidence,
      confidence: 0.9,
      components: [
        {
          key: "card_reader",
          componentType: "PRODUCT",
          nameEn: "RFID Card Reader",
          nameAr: "قارئ بطاقات",
          confidence: 0.9,
        },
      ],
    });

    expect(seed.requiresArabicLocalization).toBe(true);
  });

  it("15. sufficiently bilingual discovery reports localization not pending where applicable", () => {
    const seed = new SystemDiscoverySeed({
      id: "seed-bilingual",
      seedType: "SYSTEM",
      nameEn: "Access Control System",
      nameAr: "نظام التحكم بالدخول",
      descriptionEn: "Complete access control system",
      descriptionAr: "نظام تحكم بالدخول متكامل",
      evidence: sampleEvidence,
      confidence: 0.9,
      components: [
        {
          key: "card_reader",
          componentType: "PRODUCT",
          nameEn: "RFID Card Reader",
          nameAr: "قارئ بطاقات الذكية",
          confidence: 0.9,
        },
      ],
    });

    expect(seed.requiresArabicLocalization).toBe(false);
  });

  it("16. manufacturer/brand/family/model/MPN/SKU/GTIN identity hints are preserved exactly", () => {
    const exactIdentityHints = {
      manufacturerHint: "Axis Communications AB",
      brandHint: "Axis",
      familyHint: "P32 Series",
      modelNumber: "P3245-LV",
      mpn: "01588-001",
      sku: "AXIS-P3245LV-4K",
      gtin: "07331021001234",
    };

    const seed = new SystemDiscoverySeed({
      id: "seed-identity-exact",
      seedType: "SYSTEM",
      nameEn: "High-End CCTV System",
      evidence: sampleEvidence,
      confidence: 0.95,
      components: [
        {
          key: "axis_camera",
          componentType: "PRODUCT",
          nameEn: "Axis Dome Network Camera",
          confidence: 0.95,
          identityHints: exactIdentityHints,
        },
      ],
    });

    const workItems = new SystemPopulationPlanner().plan(seed);
    const hints = workItems[0].identityHints;

    expect(hints).toEqual(exactIdentityHints);
    expect(hints?.manufacturerHint).toBe("Axis Communications AB");
    expect(hints?.modelNumber).toBe("P3245-LV");
    expect(hints?.mpn).toBe("01588-001");
  });

  it("17. component evidence remains separate from seed evidence", () => {
    const compEvidence = [
      new DiscoveryEvidence({
        url: "https://axis.com/products/p3245-lv/datasheet",
        title: "P3245-LV Datasheet",
        publisher: "Axis Communications",
        sourceType: "MANUFACTURER_TECHNICAL",
      }),
    ];

    const seed = new SystemDiscoverySeed({
      id: "seed-evid-sep",
      seedType: "SYSTEM",
      nameEn: "IP Camera System",
      evidence: sampleEvidence,
      confidence: 0.9,
      components: [
        {
          key: "axis_camera",
          componentType: "PRODUCT",
          nameEn: "Axis Dome Camera",
          confidence: 0.9,
          evidence: compEvidence,
        },
      ],
    });

    const workItems = new SystemPopulationPlanner().plan(seed);
    const item = workItems[0];

    expect(item.componentEvidence).toHaveLength(1);
    expect(item.componentEvidence[0].url).toBe("https://axis.com/products/p3245-lv/datasheet");
    expect(item.seedEvidence).toHaveLength(1);
    expect(item.seedEvidence[0].url).toBe("https://example-manufacturer.com/tech-specs/cctv-system");
    expect(item.evidenceDiscoveryRequired).toBe(false);
  });

  it("18. unevidenced components do not receive fabricated system evidence", () => {
    const seed = new SystemDiscoverySeed({
      id: "seed-unevidenced-comp",
      seedType: "SYSTEM",
      nameEn: "General CCTV System",
      evidence: sampleEvidence,
      confidence: 0.9,
      components: [
        {
          key: "generic_cable",
          componentType: "PRODUCT",
          nameEn: "Cat6 Ethernet Cable",
          confidence: 0.8,
          // No component evidence supplied!
        },
      ],
    });

    const workItems = new SystemPopulationPlanner().plan(seed);
    const item = workItems[0];

    expect(item.componentEvidence).toHaveLength(0);
    expect(item.evidenceDiscoveryRequired).toBe(true);
    // Seed evidence is kept in seedEvidence field for context, but componentEvidence stays empty
    expect(item.seedEvidence).toHaveLength(1);
  });

  it("19. global canonical scope remains GLOBAL", () => {
    const seed = new SystemDiscoverySeed({
      id: "seed-scope-global",
      seedType: "SYSTEM",
      nameEn: "Global CCTV System",
      evidence: sampleEvidence,
      confidence: 0.9,
      marketRelevanceTargets: ["GCC", "KUWAIT"],
      components: [
        {
          key: "camera",
          componentType: "PRODUCT",
          nameEn: "Global Camera",
          confidence: 0.9,
        },
      ],
    });

    expect(seed.canonicalScope).toBe("GLOBAL");
    const workItems = new SystemPopulationPlanner().plan(seed);
    expect(workItems[0].canonicalScope).toBe("GLOBAL");
  });

  it("20. optional market relevance targets survive planning without changing identity", () => {
    const seed = new SystemDiscoverySeed({
      id: "seed-mkt-targets",
      seedType: "SYSTEM",
      nameEn: "Kuwait CCTV System",
      evidence: sampleEvidence,
      confidence: 0.9,
      marketRelevanceTargets: ["MIDDLE_EAST", "GCC", "KUWAIT"],
      components: [
        {
          key: "camera",
          componentType: "PRODUCT",
          nameEn: "Outdoor Camera",
          confidence: 0.9,
          identityHints: { modelNumber: "KWT-CAM-100" },
        },
      ],
    });

    const workItems = new SystemPopulationPlanner().plan(seed);
    expect(workItems[0].marketRelevanceTargets).toEqual(["MIDDLE_EAST", "GCC", "KUWAIT"]);
    expect(workItems[0].identityHints?.modelNumber).toBe("KWT-CAM-100");
  });

  it("21. invalid seed confidence fails", () => {
    expect(
      () =>
        new SystemDiscoverySeed({
          id: "seed-bad-conf-1",
          seedType: "SYSTEM",
          nameEn: "Bad Seed",
          evidence: sampleEvidence,
          confidence: 1.5, // invalid
        })
    ).toThrow("confidence must be a finite number between 0 and 1");

    expect(
      () =>
        new SystemDiscoverySeed({
          id: "seed-bad-conf-2",
          seedType: "SYSTEM",
          nameEn: "Bad Seed",
          evidence: sampleEvidence,
          confidence: NaN, // invalid
        })
    ).toThrow("confidence must be a finite number between 0 and 1");
  });

  it("22. invalid component confidence fails", () => {
    expect(
      () =>
        new SystemComponent({
          key: "bad-comp-1",
          componentType: "PRODUCT",
          nameEn: "Bad Comp",
          confidence: -0.1, // invalid
        })
    ).toThrow("confidence must be a finite number between 0 and 1");
  });

  it("23. oversized bounded collections fail", () => {
    const oversizedAliases = Array.from({ length: 25 }, (_, i) => `Alias ${i}`);
    expect(
      () =>
        new SystemDiscoverySeed({
          id: "seed-oversized-alias",
          seedType: "SYSTEM",
          nameEn: "Oversized System",
          aliasesEn: oversizedAliases,
          evidence: sampleEvidence,
          confidence: 0.9,
        })
    ).toThrow("AliasesEn collection bound exceeded");

    const oversizedSpecs = Array.from({ length: 55 }, (_, i) => `Spec ${i}`);
    expect(
      () =>
        new SystemComponent({
          key: "comp-oversized-spec",
          componentType: "PRODUCT",
          nameEn: "Oversized Spec Product",
          specificationHints: oversizedSpecs,
          confidence: 0.9,
        })
    ).toThrow("Specification hints collection bound exceeded");
  });

  it("24. new implementation has no runtime dependency on Prisma, OpenAI, Sales Assistant, Smart System, Company Catalog", () => {
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
