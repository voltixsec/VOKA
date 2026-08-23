import type {
  ISystemTemplate,
  SystemCalculationResult,
  SystemInputParameter,
  SystemComponent,
  ProvenanceType,
} from "./types";

export interface GypsumBoardInputs {
  areaM2?: number | null;
  layersCount?: number | null;
  boardWidthM?: number | null;
  boardLengthM?: number | null;
  studSpacingCm?: number | null;
  wastePercentage?: number | null;
  includeInsulation?: boolean | null;
  includeInstallation?: boolean | null;
}

export class GypsumBoardSystemTemplate implements ISystemTemplate {
  public readonly systemType = "GYPSUM_BOARD";
  public readonly templateVersion = "1.1.0";
  public readonly displayNameAr = "نظام أسقف وواجهات الجبس بورد";
  public readonly displayNameEn = "Gypsum Board Ceiling & Facade System";

  // Explicit, configurable domain default assumptions
  public static readonly DEFAULT_BOARD_WIDTH_M = 1.2;
  public static readonly DEFAULT_BOARD_LENGTH_M = 2.4;
  public static readonly DEFAULT_STUD_SPACING_CM = 60;
  public static readonly DEFAULT_WASTE_PERCENTAGE = 5;
  public static readonly DEFAULT_LAYERS_COUNT = 1;

  public calculate(rawInputs: Record<string, any>): SystemCalculationResult {
    const warnings: string[] = [];
    const missingInputs: string[] = [];

    const areaInput = rawInputs.areaM2 ?? rawInputs.area ?? null;
    const area = typeof areaInput === "number" && Number.isFinite(areaInput) ? areaInput : null;
    const invalidInputs: string[] = [];

    if (areaInput === null) {
      missingInputs.push("areaM2");
    } else if (area === null || area <= 0 || area > 1_000_000) {
      invalidInputs.push("areaM2");
      warnings.push("Area must be a finite number greater than 0 and no more than 1,000,000 m².");
    }

    const layersCountProvided = rawInputs.layersCount ?? rawInputs.layers;
    if (layersCountProvided !== undefined && layersCountProvided !== null &&
        (typeof layersCountProvided !== "number" || !Number.isInteger(layersCountProvided) || layersCountProvided < 1 || layersCountProvided > 10)) {
      invalidInputs.push("layersCount");
      warnings.push("Layers count must be an integer from 1 to 10.");
    }
    const layersCount =
      typeof layersCountProvided === "number" && Number.isInteger(layersCountProvided) && layersCountProvided > 0
        ? layersCountProvided
        : GypsumBoardSystemTemplate.DEFAULT_LAYERS_COUNT;
    const layersProvenance: ProvenanceType =
      typeof layersCountProvided === "number" && layersCountProvided > 0
        ? "USER_PROVIDED"
        : "SUGGESTED";

    const wasteProvided = rawInputs.wastePercentage ?? rawInputs.wastage;
    if (wasteProvided !== undefined && wasteProvided !== null &&
        (typeof wasteProvided !== "number" || !Number.isFinite(wasteProvided) || wasteProvided < 0 || wasteProvided > 100)) {
      invalidInputs.push("wastePercentage");
      warnings.push("Wastage percentage must be between 0 and 100.");
    }
    const wastePercentage =
      typeof wasteProvided === "number" && Number.isFinite(wasteProvided) && wasteProvided >= 0 && wasteProvided <= 100
        ? wasteProvided
        : GypsumBoardSystemTemplate.DEFAULT_WASTE_PERCENTAGE;
    const wasteProvenance: ProvenanceType =
      typeof wasteProvided === "number" && wasteProvided >= 0
        ? "USER_PROVIDED"
        : "SUGGESTED";

    for (const [name, value] of [["boardWidthM", rawInputs.boardWidthM], ["boardLengthM", rawInputs.boardLengthM], ["studSpacingCm", rawInputs.studSpacingCm]] as const) {
      if (value !== undefined && value !== null &&
          (typeof value !== "number" || !Number.isFinite(value) || value <= 0)) {
        invalidInputs.push(name);
        warnings.push(`${name} must be a finite number greater than 0.`);
      }
    }
    const boardWidth =
      typeof rawInputs.boardWidthM === "number" && rawInputs.boardWidthM > 0
        ? rawInputs.boardWidthM
        : GypsumBoardSystemTemplate.DEFAULT_BOARD_WIDTH_M;

    const boardLength =
      typeof rawInputs.boardLengthM === "number" && rawInputs.boardLengthM > 0
        ? rawInputs.boardLengthM
        : GypsumBoardSystemTemplate.DEFAULT_BOARD_LENGTH_M;

    const studSpacingCm =
      typeof rawInputs.studSpacingCm === "number" && rawInputs.studSpacingCm > 0
        ? rawInputs.studSpacingCm
        : GypsumBoardSystemTemplate.DEFAULT_STUD_SPACING_CM;

    const includeInsulation = rawInputs.includeInsulation === true;
    const includeInstallation = rawInputs.includeInstallation === true;
    if (layersCountProvided == null) warnings.push("Default assumption: 1 gypsum-board layer.");
    if (wasteProvided == null) warnings.push("Default assumption: 5% material wastage.");
    if (rawInputs.boardWidthM == null || rawInputs.boardLengthM == null) warnings.push("Default assumption: 1.2m x 2.4m board dimensions.");
    if (rawInputs.studSpacingCm == null) warnings.push("Default assumption: 60cm stud spacing.");

    const inputs: SystemInputParameter[] = [
      {
        name: "areaM2",
        labelAr: "المساحة (م²)",
        labelEn: "Area (m²)",
        value: area,
        unit: "m²",
        provenance: areaInput !== null ? "USER_PROVIDED" : "SUGGESTED",
      },
      {
        name: "layersCount",
        labelAr: "عدد الطبقات",
        labelEn: "Number of Layers",
        value: layersCount,
        provenance: layersProvenance,
        isDefault: layersProvenance === "SUGGESTED",
      },
      {
        name: "wastePercentage",
        labelAr: "نسبة الهالك (%)",
        labelEn: "Wastage Percentage (%)",
        value: wastePercentage,
        unit: "%",
        provenance: wasteProvenance,
        isDefault: wasteProvenance === "SUGGESTED",
      },
      {
        name: "boardWidthM",
        labelAr: "عرض اللوح (متر)",
        labelEn: "Board Width (m)",
        value: boardWidth,
        unit: "m",
        provenance: rawInputs.boardWidthM == null ? "SUGGESTED" : "USER_PROVIDED",
        isDefault: rawInputs.boardWidthM == null,
      },
      {
        name: "boardLengthM",
        labelAr: "طول اللوح (متر)",
        labelEn: "Board Length (m)",
        value: boardLength,
        unit: "m",
        provenance: rawInputs.boardLengthM == null ? "SUGGESTED" : "USER_PROVIDED",
        isDefault: rawInputs.boardLengthM == null,
      },
      {
        name: "studSpacingCm",
        labelAr: "مسافة القوائم (سم)",
        labelEn: "Stud Spacing (cm)",
        value: studSpacingCm,
        unit: "cm",
        provenance: rawInputs.studSpacingCm == null ? "SUGGESTED" : "USER_PROVIDED",
        isDefault: rawInputs.studSpacingCm == null,
      },
      {
        name: "includeInsulation",
        labelAr: "يشمل العزل",
        labelEn: "Include Insulation",
        value: includeInsulation,
        provenance: rawInputs.includeInsulation == null ? "SUGGESTED" : "USER_PROVIDED",
        isDefault: rawInputs.includeInsulation == null,
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

    if (invalidInputs.length > 0 || missingInputs.length > 0) {
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
          "Area in m² is required to derive gypsum board components accurately.",
        ],
        components: [],
      };
    }

    const effectiveArea = area!;
    const boardAreaM2 = boardWidth * boardLength; // e.g. 2.88 m²
    const wasteMultiplier = 1 + wastePercentage / 100;

    // 1. Gypsum Board Sheets
    const netBoardSheets = (effectiveArea / boardAreaM2) * layersCount;
    const grossBoardSheets = Math.ceil(netBoardSheets * wasteMultiplier);

    // 2. Studs (C-Studs): approx 2.2 linear meters per m² or studSpacing formula
    const studSpacingM = studSpacingCm / 100;
    const linearStudsPerM2 = 1 / studSpacingM + 0.3; // e.g. 1.66 + 0.3 = 1.96 m/m²
    const totalStudMeters = Math.ceil(effectiveArea * linearStudsPerM2 * wasteMultiplier);

    // 3. Tracks (U-Runner Tracks): perimeter + framing allowance approx 0.85 meters per m²
    const totalTrackMeters = Math.ceil(effectiveArea * 0.85 * wasteMultiplier);

    // 4. Screws (Drywall Screws): approx 18 screws per m² per layer
    const totalScrews = Math.ceil(effectiveArea * 18 * layersCount * wasteMultiplier);

    // 5. Joint Tape (Fiber Tape / Paper Tape): approx 1.6 meters per m²
    const totalTapeMeters = Math.ceil(effectiveArea * 1.6 * wasteMultiplier);

    // 6. Joint Compound / Putty: approx 1.2 kg per m²
    const totalCompoundKg = Math.ceil(effectiveArea * 1.2 * layersCount * wasteMultiplier);

    // 7. Wall Plugs & Concrete Anchors: approx 3 pairs per m²
    const totalAnchors = Math.ceil(effectiveArea * 3 * wasteMultiplier);

    const components: SystemComponent[] = [
      {
        componentKey: "GYPSUM_BOARDS",
        name: `ألواح جبس بورد (${boardWidth}×${boardLength} م)`,
        nameAr: `ألواح جبس بورد (${boardWidth}×${boardLength} م)`,
        nameEn: `Gypsum Board Sheets (${boardWidth}x${boardLength} m)`,
        itemType: "PRODUCT",
        quantity: grossBoardSheets,
        unit: "Sheet",
        provenance: "CALCULATED",
        formulaExplanation: `Math.ceil((${effectiveArea} m² / ${boardAreaM2} m²) * ${layersCount} layer(s) * ${wasteMultiplier} wastage)`,
        category: "MATERIALS",
      },
      {
        componentKey: "STUD_FRAMING",
        name: `قطاعات معدنية رأسية (C-Studs ${studSpacingCm} سم)`,
        nameAr: `قطاعات معدنية رأسية (C-Studs ${studSpacingCm} سم)`,
        nameEn: `Metal C-Stud Framing (${studSpacingCm} cm spacing)`,
        itemType: "PRODUCT",
        quantity: totalStudMeters,
        unit: "LM",
        provenance: "CALCULATED",
        formulaExplanation: `Math.ceil(${effectiveArea} m² * ${linearStudsPerM2.toFixed(2)} m/m² * ${wasteMultiplier} wastage)`,
        category: "MATERIALS",
      },
      {
        componentKey: "RUNNER_TRACKS",
        name: "قطاعات معدنية أفقية (U-Runner Tracks)",
        nameAr: "قطاعات معدنية أفقية (U-Runner Tracks)",
        nameEn: "Metal U-Runner Tracks",
        itemType: "PRODUCT",
        quantity: totalTrackMeters,
        unit: "LM",
        provenance: "CALCULATED",
        formulaExplanation: `Math.ceil(${effectiveArea} m² * 0.85 m/m² * ${wasteMultiplier} wastage)`,
        category: "MATERIALS",
      },
      {
        componentKey: "DRYWALL_SCREWS",
        name: "براغي تثبيت أجهزة وجبس بورد (Drywall Screws)",
        nameAr: "براغي تثبيت أجهزة وجبس بورد (Drywall Screws)",
        nameEn: "Drywall Screws",
        itemType: "PRODUCT",
        quantity: totalScrews,
        unit: "Pcs",
        provenance: "CALCULATED",
        formulaExplanation: `Math.ceil(${effectiveArea} m² * 18 screws/m² * ${layersCount} layer(s) * ${wasteMultiplier} wastage)`,
        category: "ACCESSORIES",
      },
      {
        componentKey: "JOINT_TAPE",
        name: "شريط فواصل ورقي/فيبر (Joint Tape)",
        nameAr: "شريط فواصل ورقي/فيبر (Joint Tape)",
        nameEn: "Joint Fiber/Paper Tape",
        itemType: "PRODUCT",
        quantity: totalTapeMeters,
        unit: "LM",
        provenance: "CALCULATED",
        formulaExplanation: `Math.ceil(${effectiveArea} m² * 1.6 m/m² * ${wasteMultiplier} wastage)`,
        category: "ACCESSORIES",
      },
      {
        componentKey: "JOINT_COMPOUND",
        name: "معجون فواصل جبس بورد (Joint Compound)",
        nameAr: "معجون فواصل جبس بورد (Joint Compound)",
        nameEn: "Joint Compound / Putty",
        itemType: "PRODUCT",
        quantity: totalCompoundKg,
        unit: "KG",
        provenance: "CALCULATED",
        formulaExplanation: `Math.ceil(${effectiveArea} m² * 1.2 kg/m² * ${layersCount} layer(s) * ${wasteMultiplier} wastage)`,
        category: "ACCESSORIES",
      },
      {
        componentKey: "ANCHORS_AND_PLUGS",
        name: "خوابير وبراغي تثبيت الجدران والأسقف",
        nameAr: "خوابير وبراغي تثبيت الجدران والأسقف",
        nameEn: "Wall Plugs & Frame Anchors",
        itemType: "PRODUCT",
        quantity: totalAnchors,
        unit: "Pair",
        provenance: "CALCULATED",
        formulaExplanation: `Math.ceil(${effectiveArea} m² * 3 pairs/m² * ${wasteMultiplier} wastage)`,
        category: "ACCESSORIES",
      },
    ];

    if (includeInsulation) {
      const insulationM2 = Math.ceil(effectiveArea * wasteMultiplier);
      components.push({
        componentKey: "ROCKWOOL_INSULATION",
        name: "عازل صوف صخري حراري وصوتي",
        nameAr: "عازل صوف صخري حراري وصوتي",
        nameEn: "Rockwool Thermal & Acoustic Insulation",
        itemType: "PRODUCT",
        quantity: insulationM2,
        unit: "m²",
        provenance: "CALCULATED",
        formulaExplanation: `Math.ceil(${effectiveArea} m² * ${wasteMultiplier} wastage)`,
        category: "MATERIALS",
      });
    }

    // Labor / Finishing Line Item
    if (includeInstallation) components.push({
      componentKey: "GYPSUM_LABOR",
      name: "مصاريف مصنعية توريد وتركيب وتجهيز الجبس بورد",
      nameAr: "مصاريف مصنعية توريد وتركيب وتجهيز الجبس بورد",
      nameEn: "Gypsum Board Installation & Finishing Service",
      itemType: "SERVICE",
      quantity: effectiveArea,
      unit: "m²",
      provenance: "CALCULATED",
      formulaExplanation: `Installation & finishing labor for ${effectiveArea} m²`,
      category: "SERVICES",
    });

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
