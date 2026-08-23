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
}

export class GypsumBoardSystemTemplate implements ISystemTemplate {
  public readonly systemType = "GYPSUM_BOARD";
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
    const area = typeof areaInput === "number" && !isNaN(areaInput) ? areaInput : null;

    if (area === null || area <= 0) {
      missingInputs.push("areaM2");
      if (area !== null && area <= 0) {
        warnings.push("Area must be greater than 0 m².");
      }
    }

    const layersCountProvided = rawInputs.layersCount ?? rawInputs.layers;
    const layersCount =
      typeof layersCountProvided === "number" && layersCountProvided > 0
        ? layersCountProvided
        : GypsumBoardSystemTemplate.DEFAULT_LAYERS_COUNT;
    const layersProvenance: ProvenanceType =
      typeof layersCountProvided === "number" && layersCountProvided > 0
        ? "USER_PROVIDED"
        : "SUGGESTED";

    const wasteProvided = rawInputs.wastePercentage ?? rawInputs.wastage;
    const wastePercentage =
      typeof wasteProvided === "number" && wasteProvided >= 0
        ? wasteProvided
        : GypsumBoardSystemTemplate.DEFAULT_WASTE_PERCENTAGE;
    const wasteProvenance: ProvenanceType =
      typeof wasteProvided === "number" && wasteProvided >= 0
        ? "USER_PROVIDED"
        : "SUGGESTED";

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

    const includeInsulation = Boolean(rawInputs.includeInsulation);

    const inputs: SystemInputParameter[] = [
      {
        name: "areaM2",
        labelAr: "المساحة (م²)",
        labelEn: "Area (m²)",
        value: area,
        unit: "m²",
        provenance: area !== null ? "USER_PROVIDED" : "SUGGESTED",
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
        name: "boardDimensions",
        labelAr: "أبعاد الألواح (متر)",
        labelEn: "Board Dimensions (m)",
        value: `${boardWidth} x ${boardLength} m`,
        provenance: "SUGGESTED",
        isDefault: true,
      },
      {
        name: "studSpacingCm",
        labelAr: "مسافة القوائم (سم)",
        labelEn: "Stud Spacing (cm)",
        value: studSpacingCm,
        unit: "cm",
        provenance: "SUGGESTED",
        isDefault: true,
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
    components.push({
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
