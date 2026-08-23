import type {
  ISystemTemplate,
  SystemCalculationResult,
  SystemInputParameter,
  SystemComponent,
  ProvenanceType,
} from "./types";

export interface CctvInputs {
  cameraCount?: number | null;
  projectContext?: string | null; // e.g., "villa", "commercial", "warehouse"
  storageDays?: number | null;
  includeCableAllowance?: boolean | null;
}

export class CctvSystemTemplate implements ISystemTemplate {
  public readonly systemType = "CCTV";
  public readonly displayNameAr = "نظام المراقبة والأمن الكاميرات (CCTV)";
  public readonly displayNameEn = "CCTV Security & Surveillance System";

  public static readonly DEFAULT_STORAGE_DAYS = 30;
  public static readonly DEFAULT_CABLE_METERS_PER_CAMERA = 30;

  public calculate(rawInputs: Record<string, any>): SystemCalculationResult {
    const warnings: string[] = [];
    const missingInputs: string[] = [];

    const cameraCountProvided =
      rawInputs.cameraCount ?? rawInputs.cameras ?? rawInputs.count ?? null;
    const cameraCount =
      typeof cameraCountProvided === "number" && cameraCountProvided > 0
        ? Math.round(cameraCountProvided)
        : null;

    if (cameraCount === null) {
      if (cameraCountProvided !== null && Number(cameraCountProvided) <= 0) {
        warnings.push("Camera count must be greater than 0.");
      } else {
        missingInputs.push("cameraCount");
      }
    }

    const projectContext =
      typeof rawInputs.projectContext === "string" && rawInputs.projectContext.trim()
        ? rawInputs.projectContext.trim()
        : "villa";

    const storageDaysProvided = rawInputs.storageDays ?? rawInputs.days;
    const storageDays =
      typeof storageDaysProvided === "number" && storageDaysProvided > 0
        ? storageDaysProvided
        : CctvSystemTemplate.DEFAULT_STORAGE_DAYS;
    const storageProvenance: ProvenanceType =
      typeof storageDaysProvided === "number" && storageDaysProvided > 0
        ? "USER_PROVIDED"
        : "SUGGESTED";

    const inputs: SystemInputParameter[] = [
      {
        name: "cameraCount",
        labelAr: "عدد الكاميرات",
        labelEn: "Camera Count",
        value: cameraCount,
        unit: "Cameras",
        provenance: cameraCount !== null ? "USER_PROVIDED" : "SUGGESTED",
      },
      {
        name: "projectContext",
        labelAr: "سياق المشروع",
        labelEn: "Project Context",
        value: projectContext,
        provenance: "USER_PROVIDED",
      },
      {
        name: "storageDays",
        labelAr: "مدة التسجيل (يوم)",
        labelEn: "Storage Duration (Days)",
        value: storageDays,
        unit: "Days",
        provenance: storageProvenance,
        isDefault: storageProvenance === "SUGGESTED",
      },
    ];

    if (missingInputs.length > 0) {
      return {
        systemType: this.systemType,
        systemNameAr: this.displayNameAr,
        systemNameEn: this.displayNameEn,
        status: "NEEDS_CONFIRMATION",
        inputs,
        missingInputs,
        warnings: [
          ...warnings,
          "Camera count is required to dimension the NVR, storage, PoE ports, and accessories.",
        ],
        components: [],
      };
    }

    const count = cameraCount!;

    // NVR Dimensioning (4, 8, 16, 32, 64 channels)
    let nvrChannels = 4;
    if (count > 32) nvrChannels = 64;
    else if (count > 16) nvrChannels = 32;
    else if (count > 8) nvrChannels = 16;
    else if (count > 4) nvrChannels = 8;

    // Storage calculation (~ 1TB per 10 days per 4K camera)
    const estimatedTbRequired = Math.ceil((count * storageDays * 0.1) / 4) * 2;
    const hddCount = Math.max(1, Math.ceil(estimatedTbRequired / 6)); // 6TB surveillance drives

    // PoE Switch sizing (8, 16, 24, 48 ports)
    let poePorts = 8;
    if (count > 24) poePorts = 48;
    else if (count > 12) poePorts = 24;
    else if (count > 6) poePorts = 16;

    const poeSwitchCount = Math.ceil(count / (poePorts - 2)); // keep uplink ports free

    // Cabling allowance
    const totalCableMeters = count * CctvSystemTemplate.DEFAULT_CABLE_METERS_PER_CAMERA;
    const cableBoxes = Math.max(1, Math.ceil(totalCableMeters / 305)); // 305m per Cat6 box

    const components: SystemComponent[] = [
      {
        componentKey: "CCTV_CAMERAS",
        name: `كاميرات مراقبة شبكية 4K IP (${projectContext})`,
        nameAr: `كاميرات مراقبة شبكية 4K IP (${projectContext})`,
        nameEn: `4K IP CCTV Surveillance Cameras (${projectContext})`,
        itemType: "PRODUCT",
        quantity: count,
        unit: "Unit",
        provenance: "USER_PROVIDED",
        formulaExplanation: `Requested quantity: ${count} camera(s)`,
        category: "HARDWARE",
      },
      {
        componentKey: "NVR_RECORDER",
        name: `جهاز تسجيل شبكي NVR (${nvrChannels} قناة)`,
        nameAr: `جهاز تسجيل شبكي NVR (${nvrChannels} قناة)`,
        nameEn: `Network Video Recorder NVR (${nvrChannels} Channels)`,
        itemType: "PRODUCT",
        quantity: 1,
        unit: "Unit",
        provenance: "CALCULATED",
        formulaExplanation: `Dimensioned NVR with ${nvrChannels} channels to support ${count} cameras`,
        category: "HARDWARE",
      },
      {
        componentKey: "SURVEILLANCE_HDD",
        name: `أقراص تخزين مخصصة للمراقبة Surveillance HDD (${storageDays} يوم)`,
        nameAr: `أقراص تخزين مخصصة للمراقبة Surveillance HDD (${storageDays} يوم)`,
        nameEn: `Surveillance-grade Hard Drives HDD (${storageDays} days retention)`,
        itemType: "PRODUCT",
        quantity: hddCount,
        unit: "Unit",
        provenance: "CALCULATED",
        formulaExplanation: `Calculated for ${count} cameras over ${storageDays} days retention (~${estimatedTbRequired} TB total)`,
        category: "HARDWARE",
      },
      {
        componentKey: "POE_SWITCH",
        name: `موزع شبكة PoE Switch (${poePorts} منفذ)`,
        nameAr: `موزع شبكة PoE Switch (${poePorts} منفذ)`,
        nameEn: `PoE Network Switch (${poePorts} Ports)`,
        itemType: "PRODUCT",
        quantity: poeSwitchCount,
        unit: "Unit",
        provenance: "CALCULATED",
        formulaExplanation: `${poeSwitchCount} switch(es) with ${poePorts} PoE ports to power ${count} cameras`,
        category: "NETWORKING",
      },
      {
        componentKey: "RACK_CABINET",
        name: "كابينة تجميع الشبكة والتسجيل Wall Mount Cabinet",
        nameAr: "كابينة تجميع الشبكة والتسجيل Wall Mount Cabinet",
        nameEn: "Wall Mount Server & NVR Cabinet",
        itemType: "PRODUCT",
        quantity: 1,
        unit: "Unit",
        provenance: "SUGGESTED",
        formulaExplanation: "Suggested standard wall mount enclosure for NVR and PoE switch",
        category: "INFRASTRUCTURE",
      },
      {
        componentKey: "CAT6_CABLING",
        name: "كابلات شبكة Cat6 المخصصة للمراقبة (بكرات)",
        nameAr: "كابلات شبكة Cat6 المخصصة للمراقبة (بكرات)",
        nameEn: "Cat6 Ethernet Cable Rolls (305m per roll)",
        itemType: "PRODUCT",
        quantity: cableBoxes,
        unit: "Roll",
        provenance: "CALCULATED",
        formulaExplanation: `Math.ceil(${count} cameras * 30m / 305m roll) = ${cableBoxes} roll(s)`,
        category: "INFRASTRUCTURE",
      },
      {
        componentKey: "CONNECTORS_AND_ACCESSORIES",
        name: "وصلات RJ45 وعلب تجميع الكابلات ومستلزمات التركيب",
        nameAr: "وصلات RJ45 وعلب تجميع الكابلات ومستلزمات التركيب",
        nameEn: "RJ45 Connectors & Weatherproof Junction Boxes Set",
        itemType: "PRODUCT",
        quantity: count,
        unit: "Set",
        provenance: "CALCULATED",
        formulaExplanation: `1 connector & junction box set per camera (${count} sets)`,
        category: "ACCESSORIES",
      },
      {
        componentKey: "INSTALLATION_COMMISSIONING",
        name: "خدمات التوريد والتركيب والبرمجة والتمديد واختبار النظام",
        nameAr: "خدمات التوريد والتركيب والبرمجة والتمديد واختبار النظام",
        nameEn: "Installation, Cabling, Configuration & Commissioning Services",
        itemType: "SERVICE",
        quantity: count,
        unit: "Point",
        provenance: "CALCULATED",
        formulaExplanation: `Turnkey installation & testing service for ${count} camera point(s)`,
        category: "SERVICES",
      },
    ];

    return {
      systemType: this.systemType,
      systemNameAr: this.displayNameAr,
      systemNameEn: this.displayNameEn,
      status: "COMPLETE",
      inputs,
      missingInputs: [],
      warnings,
      components,
    };
  }
}
