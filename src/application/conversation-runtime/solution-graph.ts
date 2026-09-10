import { SmartSystemBuilderService } from "@/src/application/smart-system/services/SmartSystemBuilderService";
import { CCTV_ENGINEERING_DEFAULT, type EngineeringRuleProfile } from "@/src/domain/smart-system";
import type { ConfirmedFact, FactValue, SolutionBomLine, SystemConfigurationGraph } from "./types";
import { commercialAttributesFromComponent, projectCommercialBomLine } from "./commercial-projection";

const EMPTY_GRAPH: SystemConfigurationGraph = {
  system: null, requirements: [], unresolvedDecisions: [], assumptions: [], engineeringCalculations: [],
  engineeringBom: [], salesBom: [], candidateProducts: [], catalogResolution: "NOT_REQUIRED",
  readiness: { draftReady: false, pendingBeforeDraftOpen: [], pendingBeforeFinalIssue: [] },
};

type GraphResolutionContext = { engineeringRules?: import("@/src/application/agentic-commercial-intelligence").ResearchedEngineeringRule[] };

const labels: Record<string, [string, string]> = {
  "system.jurisdiction": ["الدولة", "Jurisdiction"], "scope.type": ["النطاق", "Scope"],
  "system.areaM2": ["المساحة", "Area"], "system.tileSize": ["مقاس البلاط", "Tile size"],
  "system.qualityTier": ["المستوى", "Quality tier"], "system.cameraCount": ["عدد الكاميرات", "Camera count"],
  "system.resolutionMp": ["الدقة", "Resolution"], "system.environment": ["بيئة التشغيل", "Environment"],
  "system.cameraType": ["نوع الكاميرا", "Camera type"], "system.storageDays": ["مدة التسجيل", "Recording retention"],
  "product.origin": ["بلد المنشأ المفضل", "Preferred origin"], "product.brand": ["العلامة المفضلة", "Preferred brand"], "product.model": ["الموديل", "Model"],
};

function text(facts: Record<string, ConfirmedFact>, key: string) {
  const value = facts[key]?.value;
  return typeof value === "string" ? value.trim() : value == null ? null : String(value);
}
function numeric(facts: Record<string, ConfirmedFact>, key: string) {
  const value = facts[key]?.value;
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(number) && number > 0 ? number : null;
}
function numericNonNegative(facts: Record<string, ConfirmedFact>, key: string) {
  const value = facts[key]?.value;
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(number) && number >= 0 ? number : null;
}
function line(input: Partial<SolutionBomLine> & Pick<SolutionBomLine, "id" | "itemNameAr" | "itemNameEn" | "type">): SolutionBomLine {
  return {
    componentKeys: [input.id], category: input.type === "SERVICE" ? "SERVICE" : "PRODUCT",
    itemName: input.itemNameAr, description: null, unitName: null, quantity: null, quantityState: "PENDING",
    unitPrice: null, priceState: "PENDING", provenance: "GOVERNED_TEMPLATE", ...input,
  };
}

function systemIdentity(value: string | null) {
  if (!value) return null;
  if (/ceramic|tile|سيراميك|بلاط/i.test(value)) return { key: "CERAMIC_FLOORING", nameAr: "أعمال سيراميك", nameEn: "Ceramic flooring" };
  if (/gypsum|drywall|جبس/i.test(value)) return { key: "GYPSUM_BOARD", nameAr: "نظام جبس بورد", nameEn: "Gypsum board system" };
  if (/cctv|camera|surveillance|كامير/i.test(value)) return { key: "CCTV", nameAr: "نظام كاميرات مراقبة", nameEn: "CCTV system" };
  if (/fm\s*-?\s*200|إف\s*إم/i.test(value)) return { key: "FM200", nameAr: "نظام إطفاء FM-200", nameEn: "FM-200 suppression system" };
  return { key: value.toUpperCase().replace(/\s+/g, "_"), nameAr: value, nameEn: value };
}

export function buildSystemConfigurationGraph(facts: Record<string, ConfirmedFact>, context: GraphResolutionContext = {}): SystemConfigurationGraph {
  const system = systemIdentity(text(facts, "system.identity"));
  if (!system) return EMPTY_GRAPH;
  const requirements = [
    ...Object.entries(labels).flatMap(([key, label]) => facts[key] ? [{ key, labelAr: label[0], labelEn: label[1], value: facts[key].value as FactValue, provenance: facts[key].provenance }] : []),
    ...Object.entries(facts).flatMap(([key, current]) => key.startsWith("system.specification.")
      ? [{ key, labelAr: key.slice("system.specification.".length).replace(/_/g, " "), labelEn: key.slice("system.specification.".length).replace(/_/g, " "), value: current.value as FactValue, provenance: current.provenance }]
      : []),
  ];
  const graph: SystemConfigurationGraph = { ...EMPTY_GRAPH, system, requirements, readiness: { draftReady: false, pendingBeforeDraftOpen: [], pendingBeforeFinalIssue: [] } };
  const area = numeric(facts, "system.areaM2");

  if (system.key === "CERAMIC_FLOORING") {
    const size = text(facts, "system.tileSize") ?? "60x60";
    const normalized = size.match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/i);
    const tileArea = normalized ? (Number(normalized[1]) / 100) * (Number(normalized[2]) / 100) : null;
    const baseTiles = area && tileArea ? Math.ceil(area / tileArea) : null;
    const wastagePercent = numericNonNegative(facts, "ceramic.wastagePercent");
    const supplyAreaM2 = area
      ? Math.round(area * (1 + (wastagePercent ?? 0) / 100) * 100) / 100
      : null;
    const procurementTiles = supplyAreaM2 && tileArea
      ? Math.ceil(supplyAreaM2 / tileArea)
      : baseTiles;
    const adhesiveBags = numeric(facts, "ceramic.adhesiveBags");
    const groutKg = numeric(facts, "ceramic.groutKg");
    const skirtingLm = numeric(facts, "ceramic.skirtingLm");
    const skirtingHeightCm = numeric(facts, "ceramic.skirtingHeightCm");
    const levelingThicknessCm = numeric(facts, "ceramic.levelingThicknessCm");
    const packageAreaM2 = numeric(facts, "ceramic.packageAreaM2");
    graph.unresolvedDecisions = [
      ...(!area ? [{ key: "system.areaM2", labelAr: "مساحة التنفيذ", labelEn: "Installation area", safetyCritical: false }] : []),
      ...(wastagePercent == null ? [{ key: "ceramic.wastagePercent", labelAr: "\u0646\u0633\u0628\u0629 \u0627\u0644\u0647\u0627\u0644\u0643 \u0627\u0644\u0645\u0639\u062a\u0645\u062f\u0629", labelEn: "Approved wastage allowance", safetyCritical: false }] : []),
    ];
    if (baseTiles) graph.engineeringCalculations.push({ key: "ceramic.baseTiles", labelAr: "عدد البلاطات قبل الهالك", labelEn: "Tiles before wastage", value: String(baseTiles), provenance: "DETERMINISTIC_DERIVATION" });
    graph.engineeringBom = [
      line({ id: "CERAMIC_TILES", itemNameAr: `بلاط سيراميك ${size} سم`, itemNameEn: `Ceramic tiles ${size} cm`, type: "PRODUCT", quantity: procurementTiles, quantityState: procurementTiles ? "CONFIRMED" : "PENDING", unitName: "tile", provenance: "DETERMINISTIC_DERIVATION" }),
      line({ id: "CERAMIC_ADHESIVE", itemNameAr: "لاصق سيراميك مطابق للبلاط والسطح", itemNameEn: "Ceramic tile adhesive suitable for tile and substrate", type: "PRODUCT", quantity: adhesiveBags, quantityState: adhesiveBags ? "CONFIRMED" : "PENDING", unitName: "bag", provenance: facts["ceramic.adhesiveBags"]?.provenance ?? "GOVERNED_TEMPLATE" }),
      line({ id: "CERAMIC_GROUT", itemNameAr: "حشو فواصل سيراميك", itemNameEn: "Ceramic tile grout", type: "PRODUCT", quantity: groutKg, quantityState: groutKg ? "CONFIRMED" : "PENDING", unitName: "kg", provenance: facts["ceramic.groutKg"]?.provenance ?? "GOVERNED_TEMPLATE" }),
      line({ id: "CERAMIC_ACCESSORIES", itemNameAr: "إكسسوارات وفواصل تنفيذ", itemNameEn: "Installation accessories and spacers", type: "PRODUCT" }),
      line({ id: "CERAMIC_LABOR", itemNameAr: "عمالة تركيب وضبط مناسيب السيراميك", itemNameEn: "Ceramic installation and levelling labor", type: "SERVICE", quantity: area, quantityState: area ? "CONFIRMED" : "PENDING", unitName: "m²" }),
    ];
    graph.salesBom = graph.engineeringBom.map((item) => ({ ...item, itemNameAr: item.id === "CERAMIC_TILES" ? `سيراميك أرضيات ${size} سم` : item.id === "CERAMIC_ADHESIVE" ? "لاصق سيراميك" : item.id === "CERAMIC_GROUT" ? "حشو فواصل سيراميك" : item.id === "CERAMIC_ACCESSORIES" ? "إكسسوارات تركيب سيراميك" : "أعمال تركيب سيراميك", itemNameEn: item.id === "CERAMIC_TILES" ? `Floor ceramic tiles ${size} cm` : item.id === "CERAMIC_ADHESIVE" ? "Ceramic tile adhesive" : item.id === "CERAMIC_GROUT" ? "Ceramic tile grout" : item.id === "CERAMIC_ACCESSORIES" ? "Ceramic installation accessories" : "Ceramic installation works", itemName: item.id }));

    if (supplyAreaM2) {
      graph.salesBom = graph.salesBom.map((item) =>
        item.id === "CERAMIC_TILES"
          ? {
              ...item,
              quantity: packageAreaM2 ? Math.ceil(supplyAreaM2 / packageAreaM2) : supplyAreaM2,
              quantityState: "CONFIRMED",
              unitName: packageAreaM2 ? "box" : "m\u00B2",
              provenance: "DETERMINISTIC_DERIVATION",
              engineeringStatus: wastagePercent != null && packageAreaM2 ? "EXACT" : "ESTIMATED",
              calculationInputs: packageAreaM2 ? { requiredAreaM2: supplyAreaM2, packageAreaM2 } : { requiredAreaM2: supplyAreaM2 },
              assumptions: packageAreaM2 ? [] : ["Commercial package area is not yet known; area remains the purchasing unit."],
            }
          : item,
      );
      if (packageAreaM2) graph.engineeringCalculations.push({ key: "ceramic.packageCount", labelAr: "عدد عبوات السيراميك", labelEn: "Ceramic package count", value: String(Math.ceil(supplyAreaM2 / packageAreaM2)), provenance: "DETERMINISTIC_DERIVATION", status: wastagePercent != null ? "EXACT" : "ESTIMATED", inputs: { requiredAreaM2: supplyAreaM2, packageAreaM2 }, assumptions: wastagePercent == null ? ["Wastage allowance remains estimated."] : [] });
    }

    if (wastagePercent != null && procurementTiles) {
      graph.engineeringCalculations.push({
        key: "ceramic.procurementTiles",
        labelAr: "\u0639\u062f\u062f \u0627\u0644\u0628\u0644\u0627\u0637 \u0628\u0639\u062f \u0627\u0644\u0647\u0627\u0644\u0643",
        labelEn: "Tiles including wastage",
        value: String(procurementTiles),
        provenance: "DETERMINISTIC_DERIVATION",
      });
    }

    if (skirtingLm) {
      const skirting = line({
        id: "CERAMIC_SKIRTING",
        itemNameAr: skirtingHeightCm
          ? "\u0648\u0632\u0631\u0627\u062a \u0633\u064a\u0631\u0627\u0645\u064a\u0643 \u0627\u0631\u062a\u0641\u0627\u0639 " + skirtingHeightCm + " \u0633\u0645"
          : "\u0648\u0632\u0631\u0627\u062a \u0633\u064a\u0631\u0627\u0645\u064a\u0643",
        itemNameEn: skirtingHeightCm
          ? "Ceramic skirting " + skirtingHeightCm + " cm"
          : "Ceramic skirting",
        type: "PRODUCT",
        quantity: skirtingLm,
        quantityState: "CONFIRMED",
        unitName: "lm",
        provenance: facts["ceramic.skirtingLm"]?.provenance ?? "USER_APPROVED",
      });

      graph.engineeringBom.push(skirting);
      graph.salesBom.push({
        ...skirting,
        itemName: "CERAMIC_SKIRTING",
      });
    }

    if (levelingThicknessCm && area) {
      const levelingVolumeM3 =
        Math.round(area * (levelingThicknessCm / 100) * 1000) / 1000;

      graph.engineeringCalculations.push({
        key: "ceramic.levelingVolumeM3",
        labelAr: "\u062d\u062c\u0645 \u0627\u0644\u062a\u0633\u0648\u064a\u0629 \u0627\u0644\u062a\u0642\u0631\u064a\u0628\u064a",
        labelEn: "Approximate leveling volume",
        value: levelingVolumeM3 + " m\u00B3",
        provenance: "DETERMINISTIC_DERIVATION",
      });

      const leveling = line({
        id: "CERAMIC_LEVELING",
        itemNameAr:
          "\u0623\u0639\u0645\u0627\u0644 \u062a\u0633\u0648\u064a\u0629 \u0623\u0631\u0636\u064a\u0629 \u0628\u0645\u062a\u0648\u0633\u0637 \u0633\u0645\u0643 " +
          levelingThicknessCm +
          " \u0633\u0645",
        itemNameEn:
          "Floor leveling works, average thickness " +
          levelingThicknessCm +
          " cm",
        type: "SERVICE",
        quantity: area,
        quantityState: "CONFIRMED",
        unitName: "m\u00B2",
        provenance:
          facts["ceramic.levelingThicknessCm"]?.provenance ??
          "USER_APPROVED",
        description:
          "Approximate internal calculated volume: " +
          levelingVolumeM3 +
          " m\u00B3",
      });

      graph.engineeringBom.push(leveling);
      graph.salesBom.push({
        ...leveling,
        itemName: "CERAMIC_LEVELING",
        description: null,
      });
    }

  } else if (system.key === "FM200") {
    graph.unresolvedDecisions = [{ key: "fm200.protectedVolume", labelAr: "حجم الحيز المحمي أو المخطط", labelEn: "Protected volume or drawing", safetyCritical: true }];
    graph.assumptions = [{ key: "fm200.safety", textAr: "لا يتم تحديد كمية الغاز أو الأسطوانات قبل بيانات الحيز وقواعد هندسية موثوقة.", textEn: "Agent quantity and cylinder sizing remain unset until enclosure data and governed rules are available." }];
    graph.readiness = { draftReady: false, pendingBeforeDraftOpen: [], pendingBeforeFinalIssue: ["Engineering sizing", "Product selection", "Pricing"] };
  } else {
    const smart = new SmartSystemBuilderService();
    const inputs = system.key === "GYPSUM_BOARD"
      ? { areaM2: area, layersCount: numeric(facts, "system.layersCount"), includeInstallation: /INSTALL/i.test(text(facts, "scope.type") ?? "") }
      : { cameraCount: numeric(facts, "system.cameraCount") ?? numeric(facts, "system.quantity"), resolutionMp: numeric(facts, "system.resolutionMp"), storageDays: numeric(facts, "system.storageDays"), jurisdiction: text(facts, "system.jurisdiction"), includeInstallation: /INSTALL/i.test(text(facts, "scope.type") ?? "") };
    const selectedCapability = (field: string) => numeric(facts, `product.selection.NVR_RECORDER.capabilities.${field}`);
    const selectedCodec = text(facts, "product.selection.NVR_RECORDER.capabilities.supportedCodec");
    const selectedRaid = facts["product.selection.NVR_RECORDER.capabilities.raidSupported"]?.value;
    const recorderCapabilityValues = system.key === "CCTV" ? {
      channels: selectedCapability("channels"),
      diskBays: selectedCapability("diskBays"),
      maxHddCapacityTb: selectedCapability("maxHddCapacityTb"),
      incomingBandwidthMbps: selectedCapability("incomingBandwidthMbps"),
      supportedCodec: selectedCodec === "H.264" || selectedCodec === "H.265" ? selectedCodec : null,
      raidSupported: typeof selectedRaid === "boolean" ? selectedRaid : null,
    } : null;
    const recorderCapabilities = recorderCapabilityValues && Object.values(recorderCapabilityValues).some((value) => value !== null) ? recorderCapabilityValues : null;
    const researchedRule = context.engineeringRules?.find((rule) => rule.systemType.toUpperCase() === system.key && normalizeIdentity(rule.jurisdiction) === normalizeIdentity(text(facts, "system.jurisdiction")));
    const allowedRuleFields = new Set(Object.keys(CCTV_ENGINEERING_DEFAULT.values));
    const verifiedValues = researchedRule ? Object.fromEntries(Object.entries(researchedRule.values).filter(([key, value]) => {
      if (!allowedRuleFields.has(key)) return false;
      if (key === "codec") return value === "H.264" || value === "H.265";
      if (typeof value !== "number" || !Number.isFinite(value)) return false;
      return ["storageReservePercent", "nvrUtilizationPercent", "poeReservedPorts"].includes(key) ? value >= 0 : value > 0;
    })) : {};
    const verifiedJurisdictionProfile: EngineeringRuleProfile | null = researchedRule && Object.keys(verifiedValues).length ? {
      ...CCTV_ENGINEERING_DEFAULT,
      id: researchedRule.profileId,
      name: researchedRule.authoritySourceTitle,
      version: researchedRule.profileVersion,
      jurisdiction: researchedRule.jurisdiction,
      trust: "VERIFIED_AUTHORITY",
      authoritySource: researchedRule.authoritySourceUrl,
      verifiedFields: Object.keys(verifiedValues) as Array<keyof EngineeringRuleProfile["values"]>,
      values: { ...CCTV_ENGINEERING_DEFAULT.values, ...verifiedValues },
    } : null;
    const calculated = smart.calculateSystem(system.key, { ...inputs, selectedRecorderCapabilities: recorderCapabilities, selectedDriveCapacityTb: numeric(facts, "product.selection.SURVEILLANCE_HDD.capabilities.capacityTb"), recorderCount: numeric(facts, "system.recorderCount") }, verifiedJurisdictionProfile ? { jurisdiction: text(facts, "system.jurisdiction"), verifiedJurisdictionProfile } : undefined);
    if (calculated) {
      graph.engineeringRuleSnapshot = calculated.engineeringRules;
      graph.compatibilityConflicts = calculated.compatibilityConflicts ?? [];
      graph.unresolvedDecisions = calculated.missingInputs.map((key) => ({ key, ...missingInputLabel(key), safetyCritical: false }));
      graph.engineeringBom = calculated.components.map((component) => {
        const engineeringStatus = component.quantityStatus ?? (component.provenance === "SUGGESTED" ? "ESTIMATED" : "EXACT");
        return line({ id: component.componentKey, itemNameAr: component.nameAr, itemNameEn: component.nameEn, type: component.itemType, quantity: component.quantity, quantityState: component.provenance === "SUGGESTED" ? "PENDING" : "CONFIRMED", unitName: component.unit, provenance: "GOVERNED_TEMPLATE", description: component.formulaExplanation ?? null, engineeringStatus, calculationInputs: component.calculationInputs, assumptions: component.assumptions, commercialAttributes: commercialAttributesFromComponent(component) });
      });
      graph.salesBom = calculated.components.map((component) => {
        const engineeringStatus = component.quantityStatus ?? (component.provenance === "SUGGESTED" ? "ESTIMATED" : "EXACT");
        return projectCommercialBomLine(line({ id: component.componentKey, itemNameAr: commercialName(component.componentKey, component.nameAr, true), itemNameEn: commercialName(component.componentKey, component.nameEn, false), type: component.itemType, quantity: component.quantity, quantityState: component.provenance === "SUGGESTED" ? "PENDING" : "CONFIRMED", unitName: component.unit, provenance: "GOVERNED_TEMPLATE", engineeringStatus, calculationInputs: component.calculationInputs, assumptions: component.assumptions, commercialAttributes: commercialAttributesFromComponent(component) }));
      });
      graph.engineeringCalculations = calculated.components.flatMap((component) => component.calculationInputs ? [{ key: `${component.componentKey}.quantity`, labelAr: component.nameAr, labelEn: component.nameEn, value: `${component.quantity} ${component.unit}`, provenance: "DETERMINISTIC_DERIVATION" as const, status: component.quantityStatus ?? "EXACT" as const, inputs: component.calculationInputs, assumptions: component.assumptions ?? [], importantMissingInformation: calculated.missingInputs, ruleSnapshot: calculated.engineeringRules }] : []);
    }
  }
  graph.catalogResolution = graph.salesBom.some((row) => row.type === "PRODUCT") ? "PENDING" : "NOT_REQUIRED";
  graph.salesBom = attachExplicitSpecifications(graph.salesBom, graph.requirements);
  graph.engineeringBom = attachExplicitSpecifications(graph.engineeringBom, graph.requirements);
  graph.salesBom = graph.salesBom.map((row) => projectCommercialBomLine(applyApprovedProductSelection(row, facts)));
  graph.engineeringBom = graph.engineeringBom.map((row) => applyApprovedProductSelection(row, facts));
  if (graph.compatibilityConflicts?.length) {
    const markConflict = (row: SolutionBomLine): SolutionBomLine => ["NVR_RECORDER", "SURVEILLANCE_HDD"].includes(row.id) ? { ...row, engineeringStatus: "CONFLICT" } : row;
    graph.salesBom = graph.salesBom.map(markConflict);
    graph.engineeringBom = graph.engineeringBom.map(markConflict);
  }
  graph.readiness.pendingBeforeDraftOpen = [];
  graph.readiness.draftReady = true;
  graph.readiness.pendingBeforeFinalIssue = [...graph.readiness.pendingBeforeFinalIssue, !facts["customer.name"] && "Customer", !facts["attention.name"] && "Attention", !facts["system.jurisdiction"] && "Jurisdiction", graph.salesBom.some((row) => row.quantityState === "PENDING") && "Quantity", graph.salesBom.some((row) => row.priceState === "PENDING") && "Pricing", graph.salesBom.some((row) => row.type === "PRODUCT" && !row.catalogItemId && row.provenance !== "RESEARCHED") && "Product selection", Boolean(graph.compatibilityConflicts?.length) && "Compatibility review", !facts["commercial.payment"] && "Payment terms"].filter((value): value is string => typeof value === "string");
  return constrainDocumentDraftReadiness(graph, facts);
}

/** Draft policy is independent of product selection, engineering estimates and pricing. */
export function constrainDocumentDraftReadiness(graph: SystemConfigurationGraph, facts: Record<string, ConfirmedFact>): SystemConfigurationGraph {
  const target = text(facts, "document.target");
  // A quotation draft is a review workspace, not a final commercial commitment.
  // Customer identity can be bound later from the composer without blocking the
  // assistant handoff; finalization still requires it via QuotationFinalizationValidator.
  const required = [!graph.system && "System", target && target !== "QUOTATION" && "Document type"].filter((value): value is string => Boolean(value));
  return { ...graph, readiness: { ...graph.readiness, draftReady: required.length === 0, pendingBeforeDraftOpen: required,
    pendingBeforeFinalIssue: graph.readiness.pendingBeforeFinalIssue,
  } };
}

function attachExplicitSpecifications(lines: SolutionBomLine[], requirements: SystemConfigurationGraph["requirements"]) {
  const targets: Record<string, string[]> = {
    "system.resolutionMp": ["CCTV_CAMERAS", "CCTV_BULLET_CAMERA", "CCTV_DOME_CAMERA"],
    "system.cameraType": ["CCTV_CAMERAS", "CCTV_BULLET_CAMERA", "CCTV_DOME_CAMERA"],
    "system.storageDays": ["CCTV_STORAGE", "NVR_RECORDER"],
    "system.tileSize": ["CERAMIC_TILES"],
    "system.layersCount": ["GYPSUM_BOARDS"],
  };
  const explicit = requirements.filter((item) => ["USER_EXPLICIT", "USER_CORRECTION", "USER_APPROVED"].includes(item.provenance));
  return lines.map((row) => {
    const relevant = row.type === "PRODUCT" ? explicit.filter((item) => item.key.startsWith("system.specification.") || targets[item.key]?.some((id) => row.id === id || row.componentKeys.includes(id))) : [];
    if (!relevant.length) return row;
    const specs = relevant.map((item) => `${item.labelAr} / ${item.labelEn}: ${item.value}${item.key === "system.resolutionMp" && !/mp/i.test(String(item.value)) ? " MP" : ""}`);
    const description = [...new Set([row.description, ...specs].filter((value): value is string => Boolean(value)))].join("; ");
    return { ...row, description };
  });
}

export function applyApprovedProductSelection(line: SolutionBomLine, facts: Record<string, ConfirmedFact>): SolutionBomLine {
  if (line.baseItemNameEn || line.baseItemNameAr) line = {
    ...line, itemName: line.baseItemNameEn ?? line.itemName,
    itemNameEn: line.baseItemNameEn ?? line.itemNameEn, itemNameAr: line.baseItemNameAr ?? line.itemNameAr,
    brand: null, model: null, catalogItemId: null, unitPrice: null, marketPrice: null, capabilities: null,
    productSelectionStatus: "GENERIC", pricingStatus: "PENDING", priceState: "PENDING",
  };
  const prefix = `product.selection.${line.id}.`;
  const selected = (field: string) => ["USER_APPROVED", "USER_CORRECTION", "USER_EXPLICIT"].includes(facts[prefix + field]?.provenance) ? facts[prefix + field] : null;
  const name = selected("name")?.value;
  const nameAr = selected("nameAr")?.value;
  const nameEn = selected("nameEn")?.value;
  const brand = selected("brand")?.value;
  const model = selected("model")?.value;
  const source = selected("source")?.value;
  if (selected("componentKey") && selected("componentKey")!.value !== line.id) return line;
  if (typeof name !== "string" || (source !== "VERIFIED_CATALOG" && source !== "RESEARCHED")) return line;
  const catalogItemId = selected("catalogItemId")?.value;
  const unitPrice = selected("unitPrice")?.value;
  const marketValue = (field: string) => selected(`marketPrice.${field}`)?.value;
  const marketCurrency = marketValue("priceCurrency");
  const marketSourceUrl = marketValue("priceSourceUrl");
  const marketSourceTitle = marketValue("priceSourceTitle");
  const marketObservedAt = marketValue("priceObservedAt");
  const marketPrice = typeof marketCurrency === "string" && typeof marketSourceUrl === "string" && typeof marketSourceTitle === "string" && typeof marketObservedAt === "string"
    ? {
        priceAmount: typeof marketValue("priceAmount") === "number" ? marketValue("priceAmount") as number : null,
        priceCurrency: marketCurrency,
        priceMin: typeof marketValue("priceMin") === "number" ? marketValue("priceMin") as number : null,
        priceMax: typeof marketValue("priceMax") === "number" ? marketValue("priceMax") as number : null,
        priceUnit: typeof marketValue("priceUnit") === "string" ? marketValue("priceUnit") as string : null,
        priceType: (typeof marketValue("priceType") === "string" ? marketValue("priceType") : "UNKNOWN") as import("@/src/application/agentic-commercial-intelligence").MarketPriceEvidence["priceType"],
        priceSourceUrl: marketSourceUrl,
        priceSourceTitle: marketSourceTitle,
        priceObservedAt: marketObservedAt,
      }
    : null;
  const capability = (field: string) => selected(`capabilities.${field}`)?.value;
  const capabilities = {
    capacityTb: typeof capability("capacityTb") === "number" ? capability("capacityTb") as number : undefined,
    channels: typeof capability("channels") === "number" ? capability("channels") as number : undefined,
    diskBays: typeof capability("diskBays") === "number" ? capability("diskBays") as number : undefined,
    maxHddCapacityTb: typeof capability("maxHddCapacityTb") === "number" ? capability("maxHddCapacityTb") as number : undefined,
    supportedCodec: capability("supportedCodec") === "H.264" || capability("supportedCodec") === "H.265" ? capability("supportedCodec") as "H.264" | "H.265" : undefined,
    incomingBandwidthMbps: typeof capability("incomingBandwidthMbps") === "number" ? capability("incomingBandwidthMbps") as number : undefined,
    raidSupported: typeof capability("raidSupported") === "boolean" ? capability("raidSupported") as boolean : undefined,
  };
  return {
    ...line,
    baseItemNameAr: line.baseItemNameAr ?? line.itemNameAr,
    baseItemNameEn: line.baseItemNameEn ?? line.itemNameEn,
    itemName: name,
    itemNameAr: typeof nameAr === "string" ? nameAr : name,
    itemNameEn: typeof nameEn === "string" ? nameEn : name,
    brand: typeof brand === "string" ? brand : null,
    model: typeof model === "string" ? model : null,
    catalogItemId: typeof catalogItemId === "string" ? catalogItemId : null,
    unitPrice: typeof unitPrice === "number" ? unitPrice : null,
    priceState: typeof unitPrice === "number" ? "CONFIRMED" : "PENDING",
    provenance: source === "VERIFIED_CATALOG" ? "VERIFIED_CATALOG" : "RESEARCHED",
    productSelectionStatus: "SELECTED",
    pricingStatus: typeof unitPrice === "number" ? "CONFIRMED" : marketPrice ? "MARKET_REFERENCE_AVAILABLE" : "PENDING",
    marketPrice,
    capabilities: Object.values(capabilities).some((value) => value !== undefined) ? capabilities : null,
    commercialAttributes: {
      ...line.commercialAttributes,
      capacity: capabilities.capacityTb ? `${capabilities.capacityTb}TB` : line.commercialAttributes?.capacity,
      channels: capabilities.channels ?? line.commercialAttributes?.channels,
      diskBays: capabilities.diskBays ?? line.commercialAttributes?.diskBays,
      features: [...new Set([
        ...(line.commercialAttributes?.features ?? []),
        ...(capabilities.maxHddCapacityTb ? [`Maximum supported HDD capacity ${capabilities.maxHddCapacityTb}TB`] : []),
        ...(capabilities.supportedCodec ? [capabilities.supportedCodec] : []),
      ])],
    },
  };
}

function normalizeIdentity(value: string | null | undefined) {
  return (value ?? "").normalize("NFKC").trim().toLocaleLowerCase();
}

function commercialName(key: string, fallback: string, ar: boolean) {
  const names: Record<string, [string, string]> = {
    CCTV_CAMERAS: ["كاميرات مراقبة IP", "IP surveillance cameras"], NVR_RECORDER: ["جهاز تسجيل شبكي NVR", "NVR network recorder"],
    SURVEILLANCE_HDD: ["قرص صلب مخصص للمراقبة", "Surveillance hard disk drive"], CCTV_STORAGE: ["وحدات تخزين للمراقبة", "Surveillance storage drives"], CCTV_POE_SWITCH: ["مبدّل شبكة PoE", "PoE network switch"],
    CCTV_CABLE: ["كابلات شبكة للكاميرات", "CCTV network cabling"], CCTV_LABOR: ["أعمال تركيب وبرمجة نظام الكاميرات", "CCTV installation and configuration"],
    GYPSUM_BOARDS: ["ألواح جبس بورد", "Gypsum boards"], GYPSUM_STUDS: ["قطاعات جبس بورد رأسية", "Gypsum vertical studs"],
    GYPSUM_TRACKS: ["مسارات جبس بورد", "Gypsum tracks"], GYPSUM_SCREWS: ["مسامير جبس بورد", "Gypsum board screws"],
    GYPSUM_JOINT_TAPE: ["شريط فواصل جبس بورد", "Gypsum joint tape"], GYPSUM_COMPOUND: ["معجون فواصل جبس بورد", "Gypsum joint compound"],
    GYPSUM_LABOR: ["أعمال تركيب جبس بورد", "Gypsum board installation works"],
  };
  return names[key]?.[ar ? 0 : 1] ?? fallback;
}

function missingInputLabel(key: string) {
  const known: Record<string, { labelAr: string; labelEn: string }> = {
    cameraCount: { labelAr: "عدد الكاميرات", labelEn: "Camera count" },
    resolutionMp: { labelAr: "دقة الكاميرات", labelEn: "Camera resolution" },
    storageDays: { labelAr: "مدة الاحتفاظ بالتسجيل", labelEn: "Recording retention" },
    areaM2: { labelAr: "المساحة", labelEn: "Area" },
    layersCount: { labelAr: "عدد الطبقات", labelEn: "Number of layers" },
  };
  return known[key] ?? { labelAr: "بيانات هندسية إضافية", labelEn: "Additional engineering input" };
}

export function emptySystemConfigurationGraph() { return structuredClone(EMPTY_GRAPH); }
