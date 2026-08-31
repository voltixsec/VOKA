import { SmartSystemBuilderService } from "@/src/application/smart-system/services/SmartSystemBuilderService";
import type { ConfirmedFact, FactValue, SolutionBomLine, SystemConfigurationGraph } from "./types";

const EMPTY_GRAPH: SystemConfigurationGraph = {
  system: null, requirements: [], unresolvedDecisions: [], assumptions: [], engineeringCalculations: [],
  engineeringBom: [], salesBom: [], candidateProducts: [], catalogResolution: "NOT_REQUIRED",
  readiness: { draftReady: false, pendingBeforeFinalIssue: [] },
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
  const graph: SystemConfigurationGraph = { ...EMPTY_GRAPH, system, requirements, readiness: { draftReady: true, pendingBeforeFinalIssue: [] } };
  const area = numeric(facts, "system.areaM2");

  if (system.key === "CERAMIC_FLOORING") {
    const size = text(facts, "system.tileSize") ?? "60x60";
    const normalized = size.match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/i);
    const tileArea = normalized ? (Number(normalized[1]) / 100) * (Number(normalized[2]) / 100) : null;
    const baseTiles = area && tileArea ? Math.ceil(area / tileArea) : null;
    graph.unresolvedDecisions = [
      ...(!area ? [{ key: "system.areaM2", labelAr: "مساحة التنفيذ", labelEn: "Installation area", safetyCritical: false }] : []),
      { key: "ceramic.wastage", labelAr: "نسبة الهالك المعتمدة", labelEn: "Approved wastage allowance", safetyCritical: false },
    ];
    if (baseTiles) graph.engineeringCalculations.push({ key: "ceramic.baseTiles", labelAr: "عدد البلاطات قبل الهالك", labelEn: "Tiles before wastage", value: String(baseTiles), provenance: "DETERMINISTIC_DERIVATION" });
    graph.engineeringBom = [
      line({ id: "CERAMIC_TILES", itemNameAr: `بلاط سيراميك ${size} سم`, itemNameEn: `Ceramic tiles ${size} cm`, type: "PRODUCT", quantity: baseTiles, quantityState: baseTiles ? "CONFIRMED" : "PENDING", unitName: "tile", provenance: "DETERMINISTIC_DERIVATION" }),
      line({ id: "CERAMIC_ADHESIVE", itemNameAr: "لاصق سيراميك مطابق للبلاط والسطح", itemNameEn: "Ceramic tile adhesive suitable for tile and substrate", type: "PRODUCT", unitName: "bag" }),
      line({ id: "CERAMIC_GROUT", itemNameAr: "حشو فواصل سيراميك", itemNameEn: "Ceramic tile grout", type: "PRODUCT", unitName: "bag" }),
      line({ id: "CERAMIC_ACCESSORIES", itemNameAr: "إكسسوارات وفواصل تنفيذ", itemNameEn: "Installation accessories and spacers", type: "PRODUCT" }),
      line({ id: "CERAMIC_LABOR", itemNameAr: "عمالة تركيب وضبط مناسيب السيراميك", itemNameEn: "Ceramic installation and levelling labor", type: "SERVICE", quantity: area, quantityState: area ? "CONFIRMED" : "PENDING", unitName: "m²" }),
    ];
    graph.salesBom = graph.engineeringBom.map((item) => ({ ...item, itemNameAr: item.id === "CERAMIC_TILES" ? `سيراميك أرضيات ${size} سم` : item.id === "CERAMIC_ADHESIVE" ? "لاصق سيراميك" : item.id === "CERAMIC_GROUT" ? "حشو فواصل سيراميك" : item.id === "CERAMIC_ACCESSORIES" ? "إكسسوارات تركيب سيراميك" : "أعمال تركيب سيراميك", itemNameEn: item.id === "CERAMIC_TILES" ? `Floor ceramic tiles ${size} cm` : item.id === "CERAMIC_ADHESIVE" ? "Ceramic tile adhesive" : item.id === "CERAMIC_GROUT" ? "Ceramic tile grout" : item.id === "CERAMIC_ACCESSORIES" ? "Ceramic installation accessories" : "Ceramic installation works", itemName: item.id }));
  } else if (system.key === "FM200") {
    graph.unresolvedDecisions = [{ key: "fm200.protectedVolume", labelAr: "حجم الحيز المحمي أو المخطط", labelEn: "Protected volume or drawing", safetyCritical: true }];
    graph.assumptions = [{ key: "fm200.safety", textAr: "لا يتم تحديد كمية الغاز أو الأسطوانات قبل بيانات الحيز وقواعد هندسية موثوقة.", textEn: "Agent quantity and cylinder sizing remain unset until enclosure data and governed rules are available." }];
    graph.readiness = { draftReady: true, pendingBeforeFinalIssue: ["Engineering sizing", "Product selection", "Pricing"] };
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
  graph.readiness.pendingBeforeFinalIssue = [!facts["customer.name"] && "Customer", graph.salesBom.some((row) => row.quantityState === "PENDING") && "Quantity", graph.salesBom.some((row) => row.priceState === "PENDING") && "Pricing", !facts["commercial.payment"] && "Payment terms"].filter((value): value is string => Boolean(value));
  return graph;
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
