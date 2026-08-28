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
  includeInstallation?: boolean | null;
  bitrateMbps?: number | null;
  cableMetersPerCamera?: number | null;
}

export class CctvSystemTemplate implements ISystemTemplate {
  public readonly systemType = "CCTV";
  public readonly templateVersion = "1.2.0";
  public readonly displayNameAr = "نظام المراقبة والأمن الكاميرات (CCTV)";
  public readonly displayNameEn = "CCTV Security & Surveillance System";

  public static readonly DEFAULT_STORAGE_DAYS = 30;
  public static readonly DEFAULT_CABLE_METERS_PER_CAMERA = 30;
  public static readonly DEFAULT_BITRATE_MBPS = 8;

  public calculate(rawInputs: Record<string, any>): SystemCalculationResult {
    const warnings: string[] = [];
    const missingInputs: string[] = [];

    const cameraCountProvided =
      rawInputs.cameraCount ?? rawInputs.cameras ?? rawInputs.count ?? null;
    const cameraCount =
      typeof cameraCountProvided === "number" && Number.isInteger(cameraCountProvided) && cameraCountProvided > 0 && cameraCountProvided <= 1024
        ? cameraCountProvided
        : null;

    if (cameraCount === null) {
      if (cameraCountProvided !== null) {
        warnings.push("Camera count must be an integer from 1 to 1024.");
      } else {
        missingInputs.push("cameraCount");
      }
    }

    const projectContext =
      typeof rawInputs.projectContext === "string" && rawInputs.projectContext.trim()
        ? rawInputs.projectContext.trim()
        : "unspecified";
    const projectContextProvided = typeof rawInputs.projectContext === "string" && Boolean(rawInputs.projectContext.trim());

    const storageDaysProvided = rawInputs.storageDays ?? rawInputs.days;
    const storageDays =
      typeof storageDaysProvided === "number" && storageDaysProvided > 0
        ? storageDaysProvided
        : CctvSystemTemplate.DEFAULT_STORAGE_DAYS;
    const storageProvenance: ProvenanceType =
      typeof storageDaysProvided === "number" && storageDaysProvided > 0
        ? "USER_PROVIDED"
        : "SUGGESTED";
    const bitrateProvided = rawInputs.bitrateMbps;
    const bitrateMbps = typeof bitrateProvided === "number" && Number.isFinite(bitrateProvided) && bitrateProvided > 0 && bitrateProvided <= 100
      ? bitrateProvided
      : CctvSystemTemplate.DEFAULT_BITRATE_MBPS;
    const invalidStorage = storageDaysProvided != null &&
      (typeof storageDaysProvided !== "number" || !Number.isInteger(storageDaysProvided) || storageDaysProvided < 1 || storageDaysProvided > 365);
    const invalidBitrate = bitrateProvided != null &&
      (typeof bitrateProvided !== "number" || !Number.isFinite(bitrateProvided) || bitrateProvided <= 0 || bitrateProvided > 100);
    if (invalidStorage) warnings.push("Storage duration must be an integer from 1 to 365 days.");
    if (invalidBitrate) warnings.push("Per-camera bitrate must be greater than 0 and no more than 100 Mbps.");
    const includeInstallation = rawInputs.includeInstallation === true;
    const cableProvided = rawInputs.cableMetersPerCamera;
    const cableMetersPerCamera = typeof cableProvided === "number" && Number.isFinite(cableProvided) && cableProvided > 0 && cableProvided <= 500
      ? cableProvided
      : CctvSystemTemplate.DEFAULT_CABLE_METERS_PER_CAMERA;
    const invalidCable = cableProvided != null &&
      (typeof cableProvided !== "number" || !Number.isFinite(cableProvided) || cableProvided <= 0 || cableProvided > 500);
    if (invalidCable) warnings.push("Cable allowance per camera must be greater than 0 and no more than 500 meters.");
    if (!projectContextProvided) warnings.push("Default assumption: project context is unspecified.");
    if (storageDaysProvided == null) warnings.push("Default assumption: 30 days recording retention.");
    if (bitrateProvided == null) warnings.push("Default assumption: 8 Mbps bitrate per camera for capacity planning.");
    if (cableProvided == null) warnings.push("Default assumption: 30 meters of cable per camera.");

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
        provenance: projectContextProvided ? "USER_PROVIDED" : "SUGGESTED",
        isDefault: !projectContextProvided,
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
      {
        name: "cableMetersPerCamera",
        labelAr: "بدل الكابل لكل كاميرا",
        labelEn: "Cable Allowance per Camera",
        value: cableMetersPerCamera,
        unit: "m",
        provenance: cableProvided == null ? "SUGGESTED" : "USER_PROVIDED",
        isDefault: cableProvided == null,
      },
      {
        name: "bitrateMbps",
        labelAr: "معدل البث لكل كاميرا",
        labelEn: "Per-camera Bitrate",
        value: bitrateMbps,
        unit: "Mbps",
        provenance: bitrateProvided == null ? "SUGGESTED" : "USER_PROVIDED",
        isDefault: bitrateProvided == null,
      },
      {
        name: "includeInstallation",
        labelAr: "يشمل التركيب",
        labelEn: "Include Installation",
        value: includeInstallation,
        provenance: rawInputs.includeInstallation == null ? "SUGGESTED" : "USER_PROVIDED",
        isDefault: rawInputs.includeInstallation == null,
      },
    ];

    const invalidInputs = [
      ...(cameraCountProvided !== null && cameraCount === null ? ["cameraCount"] : []),
      ...(invalidStorage ? ["storageDays"] : []),
      ...(invalidBitrate ? ["bitrateMbps"] : []),
      ...(invalidCable ? ["cableMetersPerCamera"] : []),
    ];
    if (missingInputs.length > 0 || invalidInputs.length > 0) {
      return {
        systemType: this.systemType,
        systemNameAr: this.displayNameAr,
        systemNameEn: this.displayNameEn,
        templateVersion: this.templateVersion,
        status: invalidInputs.length > 0 ? "INVALID_INPUT" : "NEEDS_CONFIRMATION",
        inputs,
        missingInputs: [...missingInputs, ...invalidInputs],
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

    // Decimal TB = cameras * Mbps * seconds/day * days / 8 bits/byte / 1e6 MB/TB.
    const estimatedTbRequired = Math.ceil(count * bitrateMbps * 86_400 * storageDays / 8 / 1_000_000);

    // PoE Switch sizing (8, 16, 24, 48 ports)
    let poePorts = 8;
    if (count > 24) poePorts = 48;
    else if (count > 12) poePorts = 24;
    else if (count > 6) poePorts = 16;

    const poeSwitchCount = Math.ceil(count / (poePorts - 2)); // keep uplink ports free

    // Cabling allowance
    const totalCableMeters = count * cableMetersPerCamera;
    const cableBoxes = Math.max(1, Math.ceil(totalCableMeters / 305)); // 305m per Cat6 box

    const components: SystemComponent[] = [
      {
        componentKey: "CCTV_CAMERAS",
        name: `كاميرات مراقبة شبكية IP (${projectContext})`,
        nameAr: `كاميرات مراقبة شبكية IP (${projectContext})`,
        nameEn: `IP CCTV Surveillance Cameras (${projectContext})`,
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
        quantity: Math.ceil(count / nvrChannels),
        unit: "Unit",
        provenance: "CALCULATED",
        formulaExplanation: `${Math.ceil(count / nvrChannels)} NVR(s), ${nvrChannels} channels each for ${count} cameras. Preliminary capacity only; bandwidth, disk bays and site layout require engineering review.`,
        category: "HARDWARE",
      },
      {
        componentKey: "SURVEILLANCE_STORAGE_CAPACITY",
        name: `سعة تخزين مراقبة مطلوبة (${storageDays} يوم)`,
        nameAr: `سعة تخزين مراقبة مطلوبة (${storageDays} يوم)`,
        nameEn: `Required Surveillance Storage Capacity (${storageDays} days retention)`,
        itemType: "PRODUCT",
        quantity: estimatedTbRequired,
        unit: "TB",
        provenance: "CALCULATED",
        formulaExplanation: `Required capacity only; Math.ceil(${count} cameras * ${bitrateMbps} Mbps * 86400 seconds/day * ${storageDays} days / 8 / 1000000) = ${estimatedTbRequired} TB. Drive count/model requires human design confirmation.`,
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
        formulaExplanation: `Math.ceil(${count} cameras / (${poePorts} ports - 2 reserved uplink ports)) = ${poeSwitchCount} switch(es). Assumes one port per camera; PoE power budget and network topology require review.`,
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
        formulaExplanation: "Estimated allowance: 1 shared wall-mount cabinet at a single collection point. Rack units, recorder/switch dimensions, ventilation and distributed cabinet locations are not sized; confirm after site/layout review.",
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
        formulaExplanation: `Math.ceil(${count} cameras * ${cableMetersPerCamera}m / 305m roll) = ${cableBoxes} roll(s)`,
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
      ...(includeInstallation ? [{
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
      } as SystemComponent] : []),
    ];

    return {
      systemType: this.systemType,
      templateVersion: this.templateVersion,
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
