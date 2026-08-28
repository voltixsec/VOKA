import type {
  ISystemTemplate,
  SystemCalculationResult,
  SystemInputParameter,
  SystemComponent,
  ProvenanceType,
} from "./types";
import { resolveEngineeringRules, type ResolveEngineeringRulesInput } from "./EngineeringRuleResolver";

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

  public constructor(private readonly ruleContext: ResolveEngineeringRulesInput = {}) {}

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
    const rules = resolveEngineeringRules({ ...this.ruleContext,
      jurisdiction: typeof rawInputs.jurisdiction === "string" ? rawInputs.jurisdiction : this.ruleContext.jurisdiction,
      userOverrides: {
      ...this.ruleContext.userOverrides,
      ...(typeof storageDaysProvided === "number" && storageDaysProvided > 0 ? { retentionDays: storageDaysProvided } : {}),
      ...(typeof rawInputs.bitrateMbps === "number" ? { bitrateMbps: rawInputs.bitrateMbps } : {}),
      ...(typeof rawInputs.cableMetersPerCamera === "number" ? { cableMetersPerCamera: rawInputs.cableMetersPerCamera } : {}),
    } });
    const storageDays =
      typeof storageDaysProvided === "number" && storageDaysProvided > 0
        ? storageDaysProvided
        : rules.snapshot.values.retentionDays;
    const storageProvenance: ProvenanceType =
      typeof storageDaysProvided === "number" && storageDaysProvided > 0
        ? "USER_PROVIDED"
        : "SUGGESTED";
    const bitrateProvided = rawInputs.bitrateMbps;
    const bitrateMbps = typeof bitrateProvided === "number" && Number.isFinite(bitrateProvided) && bitrateProvided > 0 && bitrateProvided <= 100
      ? bitrateProvided
      : rules.snapshot.values.bitrateMbps;
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
      : rules.snapshot.values.cableMetersPerCamera;
    const invalidCable = cableProvided != null &&
      (typeof cableProvided !== "number" || !Number.isFinite(cableProvided) || cableProvided <= 0 || cableProvided > 500);
    if (invalidCable) warnings.push("Cable allowance per camera must be greater than 0 and no more than 500 meters.");
    if (!projectContextProvided) warnings.push("Default assumption: project context is unspecified.");
    if (storageDaysProvided == null) warnings.push(`Resolved profile assumption: ${storageDays} days recording retention.`);
    if (bitrateProvided == null) warnings.push(`Resolved profile assumption: ${bitrateMbps} Mbps bitrate per camera for capacity planning.`);
    if (cableProvided == null) warnings.push(`Resolved profile assumption: ${cableMetersPerCamera} meters of cable per camera.`);

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
    const baseTbRequired = count * bitrateMbps * 86_400 * storageDays / 8 / 1_000_000;
    const estimatedTbRequired = Math.ceil(baseTbRequired * (1 + rules.snapshot.values.storageReservePercent / 100));

    // PoE Switch sizing (8, 16, 24, 48 ports)
    let poePorts = 8;
    if (count > 24) poePorts = 48;
    else if (count > 12) poePorts = 24;
    else if (count > 6) poePorts = 16;

    const poeSwitchCount = Math.ceil(count / (poePorts - rules.snapshot.values.poeReservedPorts));

    // Cabling allowance
    const totalCableMeters = count * cableMetersPerCamera;
    const cableBoxes = Math.max(1, Math.ceil(totalCableMeters / rules.snapshot.values.cableRollMeters));

    const components: SystemComponent[] = [
      {
        componentKey: "CCTV_CAMERAS",
        specification: { cameraCount: count, technology: "IP" },
        name: `كاميرات مراقبة شبكية IP (${projectContext})`,
        nameAr: "كاميرات مراقبة شبكية IP",
        nameEn: "IP CCTV Surveillance Cameras",
        itemType: "PRODUCT",
        quantity: count,
        unit: "Unit",
        provenance: "USER_PROVIDED",
        formulaExplanation: `Requested quantity: ${count} camera(s)`,
        formulaExplanationAr: `الكمية المطلوبة: ${count} كاميرا`,
        category: "HARDWARE",
      },
      {
        componentKey: "NVR_RECORDER",
        specification: { requiredChannels: count, channelsPerRecorder: nvrChannels, utilizationPercent: rules.snapshot.values.nvrUtilizationPercent },
        name: `جهاز تسجيل شبكي NVR (${nvrChannels} قناة)`,
        nameAr: `جهاز تسجيل شبكي NVR (${nvrChannels} قناة)`,
        nameEn: `Network Video Recorder NVR (${nvrChannels} Channels)`,
        itemType: "PRODUCT",
        quantity: Math.ceil(count / (nvrChannels * rules.snapshot.values.nvrUtilizationPercent / 100)),
        unit: "Unit",
        provenance: "CALCULATED",
        formulaExplanation: `${Math.ceil(count / (nvrChannels * rules.snapshot.values.nvrUtilizationPercent / 100))} NVR(s), ${nvrChannels} channels each at ${rules.snapshot.values.nvrUtilizationPercent}% maximum utilization for ${count} cameras. Preliminary capacity only; bandwidth, disk bays and site layout require engineering review.`,
        formulaExplanationAr: `${Math.ceil(count / (nvrChannels * rules.snapshot.values.nvrUtilizationPercent / 100))} جهاز NVR بسعة ${nvrChannels} قناة لكل جهاز وبحد استخدام ${rules.snapshot.values.nvrUtilizationPercent}% لخدمة ${count} كاميرا. سعة مبدئية فقط؛ يلزم مراجعة معدل نقل البيانات وفتحات الأقراص وتوزيع الموقع هندسياً.`,
        category: "HARDWARE",
      },
      {
        componentKey: "SURVEILLANCE_STORAGE_CAPACITY",
        specification: { requiredUsableTb: estimatedTbRequired, storageDays, bitrateMbps, codec: rules.snapshot.values.codec, resolutionMp: rules.snapshot.values.resolutionMp, fps: rules.snapshot.values.fps, storageReservePercent: rules.snapshot.values.storageReservePercent, allocation: "RAID/bays not verified" },
        name: `سعة تخزين مراقبة مطلوبة (${storageDays} يوم)`,
        nameAr: `سعة تخزين مراقبة مطلوبة (${storageDays} يوم)`,
        nameEn: `Required Surveillance Storage Capacity (${storageDays} days retention)`,
        itemType: "PRODUCT",
        quantity: estimatedTbRequired,
        unit: "TB",
        provenance: "CALCULATED",
        formulaExplanation: `Required capacity only; Math.ceil(${count} cameras * ${bitrateMbps} Mbps * 86400 seconds/day * ${storageDays} days / 8 / 1000000) = ${estimatedTbRequired} TB. Drive count/model requires human design confirmation.`,
        formulaExplanationAr: `السعة المطلوبة فقط؛ تقريب لأعلى (${count} كاميرا × ${bitrateMbps} ميجابت/ثانية × 86400 ثانية/يوم × ${storageDays} يوم ÷ 8 ÷ 1000000) = ${estimatedTbRequired} تيرابايت. عدد الأقراص وطرازها يحتاجان تأكيد التصميم بشرياً.`,
        category: "HARDWARE",
      },
      {
        componentKey: "POE_SWITCH",
        specification: { requiredPorts: count, portsPerSwitch: poePorts, reservedPorts: rules.snapshot.values.poeReservedPorts },
        name: `موزع شبكة PoE Switch (${poePorts} منفذ)`,
        nameAr: `موزع شبكة PoE (${poePorts} منفذ)`,
        nameEn: `PoE Network Switch (${poePorts} Ports)`,
        itemType: "PRODUCT",
        quantity: poeSwitchCount,
        unit: "Unit",
        provenance: "CALCULATED",
        formulaExplanation: `Math.ceil(${count} cameras / (${poePorts} ports - ${rules.snapshot.values.poeReservedPorts} reserved uplink ports)) = ${poeSwitchCount} switch(es). Assumes one port per camera; PoE power budget and network topology require review.`,
        formulaExplanationAr: `تقريب لأعلى (${count} كاميرا ÷ (${poePorts} منفذ − ${rules.snapshot.values.poeReservedPorts} منفذ ربط محجوز)) = ${poeSwitchCount} موزع. بافتراض منفذ لكل كاميرا؛ يلزم مراجعة ميزانية طاقة PoE وتصميم الشبكة.`,
        category: "NETWORKING",
      },
      {
        componentKey: "RACK_CABINET",
        name: "كابينة تجميع الشبكة والتسجيل Wall Mount Cabinet",
        nameAr: "كابينة حائط لتجميع الشبكة والتسجيل",
        nameEn: "Wall Mount Server & NVR Cabinet",
        itemType: "PRODUCT",
        quantity: rules.snapshot.values.rackAllowance,
        unit: "Unit",
        provenance: "SUGGESTED",
        formulaExplanation: rules.snapshot.values.rackAllowance === 1
          ? "Estimated allowance: 1 shared wall-mount cabinet at a single collection point. Rack units, recorder/switch dimensions, ventilation and distributed cabinet locations are not sized; confirm after site/layout review."
          : `Resolved profile allowance: ${rules.snapshot.values.rackAllowance} wall-mount cabinets. Rack units, recorder/switch dimensions, ventilation and locations are not sized; confirm after site/layout review.`,
        formulaExplanationAr: rules.snapshot.values.rackAllowance === 1
          ? "تقدير مبدئي: كابينة حائط مشتركة واحدة (1) في نقطة تجميع واحدة. لم يتم تحديد وحدات الرف أو أبعاد أجهزة التسجيل والموزعات أو التهوية أو مواقع الكبائن الموزعة؛ أكدها بعد مراجعة الموقع والمخطط."
          : `بدل الملف الهندسي المحسوم: ${rules.snapshot.values.rackAllowance} كابينة حائط. لم يتم تحديد وحدات الرف أو أبعاد أجهزة التسجيل والموزعات أو التهوية أو المواقع؛ أكدها بعد مراجعة الموقع والمخطط.`,
        category: "INFRASTRUCTURE",
      },
      {
        componentKey: "CAT6_CABLING",
        specification: { requiredCableMeters: totalCableMeters, metersPerRoll: rules.snapshot.values.cableRollMeters },
        name: `كابلات شبكة Cat6 المخصصة للمراقبة (بكرات ${rules.snapshot.values.cableRollMeters} متر)`,
        nameAr: `كابلات شبكة Cat6 المخصصة للمراقبة (بكرات ${rules.snapshot.values.cableRollMeters} متر)`,
        nameEn: `Cat6 Ethernet Cable Rolls (${rules.snapshot.values.cableRollMeters}m per roll)`,
        itemType: "PRODUCT",
        quantity: cableBoxes,
        unit: "Roll",
        provenance: "CALCULATED",
        formulaExplanation: `Math.ceil(${count} cameras * ${cableMetersPerCamera}m / ${rules.snapshot.values.cableRollMeters}m roll) = ${cableBoxes} roll(s)`,
        formulaExplanationAr: `تقريب لأعلى (${count} كاميرا × ${cableMetersPerCamera} متر ÷ ${rules.snapshot.values.cableRollMeters} متر/بكرة) = ${cableBoxes} بكرة`,
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
        formulaExplanationAr: `طقم واحد (1) من الوصلات وعلب التجميع لكل كاميرا (${count} طقم)`,
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
        formulaExplanationAr: `خدمة تركيب واختبار متكاملة لعدد ${count} نقطة كاميرا`,
        category: "SERVICES",
      } as SystemComponent] : []),
    ];

    return {
      systemType: this.systemType,
      templateVersion: this.templateVersion,
      systemNameAr: this.displayNameAr,
      systemNameEn: this.displayNameEn,
      status: rules.conflict ? "RULE_CONFLICT" : "COMPLETE",
      inputs,
      missingInputs: [],
      warnings,
      components,
      engineeringRules: rules.snapshot,
      ruleConflict: rules.conflict,
    };
  }
}
