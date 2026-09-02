import type {
  ISystemTemplate,
  SystemCalculationResult,
  SystemInputParameter,
  SystemComponent,
  ProvenanceType,
} from "./types";
import { resolveEngineeringRules, type ResolveEngineeringRulesInput } from "./EngineeringRuleResolver";
import { resolveCommercialPackaging } from "./CommercialPackagingResolver";

export interface CctvInputs {
  cameraCount?: number | null;
  projectContext?: string | null; // e.g., "villa", "commercial", "warehouse"
  storageDays?: number | null;
  includeCableAllowance?: boolean | null;
  includeInstallation?: boolean | null;
  bitrateMbps?: number | null;
  cableMetersPerCamera?: number | null;
  resolutionMp?: number | null;
  selectedRecorderCapabilities?: {
    channels?: number | null;
    diskBays?: number | null;
    maxHddCapacityTb?: number | null;
    supportedCodec?: "H.264" | "H.265" | null;
    incomingBandwidthMbps?: number | null;
    raidSupported?: boolean | null;
  } | null;
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
      ...(typeof rawInputs.resolutionMp === "number" ? { resolutionMp: rawInputs.resolutionMp } : {}),
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
        name: "resolutionMp",
        labelAr: "دقة الكاميرا",
        labelEn: "Camera Resolution",
        value: rules.snapshot.values.resolutionMp,
        unit: "MP",
        provenance: typeof rawInputs.resolutionMp === "number" ? "USER_PROVIDED" : "SUGGESTED",
        isDefault: typeof rawInputs.resolutionMp !== "number",
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

    const recorder = rawInputs.selectedRecorderCapabilities && typeof rawInputs.selectedRecorderCapabilities === "object" ? rawInputs.selectedRecorderCapabilities as NonNullable<CctvInputs["selectedRecorderCapabilities"]> : null;

    // NVR Dimensioning (4, 8, 16, 32, 64 channels), replaced by approved capability facts when present.
    let nvrChannels = 4;
    if (count > 32) nvrChannels = 64;
    else if (count > 16) nvrChannels = 32;
    else if (count > 8) nvrChannels = 16;
    else if (count > 4) nvrChannels = 8;
    if (recorder?.channels && Number.isInteger(recorder.channels) && recorder.channels > 0) nvrChannels = recorder.channels;

    // Decimal TB = cameras * Mbps * seconds/day * days / 8 bits/byte / 1e6 MB/TB.
    const baseTbRequired = count * bitrateMbps * 86_400 * storageDays / 8 / 1_000_000;
    const estimatedTbRequired = Math.ceil(baseTbRequired * (1 + rules.snapshot.values.storageReservePercent / 100));
    const storageDriveCapacityTb = recorder?.maxHddCapacityTb && recorder.maxHddCapacityTb > 0 ? recorder.maxHddCapacityTb : rules.snapshot.values.storageDriveCapacityTb ?? 18;
    const storageStatus = storageDaysProvided != null && bitrateProvided != null && typeof rawInputs.resolutionMp === "number"
      ? "EXACT" as const
      : "ESTIMATED" as const;
    const storageAssumptions = [
      ...(storageDaysProvided == null ? [`${storageDays} days retention from the resolved engineering profile`] : []),
      ...(bitrateProvided == null ? [`${bitrateMbps} Mbps per-camera planning bitrate`] : []),
      ...(typeof rawInputs.resolutionMp !== "number" ? [`${rules.snapshot.values.resolutionMp} MP planning resolution`] : []),
      recorder?.maxHddCapacityTb ? `${storageDriveCapacityTb} TB maximum supported HDD capacity from the approved recorder` : `${storageDriveCapacityTb} TB governed generic surveillance-drive packaging`,
    ];
    const storagePackaging = resolveCommercialPackaging({
      requiredQuantity: estimatedTbRequired,
      requiredUnit: "TB",
      packageQuantity: storageDriveCapacityTb,
      packageUnit: "drive",
      status: storageStatus,
      assumptions: storageAssumptions,
    });
    const channelRecorderCount = Math.ceil(count / (nvrChannels * rules.snapshot.values.nvrUtilizationPercent / 100));
    const bandwidthRecorderCount = recorder?.incomingBandwidthMbps && recorder.incomingBandwidthMbps > 0 ? Math.ceil(count * bitrateMbps / recorder.incomingBandwidthMbps) : 1;
    const storageRecorderCount = recorder?.diskBays && recorder.diskBays > 0 ? Math.ceil(storagePackaging.commercialQuantity / recorder.diskBays) : 1;
    const recorderCount = Math.max(channelRecorderCount, bandwidthRecorderCount, storageRecorderCount);
    const recorderCapabilitiesComplete = Boolean(recorder?.channels && recorder.diskBays && recorder.maxHddCapacityTb && recorder.incomingBandwidthMbps && recorder.supportedCodec);
    const compatibilityConflicts = [
      ...(recorder?.supportedCodec && recorder.supportedCodec !== rules.snapshot.values.codec ? [{ code: "RECORDER_CODEC_INCOMPATIBLE", message: `Approved recorder supports ${recorder.supportedCodec}, while the resolved calculation requires ${rules.snapshot.values.codec}.` }] : []),
      ...(recorder && recorder.diskBays === 0 ? [{ code: "RECORDER_STORAGE_INCOMPATIBLE", message: "Approved recorder has no verified disk bays for the required storage design." }] : []),
    ];

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
        specification: { cameraCount: count, technology: "IP", resolutionMp: rules.snapshot.values.resolutionMp },
        name: `كاميرات مراقبة شبكية IP بدقة ${rules.snapshot.values.resolutionMp}MP (${projectContext})`,
        nameAr: `كاميرات مراقبة شبكية IP بدقة ${rules.snapshot.values.resolutionMp}MP`,
        nameEn: `${rules.snapshot.values.resolutionMp}MP IP CCTV Surveillance Cameras`,
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
        specification: { requiredChannels: count, channelsPerRecorder: nvrChannels, utilizationPercent: rules.snapshot.values.nvrUtilizationPercent, recorderCount, diskBaysPerRecorder: recorder?.diskBays ?? "not verified", incomingBandwidthMbps: recorder?.incomingBandwidthMbps ?? "not verified" },
        name: `جهاز تسجيل شبكي NVR (${nvrChannels} قناة)`,
        nameAr: `جهاز تسجيل شبكي NVR (${nvrChannels} قناة)`,
        nameEn: `Network Video Recorder NVR (${nvrChannels} Channels)`,
        itemType: "PRODUCT",
        quantity: recorderCount,
        unit: "Unit",
        provenance: "CALCULATED",
        formulaExplanation: `${recorderCount} NVR(s): max(channel requirement ${channelRecorderCount}, bandwidth requirement ${bandwidthRecorderCount}, storage-bay requirement ${storageRecorderCount}). ${recorder ? "Approved recorder capabilities applied." : "Preliminary capacity; bandwidth and disk bays remain unverified."}`,
        formulaExplanationAr: `${recorderCount} جهاز NVR: الحد الأعلى بين متطلبات القنوات (${channelRecorderCount}) وعرض النطاق (${bandwidthRecorderCount}) وفتحات الأقراص (${storageRecorderCount}). ${recorder ? "تم تطبيق قدرات جهاز التسجيل المعتمد." : "سعة مبدئية؛ عرض النطاق وفتحات الأقراص غير موثقة بعد."}`,
        category: "HARDWARE",
        quantityStatus: recorderCapabilitiesComplete ? "EXACT" : "ESTIMATED",
        calculationInputs: { cameraCount: count, channelsPerRecorder: nvrChannels, channelRecorderCount, bandwidthRecorderCount, storageRecorderCount },
        assumptions: recorderCapabilitiesComplete ? [] : ["One or more recorder channel, bandwidth, codec, disk-bay, or HDD-capacity capabilities remain unverified."],
      },
      {
        componentKey: "SURVEILLANCE_HDD",
        specification: { requiredUsableTb: estimatedTbRequired, driveCapacityTb: storageDriveCapacityTb, storageDays, bitrateMbps, codec: rules.snapshot.values.codec, resolutionMp: rules.snapshot.values.resolutionMp, fps: rules.snapshot.values.fps, storageReservePercent: rules.snapshot.values.storageReservePercent, recorderCount, diskBaysPerRecorder: recorder?.diskBays ?? "not verified", allocation: recorder?.diskBays ? "Fits governed recorder bay count" : "RAID/bays not verified" },
        name: `قرص تخزين مخصص للمراقبة ${storageDriveCapacityTb}TB`,
        nameAr: `قرص صلب مخصص لأنظمة المراقبة بسعة ${storageDriveCapacityTb} تيرابايت`,
        nameEn: `${storageDriveCapacityTb}TB Surveillance Hard Disk Drive`,
        itemType: "PRODUCT",
        quantity: storagePackaging.commercialQuantity,
        unit: "Unit",
        provenance: "CALCULATED",
        formulaExplanation: `${estimatedTbRequired} TB required; Math.ceil(${estimatedTbRequired} TB / ${storageDriveCapacityTb} TB per drive) = ${storagePackaging.commercialQuantity} drive(s). RAID, recorder bay compatibility and final product remain subject to governed selection.`,
        formulaExplanationAr: `السعة المطلوبة ${estimatedTbRequired} تيرابايت؛ تقريب لأعلى (${estimatedTbRequired} ÷ ${storageDriveCapacityTb} تيرابايت لكل قرص) = ${storagePackaging.commercialQuantity} قرص. يلزم اعتماد توافق مصفوفة الأقراص وفتحات جهاز التسجيل والمنتج النهائي.`,
        category: "HARDWARE",
        quantityStatus: storageStatus,
        calculationInputs: { cameraCount: count, bitrateMbps, storageDays, requiredUsableTb: estimatedTbRequired, driveCapacityTb: storageDriveCapacityTb },
        assumptions: storageAssumptions,
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
        quantityStatus: "ESTIMATED",
        assumptions: ["PoE power budget and final network topology require review."],
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
        quantityStatus: cableProvided == null ? "ESTIMATED" : "EXACT",
        calculationInputs: { cameraCount: count, cableMetersPerCamera, cableRollMeters: rules.snapshot.values.cableRollMeters },
        assumptions: cableProvided == null ? [`${cableMetersPerCamera} m cable allowance per camera`] : [],
      },
      {
        componentKey: "CONNECTORS_AND_ACCESSORIES",
        name: "بدل عام لوصلات RJ45 وعلب التجميع المقاومة للعوامل الجوية",
        nameAr: "بدل عام لوصلات RJ45 وعلب التجميع المقاومة للعوامل الجوية",
        nameEn: "Generic RJ45 Connector & Weatherproof Junction Box Allowance",
        itemType: "PRODUCT",
        quantity: count,
        unit: "Set",
        provenance: "CALCULATED",
        formulaExplanation: `Estimated commercial allowance for ${count} camera points; split into catalog connector and junction-box products before final issue.`,
        formulaExplanationAr: `بدل تجاري تقديري لعدد ${count} نقطة كاميرا؛ يجب فصله إلى منتجات وصلات وعلب تجميع من الكتالوج قبل الإصدار النهائي.`,
        category: "ACCESSORIES",
        quantityStatus: "ESTIMATED",
        assumptions: ["Generic grouped allowance only; no company or catalog package has been selected."],
      },
      ...(includeInstallation ? [{
        componentKey: "INSTALLATION_COMMISSIONING",
        name: "خدمات التركيب والتمديد والبرمجة والاختبار والتشغيل",
        nameAr: "خدمات التركيب والتمديد والبرمجة والاختبار والتشغيل",
        nameEn: "Installation, Cabling, Configuration, Testing & Commissioning Services",
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
      status: rules.conflict || compatibilityConflicts.length ? "RULE_CONFLICT" : "COMPLETE",
      inputs,
      missingInputs: [],
      warnings,
      components,
      engineeringRules: rules.snapshot,
      ruleConflict: rules.conflict,
      compatibilityConflicts,
    };
  }
}
