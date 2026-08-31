import { SmartSystemBuilderService } from "@/src/application/smart-system/services/SmartSystemBuilderService";
import type { ConfirmedFact, FactValue, SolutionBomLine, SystemConfigurationGraph } from "./types";

const EMPTY_GRAPH: SystemConfigurationGraph = {
  system: null, requirements: [], unresolvedDecisions: [], assumptions: [], engineeringCalculations: [],
  engineeringBom: [], salesBom: [], candidateProducts: [], catalogResolution: "NOT_REQUIRED",
  readiness: { draftReady: false, pendingBeforeDraftOpen: [], pendingBeforeFinalIssue: [] },
};

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

export function buildSystemConfigurationGraph(facts: Record<string, ConfirmedFact>): SystemConfigurationGraph {
  const system = systemIdentity(text(facts, "system.identity"));
  if (!system) return EMPTY_GRAPH;
  const requirements = Object.entries(labels).flatMap(([key, label]) => facts[key] ? [{ key, labelAr: label[0], labelEn: label[1], value: facts[key].value as FactValue, provenance: facts[key].provenance }] : []);
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
              quantity: supplyAreaM2,
              quantityState: "CONFIRMED",
              unitName: "m\u00B2",
              provenance: "DETERMINISTIC_DERIVATION",
            }
          : item,
      );
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
    const calculated = smart.calculateSystem(system.key, inputs);
    if (calculated) {
      graph.unresolvedDecisions = calculated.missingInputs.map((key) => ({ key, labelAr: key, labelEn: key, safetyCritical: false }));
      graph.engineeringBom = calculated.components.map((component) => line({ id: component.componentKey, itemNameAr: component.nameAr, itemNameEn: component.nameEn, type: component.itemType, quantity: component.quantity, quantityState: "CONFIRMED", unitName: component.unit, provenance: "GOVERNED_TEMPLATE", description: component.formulaExplanation ?? null }));
      graph.salesBom = calculated.components.map((component) => line({ id: component.componentKey, itemNameAr: commercialName(component.componentKey, component.nameAr, true), itemNameEn: commercialName(component.componentKey, component.nameEn, false), type: component.itemType, quantity: component.quantity, quantityState: "CONFIRMED", unitName: component.unit, provenance: "GOVERNED_TEMPLATE" }));
    }
  }
  graph.catalogResolution = graph.salesBom.some((row) => row.type === "PRODUCT") ? "PENDING" : "NOT_REQUIRED";
  graph.salesBom = graph.salesBom.map((row) => applyApprovedProductSelection(row, facts));
  graph.engineeringBom = graph.engineeringBom.map((row) => applyApprovedProductSelection(row, facts));
  graph.readiness.pendingBeforeDraftOpen = [!facts["customer.name"] ? "Customer" : null, !facts["system.jurisdiction"] ? "Jurisdiction" : null].filter((value): value is string => value !== null);
  graph.readiness.draftReady = graph.readiness.pendingBeforeDraftOpen.length === 0;
  graph.readiness.pendingBeforeFinalIssue = [graph.salesBom.some((row) => row.quantityState === "PENDING") && "Quantity", graph.salesBom.some((row) => row.priceState === "PENDING") && "Pricing", graph.salesBom.some((row) => row.type === "PRODUCT" && !row.catalogItemId && row.provenance !== "RESEARCHED") && "Product selection", !facts["commercial.payment"] && "Payment terms"].filter((value): value is string => typeof value === "string");
  return graph;
}

function applyApprovedProductSelection(line: SolutionBomLine, facts: Record<string, ConfirmedFact>): SolutionBomLine {
  const prefix = `product.selection.${line.id}.`;
  const selected = (field: string) => facts[prefix + field]?.provenance === "USER_APPROVED" ? facts[prefix + field] : null;
  const name = selected("name")?.value;
  const brand = selected("brand")?.value;
  const model = selected("model")?.value;
  const source = selected("source")?.value;
  if (typeof name !== "string" || (source !== "VERIFIED_CATALOG" && source !== "RESEARCHED")) return line;
  const commercialIdentity = [typeof brand === "string" ? brand : null, typeof model === "string" ? model : null].filter(Boolean).join(" - ");
  const catalogItemId = selected("catalogItemId")?.value;
  const unitPrice = selected("unitPrice")?.value;
  return {
    ...line,
    itemName: name,
    itemNameAr: [line.itemNameAr, commercialIdentity].filter(Boolean).join(" - "),
    itemNameEn: [line.itemNameEn, commercialIdentity].filter(Boolean).join(" - "),
    brand: typeof brand === "string" ? brand : null,
    model: typeof model === "string" ? model : null,
    catalogItemId: typeof catalogItemId === "string" ? catalogItemId : null,
    unitPrice: typeof unitPrice === "number" ? unitPrice : null,
    priceState: typeof unitPrice === "number" ? "CONFIRMED" : "PENDING",
    provenance: source === "VERIFIED_CATALOG" ? "VERIFIED_CATALOG" : "RESEARCHED",
  };
}

function commercialName(key: string, fallback: string, ar: boolean) {
  const names: Record<string, [string, string]> = {
    CCTV_CAMERAS: ["كاميرات مراقبة IP", "IP surveillance cameras"], NVR_RECORDER: ["جهاز تسجيل شبكي NVR", "NVR network recorder"],
    CCTV_STORAGE: ["وحدات تخزين للمراقبة", "Surveillance storage drives"], CCTV_POE_SWITCH: ["مبدّل شبكة PoE", "PoE network switch"],
    CCTV_CABLE: ["كابلات شبكة للكاميرات", "CCTV network cabling"], CCTV_LABOR: ["أعمال تركيب وبرمجة نظام الكاميرات", "CCTV installation and configuration"],
    GYPSUM_BOARDS: ["ألواح جبس بورد", "Gypsum boards"], GYPSUM_STUDS: ["قطاعات جبس بورد رأسية", "Gypsum vertical studs"],
    GYPSUM_TRACKS: ["مسارات جبس بورد", "Gypsum tracks"], GYPSUM_SCREWS: ["مسامير جبس بورد", "Gypsum board screws"],
    GYPSUM_JOINT_TAPE: ["شريط فواصل جبس بورد", "Gypsum joint tape"], GYPSUM_COMPOUND: ["معجون فواصل جبس بورد", "Gypsum joint compound"],
    GYPSUM_LABOR: ["أعمال تركيب جبس بورد", "Gypsum board installation works"],
  };
  return names[key]?.[ar ? 0 : 1] ?? fallback;
}

export function emptySystemConfigurationGraph() { return structuredClone(EMPTY_GRAPH); }
