import {
  IFC_BASELINE_LIMITATION,
  IFC_EXTERNAL_REFERENCE_LIMITATION,
  IFC_NO_COUNT_LIMITATION,
  IFC_QUANTITY_LIMITATION,
  IFC_SEMANTIC_BASELINE_LIMITATION,
} from "@/src/domain/source-artifact";
import type {
  IfcAnalysis,
  ObservationReliability,
} from "@/src/domain/source-artifact";
import type { ArtifactInspectionStatus, ArtifactInspectionSummary } from "./ArtifactInspectionProjection";

const MAX_PROJECTED_LIMITATIONS_LOCAL = 8;

/**
 * Phase 2A-8: bounded, governed projection of an inspected IFC model.
 *
 * The deterministic inspection may hold tens of thousands of entities. The
 * assistant never sees that: this module distils it into a small, reviewable
 * record — schema, project/building/storey summary, bounded spaces and
 * systems, strongest semantic elements, type/property/material evidence,
 * declared quantity examples, exact IFC citations, and an explicit statement
 * of everything that was truncated.
 */

export const MAX_PROJECTED_IFC_SPACES = 8;
export const MAX_PROJECTED_IFC_STOREYS = 8;
export const MAX_PROJECTED_IFC_SYSTEMS = 6;
export const MAX_PROJECTED_IFC_ELEMENTS = 12;
export const MAX_PROJECTED_IFC_CANDIDATES = 6;
export const MAX_PROJECTED_IFC_PROPERTIES = 8;
export const MAX_PROJECTED_IFC_QUANTITIES = 6;
export const MAX_PROJECTED_IFC_MATERIALS = 4;
export const MAX_PROJECTED_IFC_CITATIONS = 12;
export const MAX_PROJECTED_IFC_REFERENCES = 4;

export type ProjectedIfcSpatial = {
  kind: string;
  kindLabel: string;
  kindLabelArabic: string;
  name: string | null;
  longName: string | null;
  globalId: string | null;
  stepId: number;
  locator: string;
};

export type ProjectedIfcElement = {
  entityType: string;
  name: string | null;
  tag: string | null;
  globalId: string | null;
  objectType: string | null;
  typeName: string | null;
  stepId: number;
  locator: string;
  containerLocator: string | null;
};

export type ProjectedIfcCandidate = {
  id: string;
  label: string;
  evidenceKinds: string[];
  evidenceKindsArabic: string[];
  evidenceLocators: string[];
  reasons: string[];
  corroborationKinds: number;
  reliability: ObservationReliability;
  conflictsWith: string[];
  locator: string | null;
  limitations: string[];
};

export type ProjectedIfcProperty = {
  name: string;
  rawValue: string | null;
  formLabel: string;
  propertySetName: string | null;
  locator: string;
};

export type ProjectedIfcQuantity = {
  name: string;
  kindLabel: string;
  value: number | null;
  rawValue: string | null;
  unitLabel: string | null;
  locator: string;
};

export type ProjectedIfc = {
  attempted: boolean;
  used: boolean;
  schema: string | null;
  schemaFamily: string | null;
  projectName: string | null;
  projectLocator: string | null;
  siteNames: string[];
  buildingNames: string[];
  storeys: ProjectedIfcSpatial[];
  storeyCount: number;
  spaces: ProjectedIfcSpatial[];
  spaceCount: number;
  systems: Array<{ name: string | null; entityType: string; memberCount: number; locator: string }>;
  systemCount: number;
  elements: ProjectedIfcElement[];
  elementCount: number;
  types: Array<{ name: string | null; entityType: string; locator: string }>;
  properties: ProjectedIfcProperty[];
  propertyCount: number;
  quantities: ProjectedIfcQuantity[];
  quantityCount: number;
  materials: Array<{ name: string | null; locator: string }>;
  units: Array<{ label: string | null; unitType: string | null; declared: boolean }>;
  documentReferences: Array<{ name: string | null; location: string | null; opened: false; locator: string }>;
  classifications: Array<{ name: string | null; identification: string | null; locator: string }>;
  candidates: ProjectedIfcCandidate[];
  candidateCount: number;
  citedLocators: string[];
  entityCount: number;
  truncated: boolean;
  limitations: string[];
};

export const GOVERNANCE_STATEMENTS_IFC = [
  "observed values are not approved, verified, or selected",
  "declared IFC quantities were preserved as the model stored them; no length, area, volume, or equipment count was calculated from geometry",
  "units were read only from the file's own declaration and were never inferred or converted",
  "entity, element, and space totals are ingestion metrics describing how much of the file was read; no equipment was counted and no quantity, requirement, BOM, quotation line, product selection, supplier, or procurement record was created",
] as const;

const SPATIAL_LABEL: Record<string, { en: string; ar: string }> = {
  PROJECT: { en: "project", ar: "المشروع" },
  SITE: { en: "site", ar: "الموقع" },
  BUILDING: { en: "building", ar: "المبنى" },
  BUILDING_STOREY: { en: "storey", ar: "الطابق" },
  SPACE: { en: "space", ar: "الفراغ" },
};

const SEMANTIC_SOURCE_LABEL: Record<string, { en: string; ar: string }> = {
  ENTITY_TYPE: { en: "the IFC entity class", ar: "فئة كيان IFC" },
  NAME: { en: "a name", ar: "اسم" },
  OBJECT_TYPE: { en: "an object type", ar: "نوع كائن" },
  TAG: { en: "a tag", ar: "وسم" },
  PREDEFINED_TYPE: { en: "a predefined type", ar: "نوع معرّف مسبقاً" },
  ASSIGNED_TYPE: { en: "an assigned type object", ar: "كائن نوع معيّن" },
  PROPERTY_VALUE: { en: "a property value", ar: "قيمة خاصية" },
  SYSTEM_MEMBERSHIP: { en: "system membership", ar: "عضوية نظام" },
  CLASSIFICATION: { en: "a classification", ar: "تصنيف" },
  MATERIAL: { en: "material evidence", ar: "دليل مادة" },
};

const QUANTITY_KIND_LABEL: Record<string, { en: string; ar: string }> = {
  LENGTH: { en: "length", ar: "طول" },
  AREA: { en: "area", ar: "مساحة" },
  VOLUME: { en: "volume", ar: "حجم" },
  COUNT: { en: "count", ar: "عدد" },
  WEIGHT: { en: "weight", ar: "وزن" },
  TIME: { en: "time", ar: "زمن" },
  OTHER: { en: "quantity", ar: "كمية" },
};

const PROPERTY_FORM_LABEL: Record<string, string> = {
  SINGLE_VALUE: "single value",
  ENUMERATED_VALUE: "enumerated value",
  LIST_VALUE: "list value",
  BOUNDED_VALUE: "bounded value",
  REFERENCE_VALUE: "reference value",
  OTHER: "property",
};

function sourceLabel(source: string, arabic: boolean): string {
  const entry = SEMANTIC_SOURCE_LABEL[source];
  return entry ? entry[arabic ? "ar" : "en"] : source;
}

export function emptyProjectedIfc(): ProjectedIfc {
  return {
    attempted: false,
    used: false,
    schema: null,
    schemaFamily: null,
    projectName: null,
    projectLocator: null,
    siteNames: [],
    buildingNames: [],
    storeys: [],
    storeyCount: 0,
    spaces: [],
    spaceCount: 0,
    systems: [],
    systemCount: 0,
    elements: [],
    elementCount: 0,
    types: [],
    properties: [],
    propertyCount: 0,
    quantities: [],
    quantityCount: 0,
    materials: [],
    units: [],
    documentReferences: [],
    classifications: [],
    candidates: [],
    candidateCount: 0,
    citedLocators: [],
    entityCount: 0,
    truncated: false,
    limitations: [],
  };
}

function projectSpatial(record: {
  kind: string;
  name: string | null;
  longName: string | null;
  globalId: string | null;
  stepId: number;
  locator: string;
}): ProjectedIfcSpatial {
  const labels = SPATIAL_LABEL[record.kind] ?? { en: record.kind.toLowerCase(), ar: record.kind };
  return {
    kind: record.kind,
    kindLabel: labels.en,
    kindLabelArabic: labels.ar,
    name: record.name,
    longName: record.longName,
    globalId: record.globalId,
    stepId: record.stepId,
    locator: record.locator,
  };
}

export function projectIfcAnalysis(analysis: IfcAnalysis | null): ProjectedIfc {
  if (!analysis) return emptyProjectedIfc();
  const inspection = analysis.inspection;
  const storeys = inspection.storeys.slice(0, MAX_PROJECTED_IFC_STOREYS).map(projectSpatial);
  const spaces = inspection.spaces.slice(0, MAX_PROJECTED_IFC_SPACES).map(projectSpatial);
  const systems = inspection.systems.slice(0, MAX_PROJECTED_IFC_SYSTEMS).map((system) => ({
    name: system.name,
    entityType: system.entityType,
    memberCount: system.memberLocators.length,
    locator: system.locator,
  }));
  const elements = inspection.elements.slice(0, MAX_PROJECTED_IFC_ELEMENTS).map((element) => ({
    entityType: element.entityType,
    name: element.name,
    tag: element.tag,
    globalId: element.globalId,
    objectType: element.objectType,
    typeName: element.typeName,
    stepId: element.stepId,
    locator: element.locator,
    containerLocator: element.containerLocator,
  }));
  const candidates = analysis.candidates.slice(0, MAX_PROJECTED_IFC_CANDIDATES);
  const properties = inspection.properties.slice(0, MAX_PROJECTED_IFC_PROPERTIES);
  const quantities = inspection.quantities.slice(0, MAX_PROJECTED_IFC_QUANTITIES);

  const citedLocators: string[] = [];
  const cite = (locator: string) => {
    if (citedLocators.length < MAX_PROJECTED_IFC_CITATIONS && !citedLocators.includes(locator)) citedLocators.push(locator);
  };
  if (inspection.project) cite(inspection.project.locator);
  for (const storey of storeys) cite(storey.locator);
  for (const candidate of candidates) for (const locator of candidate.evidenceLocators) cite(locator);
  for (const element of elements) cite(element.locator);

  return {
    attempted: true,
    used: inspection.entityCount > 0,
    schema: inspection.document.schema.declared,
    schemaFamily: inspection.document.schema.family,
    projectName: inspection.project?.name ?? null,
    projectLocator: inspection.project?.locator ?? null,
    siteNames: inspection.sites.map((site) => site.name).filter((name): name is string => Boolean(name)).slice(0, 4),
    buildingNames: inspection.buildings.map((building) => building.name).filter((name): name is string => Boolean(name)).slice(0, 4),
    storeys,
    storeyCount: inspection.storeys.length,
    spaces,
    spaceCount: inspection.spaces.length,
    systems,
    systemCount: inspection.systems.length,
    elements,
    elementCount: inspection.elements.length,
    types: inspection.types.slice(0, 8).map((type) => ({ name: type.name, entityType: type.entityType, locator: type.locator })),
    properties: properties.map((property) => ({
      name: property.name,
      rawValue: property.rawValue,
      formLabel: PROPERTY_FORM_LABEL[property.form] ?? "property",
      propertySetName: property.propertySetName,
      locator: property.locator,
    })),
    propertyCount: inspection.properties.length,
    quantities: quantities.map((quantity) => ({
      name: quantity.name,
      kindLabel: QUANTITY_KIND_LABEL[quantity.kind]?.en ?? "quantity",
      value: quantity.value,
      rawValue: quantity.rawValue,
      unitLabel: quantity.unitLabel,
      locator: quantity.locator,
    })),
    quantityCount: inspection.quantities.length,
    materials: inspection.materials.filter((material) => material.name).slice(0, MAX_PROJECTED_IFC_MATERIALS).map((material) => ({
      name: material.name,
      locator: material.locator,
    })),
    units: inspection.units.filter((unit) => unit.entityType !== "IFCUNITASSIGNMENT").slice(0, 6).map((unit) => ({
      label: unit.label,
      unitType: unit.unitType,
      declared: unit.declared,
    })),
    documentReferences: inspection.documentReferences.slice(0, MAX_PROJECTED_IFC_REFERENCES).map((reference) => ({
      name: reference.name,
      location: reference.location,
      opened: false as const,
      locator: reference.locator,
    })),
    classifications: inspection.classifications.slice(0, MAX_PROJECTED_IFC_REFERENCES).map((item) => ({
      name: item.name,
      identification: item.identification,
      locator: item.locator,
    })),
    candidates: candidates.map((candidate) => ({
      id: candidate.id,
      label: candidate.label,
      evidenceKinds: candidate.sources.map((source) => sourceLabel(source, false)),
      evidenceKindsArabic: candidate.sources.map((source) => sourceLabel(source, true)),
      evidenceLocators: candidate.evidenceLocators,
      reasons: candidate.reasons,
      corroborationKinds: candidate.corroborationCount,
      reliability: candidate.reliability,
      conflictsWith: candidate.conflictsWith,
      locator: candidate.evidenceLocators[0] ?? null,
      limitations: candidate.limitations,
    })),
    candidateCount: analysis.candidates.length,
    citedLocators,
    entityCount: inspection.entityCount,
    truncated: analysis.truncated,
    limitations: analysis.limitations.slice(0, MAX_PROJECTED_LIMITATIONS_LOCAL),
  };
}

const NO_COUNT_SENTENCE = {
  en: "No equipment was counted from this model, and no quantity, requirement, bill of materials, quotation line, product selection, supplier, or procurement record was created.",
  ar: "لم يُحصر أي معدّة من هذا النموذج، ولم يُنشأ أي كمية أو متطلب أو جدول مواد أو بند عرض سعر أو اختيار منتج أو مورّد أو سجل توريد.",
};

const OBSERVED_ONLY_SENTENCE = {
  en: "These are observed BIM readings only, not approved equipment and not selected products.",
  ar: "هذه قراءات مرصودة من نموذج BIM فقط، وليست معدّات معتمدة ولا منتجات مختارة.",
};

const TRUNCATION_SENTENCE = {
  en: "I inspected a bounded part of this IFC model, so what follows is a truncated view rather than the whole file.",
  ar: "فحصت جزءاً محدداً من نموذج IFC هذا، لذا ما يلي عرض مقتطع وليس الملف كاملاً.",
};

function ifcStatusWord(status: ArtifactInspectionStatus, ar: boolean): string {
  const map: Record<ArtifactInspectionStatus, { ar: string; en: string }> = {
    INSPECTED: { ar: "تم الفحص", en: "inspected" },
    INSPECTED_NO_MACHINE_READABLE_TEXT: { ar: "تم فحص البنية بدون نص مقروء آلياً", en: "inspected with no machine-readable text" },
    NOT_INSPECTED: { ar: "لم يتم الفحص", en: "not inspected" },
    UNAVAILABLE: { ar: "الفحص غير متاح", en: "unavailable" },
    ENCRYPTED: { ar: "مشفر", en: "encrypted" },
  };
  return map[status][ar ? "ar" : "en"];
}

function candidateSentence(candidate: ProjectedIfcCandidate, ar: boolean): string {
  const kinds = ar ? candidate.evidenceKindsArabic : candidate.evidenceKinds;
  const joined = kinds.length > 1
    ? (ar ? `${kinds.slice(0, -1).join("، ")} و${kinds[kinds.length - 1]}` : `${kinds.slice(0, -1).join(", ")} and ${kinds[kinds.length - 1]}`)
    : kinds[0] ?? "";
  return ar
    ? `استناداً إلى ${joined} أستطيع قراءة '${candidate.label}' كدليل BIM قابل للمراجعة، وليس كاختيار منتج معتمد ولا ككمية.`
    : `Based on ${joined} I can read '${candidate.label}' as reviewable BIM evidence, not as an approved product selection or a quantity.`;
}

function quantitySentence(quantity: ProjectedIfcQuantity, ar: boolean): string | null {
  if (quantity.value === null && !quantity.rawValue) return null;
  const shown = quantity.rawValue ?? String(quantity.value);
  const unit = quantity.unitLabel ? ` ${quantity.unitLabel}` : "";
  return ar
    ? `يخزّن النموذج كمية معلنة اسمها '${quantity.name}' وقيمتها ${shown}${unit}. لم أحسب هذه الكمية من الهندسة ولم أتحقق منها.`
    : `The IFC contains a declared quantity '${quantity.name} = ${shown}${unit}'. I did not calculate or verify that ${quantity.kindLabel} from geometry.`;
}

export function renderIfcBrief(summary: ArtifactInspectionSummary, locale: "ar" | "en" = "en"): string {
  const ar = locale === "ar";
  const ifc = summary.ifc;
  const parts: string[] = [];

  parts.push(ar
    ? `قرأت الملف "${summary.filename}" (${ifcStatusWord(summary.status, ar)}).`
    : `I read "${summary.filename}" (${ifcStatusWord(summary.status, ar)}).`);

  if (ifc.schema) {
    parts.push(ar
      ? `يُصرّح نموذج IFC بالمخطط ${ifc.schema}.`
      : `The IFC model declares schema ${ifc.schema}.`);
  }

  const building = ifc.buildingNames[0];
  if (building && ifc.storeyCount > 0) {
    parts.push(ar
      ? `يحتوي المبنى '${building}' على ${ifc.storeyCount} طابق${ifc.storeyCount === 1 ? "" : "اً"}.`
      : `The IFC model contains a building with ${ifc.storeyCount} storey${ifc.storeyCount === 1 ? "" : "s"}.`);
  } else if (ifc.storeyCount > 0) {
    parts.push(ar
      ? `يحتوي النموذج على مبنى من ${ifc.storeyCount} طابق${ifc.storeyCount === 1 ? "" : "اً"}.`
      : `The IFC model declares schema ${ifc.schema ?? "unknown"} and contains a building with ${ifc.storeyCount} storey${ifc.storeyCount === 1 ? "" : "s"}.`.replace(`declares schema unknown and `, ""));
  }

  if (ifc.projectName) {
    parts.push(ar ? `اسم المشروع المعلن هو '${ifc.projectName}'.` : `The declared project name is '${ifc.projectName}'.`);
  }

  const space = ifc.spaces[0];
  if (space) {
    const label = space.longName || space.name;
    if (label) {
      parts.push(ar
        ? `وجدت فراغاً باسم '${label}' ولم أحسب مساحته أو حجمه من الهندسة.`
        : `I found a space named '${label}'. I did not calculate its area or volume from geometry.`);
    }
  }

  const element = ifc.elements.find((item) => item.name) ?? ifc.elements[0];
  if (element) {
    const typeBit = element.typeName ? (ar ? ` ومُصنَّف كـ '${element.typeName}'` : ` and is typed as '${element.typeName}'`) : "";
    const system = ifc.systems[0];
    const systemBit = system?.name
      ? (ar ? ` داخل نظام '${system.name}'` : ` inside the ${system.name} system`)
      : "";
    parts.push(ar
      ? `العنصر ${element.locator} اسمه '${element.name ?? element.entityType}'${typeBit}${systemBit}. أتعامل مع ذلك كدليل BIM قابل للمراجعة، وليس كمنتج معتمد ولا ككمية.`
      : `The element ${element.locator} is named '${element.name ?? element.entityType}'${typeBit}${systemBit}. I am treating that as reviewable BIM evidence, not an approved product or quantity.`);
  }

  const manufacturer = ifc.properties.find((property) => /^manufacturer$/iu.test(property.name) && property.rawValue);
  if (manufacturer) {
    parts.push(ar
      ? `يخزّن النموذج صراحةً خاصية 'Manufacturer = ${manufacturer.rawValue}'. هذه بيانات وصفية مرصودة من النموذج ولا تُنشئ مورّداً ولا مُصنِّعاً مختاراً.`
      : `The model explicitly stores a property 'Manufacturer = ${manufacturer.rawValue}'. This is observed model metadata and does not create a supplier or selected manufacturer.`);
  }
  const modelRef = ifc.properties.find((property) => /modelreference|model/iu.test(property.name) && property.rawValue);
  if (modelRef) {
    parts.push(ar
      ? `يخزّن النموذج خاصية '${modelRef.name} = ${modelRef.rawValue}' كبيانات مرصودة فقط، وليست اختيار منتج.`
      : `The model stores '${modelRef.name} = ${modelRef.rawValue}' as observed metadata only, not a product selection.`);
  }

  const quantity = ifc.quantities.find((item) => item.value !== null || item.rawValue) ?? ifc.quantities[0];
  if (quantity) {
    const sentence = quantitySentence(quantity, ar);
    if (sentence) parts.push(sentence);
  }

  const material = ifc.materials[0];
  if (material?.name) {
    parts.push(ar
      ? `يرتبط عنصر بمادة اسمها '${material.name}'؛ وهذا دليل BIM مرصود وليس بند شراء.`
      : `An element is associated with the material '${material.name}'. That is observed BIM evidence, not a purchase item.`);
  }

  const unitsDeclared = ifc.units.filter((unit) => unit.declared && unit.label);
  if (unitsDeclared.length) {
    parts.push(ar
      ? `يُصرّح النموذج بوحدة '${unitsDeclared[0]!.label}'. لم أستنتج أي وحدة ناقصة ولم أحوّل أي وحدة.`
      : `The model declares the unit '${unitsDeclared[0]!.label}'. I did not infer missing units and I performed no unit conversion.`);
  } else if (ifc.attempted) {
    parts.push(ar
      ? `حيث لم تُعلن وحدة، بقيت الوحدة مجهولة ولم تُستنتج من المشروع أو الإعدادات المحلية.`
      : `Where no unit is declared it remains unknown; I did not infer it from locale or project settings.`);
  }

  const narrated = [...ifc.candidates].sort((left, right) => right.corroborationKinds - left.corroborationKinds).slice(0, 2);
  for (const candidate of narrated) parts.push(candidateSentence(candidate, ar));

  const conflicted = ifc.candidates.find((candidate) => candidate.conflictsWith.length > 0);
  if (conflicted) {
    const counterpart = ifc.candidates.find((candidate) => candidate.id === conflicted.conflictsWith[0]);
    if (counterpart) {
      parts.push(ar
        ? `القراءتان '${conflicted.label}' و'${counterpart.label}' تستندان إلى الدليل نفسه وتختلفان؛ أبقيت الاثنتين ولم أرجّح واحدة على الأخرى.`
        : `The readings '${conflicted.label}' and '${counterpart.label}' rest on the same evidence and disagree; I kept both and did not prefer one over another.`);
    }
  }

  if (ifc.documentReferences.length) {
    parts.push(ar
      ? `يشير النموذج إلى مستند خارجي لم يُفتح.`
      : `The model references an external document which was not opened.`);
  }

  if (ifc.truncated) parts.push(TRUNCATION_SENTENCE[locale]);
  parts.push(NO_COUNT_SENTENCE[locale]);
  if (ifc.candidates.length) parts.push(OBSERVED_ONLY_SENTENCE[locale]);

  const limitation = ifc.limitations.find((entry) => entry !== ifc.limitations[0]) ?? ifc.limitations[0];
  if (limitation) parts.push(ar ? `قيود: ${arabicIfcLimitation(limitation)}` : `Limitation: ${limitation}`);
  return parts.join(" ");
}

const IFC_LIMITATION_ARABIC: ReadonlyMap<string, string> = new Map([
  [IFC_BASELINE_LIMITATION, "يستند دليل BIM إلى معرّف كيان STEP وGlobalId ونوع الكيان والاسم بدلاً من أرقام الصفحات؛ وحوفظ على الكميات المعلنة كما خزّنها النموذج ولم تُحسب من الهندسة، ولم تُستنتج أو تُحوّل أي وحدة، وأي إجمالي للكيانات ليس كمية هندسية"],
  [IFC_NO_COUNT_LIMITATION, "إجماليات الكيانات والعناصر والفراغات في هذا الفحص مقاييس قراءة تصف كم قرأ VOKA من الملف؛ وليست حصراً للمعدّات ولا كميات ولا نتائج استخلاص"],
  [IFC_SEMANTIC_BASELINE_LIMITATION, "القراءات الدلالية المرشحة هي قراءات مرصودة من BIM فقط: غير معتمدة وغير مختارة وغير محصورة، ولا تُرقّى أبداً إلى متطلب أو جدول مواد أو بند عرض سعر أو اختيار منتج أو مورّد أو سجل توريد"],
  [IFC_QUANTITY_LIMITATION, "كميات IFC المعلنة بيانات وصفية خزّنها النموذج؛ ولم يحسبها VOKA أو يعِد حسابها أو يتحقق منها من الهندسة"],
  [IFC_EXTERNAL_REFERENCE_LIMITATION, "يشير النموذج إلى مستند خارجي لم يُفتح ولم يُجلب ولم يُحل؛ وسُجّلت هذه البيانات الوصفية فقط"],
]);

const IFC_UNKNOWN_LIMITATION_ARABIC = "يوجد قيد إضافي على هذا الفحص مسجّل في السجل المهيكل للنموذج";

export function arabicIfcLimitation(limitation: string): string {
  const exact = IFC_LIMITATION_ARABIC.get(limitation);
  if (exact) return exact;
  if (/inspected product entit/u.test(limitation)) {
    const count = limitation.match(/(\d+)/u)?.[1];
    return count ? `يحتوي النموذج على ${count} كيان منتج تم فحصه` : IFC_UNKNOWN_LIMITATION_ARABIC;
  }
  if (/more than (\d+)/u.test(limitation)) {
    const count = limitation.match(/more than (\d+)/u)?.[1];
    return `تم تجاوز حد الأمان ${count}؛ ولم يُحتفظ بالباقي`;
  }
  if (/schema/u.test(limitation) && /IFC4X3/u.test(limitation)) {
    return "يُصرّح الملف بمخطط IFC4X3؛ وفحص VOKA الدليل العام للكيانات فقط دون تطبيق دلالات خاصة بهذا المخطط";
  }
  if (/did not end with END-ISO/u.test(limitation)) {
    return "لم ينتهِ الملف بـ END-ISO-10303-21، لذلك قد يكون مقتطعاً أو مكتوب جزئياً";
  }
  return IFC_UNKNOWN_LIMITATION_ARABIC;
}

export function unsupportedIfcMessage(decision: { format: string; reason: string }, locale: "ar" | "en"): string {
  const ar = locale === "ar";
  if (ar) return `لم أفتح هذا الملف كنموذج IFC: ${decision.reason}`;
  return `I did not open this file as an IFC model: ${decision.reason}`;
}

export { SEMANTIC_SOURCE_LABEL as IFC_SEMANTIC_SOURCE_LABEL };
