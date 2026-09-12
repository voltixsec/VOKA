import {
  DXF_BASELINE_LIMITATION,
  DXF_NO_COUNT_LIMITATION,
  DXF_SEMANTIC_BASELINE_LIMITATION,
} from "@/src/domain/source-artifact";
import type {
  DxfAnalysis,
  DxfSpace,
  ObservationReliability,
} from "@/src/domain/source-artifact";
import type { ArtifactInspectionStatus, ArtifactInspectionSummary } from "./ArtifactInspectionProjection";
import { renderDerivationLineageSentence } from "./DerivationProjection";

/**
 * Kept local rather than imported from the shared projection module: this
 * module is imported by it at runtime, and a two-way runtime import would
 * create a cycle. The value matches the shared cap.
 */
const MAX_PROJECTED_LIMITATIONS_LOCAL = 8;

/**
 * Phase 2A-7: bounded, governed projection of an inspected ASCII DXF drawing.
 *
 * The deterministic inspection may hold tens of thousands of entities. The
 * assistant never sees that: this module distils it into a small, reviewable
 * record — drawing metadata, declared units, model-space and paper-space
 * summaries, the significant layers and blocks, bounded semantic candidates,
 * relevant text and dimension evidence, exact CAD citations, and an explicit
 * statement of everything that was truncated.
 *
 * Hard rules:
 * - no raw enumeration is ever printed into user-facing prose. Every space,
 *   reliability, and source token is translated into plain words in both
 *   English and Arabic;
 * - every candidate stays OBSERVED. The projection cannot approve a device,
 *   select a product, count equipment, or create a commercial or engineering
 *   record;
 * - a dimension is described as a value the drawing stored. The brief never
 *   says VOKA measured, recalculated, or verified it;
 * - units are described only as declared. When the drawing declared none, the
 *   brief says the units are unknown and that they were not inferred;
 * - truncation is stated, never hidden.
 */

export const MAX_PROJECTED_DXF_LAYERS = 8;
export const MAX_PROJECTED_DXF_BLOCKS = 8;
export const MAX_PROJECTED_DXF_CANDIDATES = 6;
export const MAX_PROJECTED_DXF_TEXTS = 6;
export const MAX_PROJECTED_DXF_DIMENSIONS = 6;
export const MAX_PROJECTED_DXF_ENTITIES = 12;
export const MAX_PROJECTED_DXF_ATTRIBUTES = 8;
export const MAX_PROJECTED_DXF_REFERENCES = 4;
export const MAX_PROJECTED_DXF_CITATIONS = 12;

export type ProjectedDxfSpace = {
  space: DxfSpace;
  /** Plain words for the space; the enum token is never printed. */
  label: string;
  labelArabic: string;
  layoutName: string | null;
  entityCount: number;
  layerNames: string[];
  insertedBlockNames: string[];
  textCount: number;
  dimensionCount: number;
  insertCount: number;
  truncated: boolean;
  locator: string;
  limitations: string[];
};

export type ProjectedDxfLayer = {
  name: string;
  handle: string | null;
  colorIndex: number | null;
  lineType: string | null;
  off: boolean;
  frozen: boolean;
  locked: boolean;
  reserved: boolean;
  /** Ingestion metric: how much of the drawing VOKA read on this layer. */
  observedEntityCount: number;
  locator: string;
  reliability: ObservationReliability;
  limitations: string[];
};

export type ProjectedDxfBlock = {
  name: string;
  handle: string | null;
  anonymous: boolean;
  externalReference: boolean;
  containedEntityCount: number;
  insertCount: number;
  attributeDefinitionTags: string[];
  /** Space this block defines, in plain words; the enum token is never printed. */
  spaceLabel: string;
  locator: string;
  reliability: ObservationReliability;
  limitations: string[];
};

export type ProjectedDxfInsert = {
  id: string;
  blockName: string;
  blockMissing: boolean;
  layerName: string | null;
  spaceLabel: string;
  insertionPoint: { x: number | null; y: number | null; z: number | null } | null;
  scaleX: number | null;
  scaleY: number | null;
  scaleZ: number | null;
  rotationDegrees: number | null;
  attributes: Array<{ tag: string; value: string }>;
  locator: string;
  limitations: string[];
};

export type ProjectedDxfText = {
  id: string;
  kind: "TEXT" | "MTEXT";
  raw: string;
  normalized: string;
  normalizedChanged: boolean;
  layerName: string | null;
  spaceLabel: string;
  height: number | null;
  rotationDegrees: number | null;
  locator: string;
  reliability: ObservationReliability;
  limitations: string[];
};

export type ProjectedDxfDimension = {
  id: string;
  /** Verbatim value the drawing stored. Never recomputed by VOKA. */
  measurement: number | null;
  displayText: string | null;
  displayIsPlaceholder: boolean;
  typeLabel: string | null;
  styleName: string | null;
  layerName: string | null;
  spaceLabel: string;
  locator: string;
  reliability: ObservationReliability;
  limitations: string[];
};

export type ProjectedDxfAttribute = {
  id: string;
  kind: "ATTDEF" | "ATTRIB";
  tag: string;
  prompt: string | null;
  value: string;
  layerName: string | null;
  blockName: string | null;
  insertHandle: string | null;
  locator: string;
  limitations: string[];
};

export type ProjectedDxfCandidate = {
  id: string;
  label: string;
  /** Plain words for the evidence kinds; the enum tokens are never printed. */
  evidenceKinds: string[];
  evidenceKindsArabic: string[];
  evidenceLocators: string[];
  reasons: string[];
  /** Number of distinct evidence KINDS. Deliberately not an instance count. */
  corroborationKinds: number;
  reliability: ObservationReliability;
  conflictsWith: string[];
  locator: string | null;
  limitations: string[];
};

export type ProjectedDxfEntity = {
  id: string;
  /** Verbatim entity type as the drawing wrote it. */
  entityType: string;
  handle: string | null;
  ownerHandle: string | null;
  layerName: string | null;
  spaceLabel: string;
  blockName: string | null;
  /** Which raw geometry fields the drawing carried. */
  geometryKind: string;
  hasGeometry: boolean;
  locator: string;
  reliability: ObservationReliability;
  limitations: string[];
};

export type ProjectedDxf = {
  attempted: boolean;
  used: boolean;
  /** Verbatim `$ACADVER`, e.g. "AC1027". */
  versionCode: string | null;
  versionLabel: string | null;
  /** Declared units. `declared` is false when the drawing stated none. */
  units: {
    declared: boolean;
    code: number | null;
    name: string | null;
    nameArabic: string | null;
    raw: string | null;
    limitations: string[];
  };
  codePage: string | null;
  sectionsPresent: string[];
  /** Model space and paper space, always separate. Both are always present. */
  spaces: ProjectedDxfSpace[];
  modelSpaceEntityCount: number;
  paperSpaceEntityCount: number;
  layers: ProjectedDxfLayer[];
  layerCount: number;
  blocks: ProjectedDxfBlock[];
  blockCount: number;
  inserts: ProjectedDxfInsert[];
  insertCount: number;
  texts: ProjectedDxfText[];
  textCount: number;
  dimensions: ProjectedDxfDimension[];
  dimensionCount: number;
  attributes: ProjectedDxfAttribute[];
  attributeCount: number;
  entities: ProjectedDxfEntity[];
  /** Total entities read. An ingestion metric, never an equipment count. */
  entityCount: number;
  entityRecordsRetained: number;
  unmodelledEntityTypes: string[];
  candidates: ProjectedDxfCandidate[];
  candidateCount: number;
  externalReferences: Array<{ blockName: string; path: string; looksRemote: boolean; overlay: boolean; locator: string }>;
  /** Bounded exact CAD locators backing the projection. Never page numbers. */
  citedLocators: string[];
  truncated: boolean;
  limitations: string[];
};

/**
 * Governance statements for the CAD channel. They replace the generic document
 * statements because a drawing reading makes different promises: it preserved
 * coordinates and declared units exactly, measured nothing, and counted nothing
 * as a quantity.
 */
export const GOVERNANCE_STATEMENTS_DXF = [
  "observed values are not approved, verified, or selected",
  "drawing coordinates, radii, angles, and dimension values were preserved exactly as the drawing stored them; no length, area, or volume was derived and no dimension was recalculated or verified",
  "drawing units were read only from the file's own declaration and were never inferred from coordinates, extents, the tenant, or project settings",
  "entity, insert, and text totals are ingestion metrics describing how much of the file was read; no equipment was counted and no quantity was produced",
] as const;

export const SPACE_LABEL_DXF: Record<DxfSpace, { en: string; ar: string }> = {
  MODEL_SPACE: { en: "model space", ar: "فضاء النموذج" },
  PAPER_SPACE: { en: "paper space", ar: "فضاء الورقة" },
  UNKNOWN_SPACE: { en: "an unattributed space", ar: "فضاء غير منسوب" },
};

const SEMANTIC_SOURCE_LABEL: Record<string, { en: string; ar: string }> = {
  BLOCK_NAME: { en: "a block name", ar: "اسم كتلة" },
  LAYER_NAME: { en: "a layer name", ar: "اسم طبقة" },
  ATTRIBUTE_VALUE: { en: "an attribute value", ar: "قيمة سمة" },
  NEARBY_TEXT: { en: "nearby drawing text", ar: "نص قريب في المخطط" },
  ENTITY_TYPE: { en: "an entity type", ar: "نوع عنصر" },
  REPEATED_LABEL: { en: "a repeated label", ar: "تسمية متكررة" },
};

function sourceLabel(source: string, arabic: boolean): string {
  const entry = SEMANTIC_SOURCE_LABEL[source];
  return entry ? entry[arabic ? "ar" : "en"] : source;
}

export function emptyProjectedDxf(): ProjectedDxf {
  return {
    attempted: false,
    used: false,
    versionCode: null,
    versionLabel: null,
    units: { declared: false, code: null, name: null, nameArabic: null, raw: null, limitations: [] },
    codePage: null,
    sectionsPresent: [],
    spaces: [],
    modelSpaceEntityCount: 0,
    paperSpaceEntityCount: 0,
    layers: [],
    layerCount: 0,
    blocks: [],
    blockCount: 0,
    inserts: [],
    insertCount: 0,
    texts: [],
    textCount: 0,
    dimensions: [],
    dimensionCount: 0,
    attributes: [],
    attributeCount: 0,
    entities: [],
    entityCount: 0,
    entityRecordsRetained: 0,
    unmodelledEntityTypes: [],
    candidates: [],
    candidateCount: 0,
    externalReferences: [],
    citedLocators: [],
    truncated: false,
    limitations: [],
  };
}

/** Projects the deterministic analysis into the bounded assistant-facing record. */
export function projectDxfAnalysis(analysis: DxfAnalysis | null): ProjectedDxf {
  if (!analysis) return emptyProjectedDxf();
  const inspection = analysis.inspection;
  const layers = inspection.layers.slice(0, MAX_PROJECTED_DXF_LAYERS);
  const blocks = inspection.blocks
    .filter((block) => !block.anonymous)
    .slice(0, MAX_PROJECTED_DXF_BLOCKS);
  const inserts = inspection.inserts.slice(0, MAX_PROJECTED_DXF_ENTITIES);
  const texts = inspection.texts.slice(0, MAX_PROJECTED_DXF_TEXTS);
  const dimensions = inspection.dimensions.slice(0, MAX_PROJECTED_DXF_DIMENSIONS);
  const attributes = inspection.attributes.slice(0, MAX_PROJECTED_DXF_ATTRIBUTES);
  const entities = inspection.entities.slice(0, MAX_PROJECTED_DXF_ENTITIES);
  const candidates = analysis.candidates.slice(0, MAX_PROJECTED_DXF_CANDIDATES);

  // Exact CAD locators only. A drawing has no pages, so a page number here
  // would be invented; the locator is what makes each claim traceable.
  const citedLocators: string[] = [];
  const cite = (locator: string) => {
    if (citedLocators.length < MAX_PROJECTED_DXF_CITATIONS && !citedLocators.includes(locator)) citedLocators.push(locator);
  };
  // Space locators come first. They are the primary provenance for a drawing —
  // the place a reviewer opens first — and a bounded citation list filled with
  // layer and block locators would otherwise push them out entirely.
  cite(inspection.spaces.MODEL_SPACE.locator);
  if (inspection.spaces.PAPER_SPACE.entityCount > 0) cite(inspection.spaces.PAPER_SPACE.locator);
  for (const layer of layers) cite(layer.locator);
  for (const block of blocks) cite(block.locator);
  for (const candidate of candidates) for (const locator of candidate.evidenceLocators) cite(locator);
  for (const dimension of dimensions) cite(dimension.locator);
  for (const text of texts) cite(text.locator);

  return {
    attempted: true,
    used: inspection.entityCount > 0 || inspection.layers.length > 0 || inspection.blocks.length > 0,
    versionCode: inspection.document.version.code,
    versionLabel: inspection.document.version.label,
    units: {
      declared: inspection.document.units.declared,
      code: inspection.document.units.code,
      name: inspection.document.units.name,
      nameArabic: inspection.document.units.nameArabic,
      raw: inspection.document.units.raw,
      limitations: inspection.document.units.limitations,
    },
    codePage: inspection.document.codePage,
    sectionsPresent: inspection.document.sectionsPresent,
    spaces: (["MODEL_SPACE", "PAPER_SPACE", "UNKNOWN_SPACE"] as DxfSpace[]).map((space) => {
      const summary = inspection.spaces[space];
      return {
        space,
        label: SPACE_LABEL_DXF[space].en,
        labelArabic: SPACE_LABEL_DXF[space].ar,
        layoutName: summary.layoutName,
        entityCount: summary.entityCount,
        layerNames: summary.layerNames.slice(0, MAX_PROJECTED_DXF_LAYERS),
        insertedBlockNames: summary.insertedBlockNames.slice(0, MAX_PROJECTED_DXF_BLOCKS),
        textCount: summary.textCount,
        dimensionCount: summary.dimensionCount,
        insertCount: summary.insertCount,
        truncated: summary.truncated,
        locator: summary.locator,
        limitations: summary.limitations,
      };
    }),
    modelSpaceEntityCount: inspection.spaces.MODEL_SPACE.entityCount,
    paperSpaceEntityCount: inspection.spaces.PAPER_SPACE.entityCount,
    layers: layers.map((layer) => ({
      name: layer.name,
      handle: layer.handle,
      colorIndex: layer.colorIndex,
      lineType: layer.lineType,
      off: layer.off,
      frozen: layer.frozen,
      locked: layer.locked,
      reserved: layer.reserved,
      observedEntityCount: layer.observedEntityCount,
      locator: layer.locator,
      reliability: layer.reliability,
      limitations: layer.limitations,
    })),
    layerCount: inspection.layers.length,
    blocks: blocks.map((block) => ({
      name: block.name,
      handle: block.handle,
      anonymous: block.anonymous,
      externalReference: block.externalReference,
      containedEntityCount: block.containedEntityCount,
      insertCount: block.insertCount,
      attributeDefinitionTags: block.attributeDefinitions.map((definition) => definition.tag).slice(0, MAX_PROJECTED_DXF_ATTRIBUTES),
      spaceLabel: SPACE_LABEL_DXF[block.space].en,
      locator: block.locator,
      reliability: block.reliability,
      limitations: block.limitations,
    })),
    blockCount: inspection.blocks.length,
    inserts: inserts.map((insert) => ({
      id: insert.id,
      blockName: insert.blockName,
      blockMissing: insert.blockMissing,
      layerName: insert.layerName,
      spaceLabel: SPACE_LABEL_DXF[insert.space].en,
      insertionPoint: insert.insertionPoint,
      scaleX: insert.scaleX,
      scaleY: insert.scaleY,
      scaleZ: insert.scaleZ,
      rotationDegrees: insert.rotationDegrees,
      attributes: insert.attributes.map((attribute) => ({ tag: attribute.tag, value: attribute.value })),
      locator: insert.locator,
      limitations: insert.limitations,
    })),
    insertCount: inspection.inserts.length,
    texts: texts.map((text) => ({
      id: text.id,
      kind: text.entityType,
      raw: text.raw,
      normalized: text.normalized,
      normalizedChanged: text.normalizedChanged,
      layerName: text.layerName,
      spaceLabel: SPACE_LABEL_DXF[text.space].en,
      height: text.height,
      rotationDegrees: text.rotationDegrees,
      locator: text.locator,
      reliability: text.reliability,
      limitations: text.limitations,
    })),
    textCount: inspection.texts.length,
    dimensions: dimensions.map((dimension) => ({
      id: dimension.id,
      measurement: dimension.measurement,
      displayText: dimension.displayText,
      displayIsPlaceholder: dimension.displayIsPlaceholder,
      typeLabel: dimension.dimensionTypeLabel,
      styleName: dimension.styleName,
      layerName: dimension.layerName,
      spaceLabel: SPACE_LABEL_DXF[dimension.space].en,
      locator: dimension.locator,
      reliability: dimension.reliability,
      limitations: dimension.limitations,
    })),
    dimensionCount: inspection.dimensions.length,
    attributes: attributes.map((attribute) => ({
      id: attribute.id,
      kind: attribute.entityType,
      tag: attribute.tag,
      prompt: attribute.prompt,
      value: attribute.value,
      layerName: attribute.layerName,
      blockName: attribute.blockName,
      insertHandle: attribute.insertHandle,
      locator: attribute.locator,
      limitations: attribute.limitations,
    })),
    attributeCount: inspection.attributes.length,
    entities: entities.map((entity) => ({
      id: entity.evidenceId,
      entityType: entity.entityType,
      handle: entity.handle,
      ownerHandle: entity.ownerHandle,
      layerName: entity.layerName,
      spaceLabel: SPACE_LABEL_DXF[entity.space].en,
      blockName: entity.blockName,
      geometryKind: entity.geometry.kind,
      hasGeometry: entity.geometry.kind !== "NONE",
      locator: entity.locator,
      reliability: entity.reliability,
      limitations: entity.limitations,
    })),
    entityCount: inspection.entityCount,
    entityRecordsRetained: inspection.entityRecordsRetained,
    unmodelledEntityTypes: inspection.unmodelledEntityTypes,
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
    externalReferences: inspection.externalReferences.slice(0, MAX_PROJECTED_DXF_REFERENCES).map((reference) => ({
      blockName: reference.blockName,
      path: reference.path,
      looksRemote: reference.looksRemote,
      overlay: reference.overlay,
      locator: reference.locator,
    })),
    citedLocators,
    truncated: analysis.truncated,
    limitations: analysis.limitations.slice(0, MAX_PROJECTED_LIMITATIONS_LOCAL),
  };
}

// ---------------------------------------------------------------------------
// Plain-language brief (English and Arabic)
// ---------------------------------------------------------------------------

const UNITS_UNKNOWN_SENTENCE = {
  en: "The drawing does not declare its CAD units, so I am treating them as unknown; I did not infer them from coordinates, extents, or project settings.",
  ar: "لا يُصرّح المخطط بوحدات القياس الخاصة به، لذلك أتعامل معها كمجهولة؛ لم أستنتجها من الإحداثيات أو الحدود أو إعدادات المشروع.",
};

const NO_COUNT_SENTENCE = {
  en: "No equipment was counted from this drawing, and no quantity, requirement, bill of materials, quotation line, or procurement record was created.",
  ar: "لم يُحصر أي معدّة من هذا المخطط، ولم يُنشأ أي كمية أو متطلب أو جدول مواد أو بند عرض سعر أو سجل توريد.",
};

const OBSERVED_ONLY_SENTENCE = {
  en: "These are observed drawing readings only, not approved equipment and not selected products.",
  ar: "هذه قراءات مرصودة من المخطط فقط، وليست معدّات معتمدة ولا منتجات مختارة.",
};

const TRUNCATION_SENTENCE = {
  en: "I inspected a bounded part of this drawing, so what follows is a truncated view rather than the whole file.",
  ar: "فحصت جزءاً محدداً من هذا المخطط، لذا ما يلي عرض مقتطع وليس الملف كاملاً.",
};

const SPACES_KEPT_SEPARATE = {
  en: "I kept model space and paper space separate and did not deduplicate one against the other.",
  ar: "أبقيت فضاء النموذج وفضاء الورقة منفصلين ولم أدمج أحدهما بالآخر.",
};

function versionSentence(dxf: ProjectedDxf, ar: boolean): string | null {
  if (!dxf.versionCode) return null;
  const label = dxf.versionLabel ? `${dxf.versionLabel} (${dxf.versionCode})` : dxf.versionCode;
  return ar ? `الملف مخطط DXF نصي بإصدار ${label}.` : `The file is an ASCII DXF drawing, version ${label}.`;
}

function unitsSentence(dxf: ProjectedDxf, ar: boolean): string {
  if (!dxf.units.declared || !dxf.units.name) return UNITS_UNKNOWN_SENTENCE[ar ? "ar" : "en"];
  return ar
    ? `يُصرّح المخطط صراحةً بأن وحدة القياس فيه هي ${dxf.units.nameArabic ?? dxf.units.name}. لم أحوّل أي وحدة.`
    : `The drawing explicitly declares ${dxf.units.name} as its CAD units. I performed no unit conversion.`;
}

function spacesSentence(dxf: ProjectedDxf, ar: boolean): string | null {
  const model = dxf.spaces.find((space) => space.space === "MODEL_SPACE");
  const paper = dxf.spaces.find((space) => space.space === "PAPER_SPACE");
  if (!model && !paper) return null;
  const modelCount = model?.entityCount ?? 0;
  const paperCount = paper?.entityCount ?? 0;
  if (ar) {
    const paperPart = paperCount > 0
      ? ` وفي فضاء الورقة${paper?.layoutName ? ` (${paper.layoutName})` : ""} ${paperCount} عنصراً`
      : "";
    return `يحتوي فضاء النموذج على ${modelCount} عنصراً${paperPart}، وهما مجموعتان من العناصر أبقيتهما منفصلتين.`;
  }
  const paperPart = paperCount > 0
    ? ` and ${paperCount} in paper space${paper?.layoutName ? ` (${paper.layoutName})` : ""}`
    : "";
  return `Model space holds ${modelCount} entit${modelCount === 1 ? "y" : "ies"}${paperPart}, and I kept the two apart.`;
}

function layersSentence(dxf: ProjectedDxf, ar: boolean): string | null {
  const significant = dxf.layers.filter((layer) => !layer.reserved);
  if (!significant.length) return null;
  const listed = significant.slice(0, 4);
  const names = listed.map((layer) => `'${layer.name}'`).join(ar ? "، " : ", ");
  // Counted against the same filtered list the names came from. Comparing it to
  // the total layer count instead would silently fold the reserved layers — the
  // ones deliberately left out of the sentence — back into "more", so the brief
  // would promise layers it had just decided not to name.
  const more = significant.length - listed.length;
  const hidden = significant.filter((layer) => layer.off || layer.frozen);
  const hiddenNote = hidden.length
    ? ar ? ` وبعضها مطفأ أو مجمّد، لذلك تعاملت مع محتواها كدليل مخفي` : `, and some are switched off or frozen, so I treated their contents as hidden evidence`
    : "";
  // The remainder is stated as a number rather than "and others": an open-ended
  // tail reads as a claim about the whole drawing while naming only part of it.
  const morePart = more > 0 ? (ar ? ` و${arabicLayerRemainder(more)}` : ` and ${more} more`) : "";
  return ar
    ? `وجدت الطبقات ${names}${morePart}${hiddenNote}.`
    : `I found the layers ${names}${morePart}${hiddenNote}.`;
}

/**
 * Arabic plural form for "N other layers", which changes with the number.
 *
 * Only the low plural classes appear here on purpose. The projection caps layers
 * at MAX_PROJECTED_DXF_LAYERS, and four of them are named in the sentence, so
 * the remainder is bounded well below the point where Arabic switches to the
 * higher plural classes. Writing those branches would be dead code that looks
 * like coverage.
 */
function arabicLayerRemainder(count: number): string {
  if (count === 1) return "طبقة واحدة أخرى";
  if (count === 2) return "طبقتين أخريين";
  return `${count} طبقات أخرى`;
}

function blocksSentence(dxf: ProjectedDxf, ar: boolean): string | null {
  const significant = dxf.blocks.filter((block) => !block.externalReference);
  if (!significant.length) return null;
  const listed = significant.slice(0, 4);
  const names = listed.map((block) => `'${block.name}'`).join(ar ? "، " : ", ");
  // Counted against the same eligible set the names come from, exactly as the
  // layer sentence does: comparing against the drawing's total block count would
  // fold the excluded definitions back into the remainder and promise blocks the
  // sentence had already decided not to name.
  const more = significant.length - listed.length;
  // A bounded list that stops without saying so is a silent truncation, which is
  // the one thing a reviewable projection may not do. The number states how many
  // further DEFINITIONS exist. It is a listing count — how much of the table this
  // brief showed — and not a count of placed equipment: nothing here tallies
  // insertions, and the sentence keeps saying a block name is not a selection.
  const morePart = more > 0
    ? ar
      ? `، بالإضافة إلى ${arabicBlockRemainder(more)}`
      : `, plus ${more} additional block definition${more === 1 ? "" : "s"} not listed here`
    : "";
  return ar
    ? `يُعرّف المخطط الكتل ${names}${morePart}، وأسماء الكتل دليل على الاسم فقط وليست اختياراً لمعدّة.`
    : `The drawing defines the blocks ${names}${morePart}. A block name is evidence of a name only, not an equipment selection.`;
}

/**
 * Arabic plural form for "N additional block definitions not listed here".
 *
 * Only the low plural classes appear, as in the layer remainder: the projection
 * caps blocks at MAX_PROJECTED_DXF_BLOCKS and four are named here, so the
 * remainder stays well below the point where Arabic changes plural class.
 */
function arabicBlockRemainder(count: number): string {
  if (count === 1) return "كتلة تعريف واحدة إضافية غير مذكورة هنا";
  if (count === 2) return "كتلتَي تعريف إضافيتين غير مذكورتين هنا";
  return `${count} كتل تعريف إضافية غير مذكورة هنا`;
}

/**
 * Candidate sentence.
 *
 * Worded so the reading is clearly reviewable and clearly not a decision. The
 * evidence kinds are named in plain words; the internal source tokens are never
 * printed.
 */
function candidateSentence(candidate: ProjectedDxfCandidate, ar: boolean): string {
  const kinds = ar ? candidate.evidenceKindsArabic : candidate.evidenceKinds;
  const joined = kinds.length > 1
    ? (ar ? `${kinds.slice(0, -1).join("، ")} و${kinds[kinds.length - 1]}` : `${kinds.slice(0, -1).join(", ")} and ${kinds[kinds.length - 1]}`)
    : kinds[0] ?? "";
  return ar
    ? `استناداً إلى ${joined} أستطيع قراءة '${candidate.label}' كدليل قابل للمراجعة من المخطط، وليس كاختيار معدّة معتمد ولا ككمية.`
    : `Based on ${joined} I can read '${candidate.label}' as reviewable drawing evidence, not as an approved equipment selection or a quantity.`;
}

function dimensionSentence(dimension: ProjectedDxfDimension, ar: boolean): string {
  if (dimension.measurement === null) {
    return ar
      ? `يحتوي المخطط على عنصر قياس لم يُخزّن له قيمة، فاحتفظت به كما هو ولم أقيس الهندسة بنفسي.`
      : `The drawing contains a dimension with no stored value; I preserved it as it is and did not measure the geometry myself.`;
  }
  return ar
    ? `يُخزّن المخطط قيمة قياس قدرها ${dimension.measurement} كبيانات وصفية خاصة به؛ احتفظت بها كما هي ولم أعد قياسها أو أتحقق منها.`
    : `The drawing stores a dimension value of ${dimension.measurement} as its own metadata; I preserved it as stored and did not re-measure or verify it.`;
}

function xrefSentence(dxf: ProjectedDxf, ar: boolean): string | null {
  if (!dxf.externalReferences.length) return null;
  const reference = dxf.externalReferences[0]!;
  const more = dxf.externalReferences.length > 1 ? (ar ? ` وغيرها` : ` and others`) : "";
  return ar
    ? `يُشير المخطط إلى ملف CAD خارجي باسم '${reference.blockName}'${more} ولم أفتحه ولم أجلبه.`
    : `The drawing references an external CAD file named '${reference.blockName}'${more}, which I did not open and did not fetch.`;
}

/**
 * Renders the truthful CAD brief the assistant may say out loud.
 *
 * Every space, reliability, and evidence-source value is translated into plain
 * words: no enumeration token is ever printed into the prose, in either
 * language.
 */
export function renderDxfBrief(summary: ArtifactInspectionSummary, locale: "ar" | "en" = "en"): string {
  const ar = locale === "ar";
  const dxf = summary.dxf;
  const parts: string[] = [];

  parts.push(ar
    ? `قرأت الملف "${summary.filename}" (${dxfStatusWord(summary.status, ar)}).`
    : `I read "${summary.filename}" (${dxfStatusWord(summary.status, ar)}).`);

  // Phase 2A-9: derivation lineage is augmented around the accepted CAD
  // evidence — it never replaces it and never claims the reading is verified.
  if (summary.derivationLineage) parts.push(renderDerivationLineageSentence(summary.derivationLineage, locale));

  const version = versionSentence(dxf, ar);
  if (version) parts.push(version);
  parts.push(unitsSentence(dxf, ar));

  const spaces = spacesSentence(dxf, ar);
  if (spaces) parts.push(spaces);
  if (dxf.modelSpaceEntityCount > 0 && dxf.paperSpaceEntityCount > 0) parts.push(SPACES_KEPT_SEPARATE[locale]);

  const layers = layersSentence(dxf, ar);
  if (layers) parts.push(layers);
  const blocks = blocksSentence(dxf, ar);
  if (blocks) parts.push(blocks);

  // Narration order follows corroboration, which is a presentation choice and
  // not a selection: every candidate stays in the projection, the conflicting
  // ones are named together below, and nothing is marked as the answer.
  const narrated = [...dxf.candidates].sort((left, right) => right.corroborationKinds - left.corroborationKinds).slice(0, 2);
  for (const candidate of narrated) parts.push(candidateSentence(candidate, ar));
  const remainingCandidates = dxf.candidateCount - narrated.length;
  if (remainingCandidates > 0) {
    parts.push(ar
      ? `وهناك ${remainingCandidates} قراءة دلالية أخرى لم أعرضها هنا.`
      : `There ${remainingCandidates === 1 ? "is" : "are"} ${remainingCandidates} other semantic reading${remainingCandidates === 1 ? "" : "s"} I have not listed here.`);
  }
  // A conflict is named with both readings visible. Reporting only one side
  // would be choosing between them, which is the user's decision.
  const conflicted = dxf.candidates.find((candidate) => candidate.conflictsWith.length > 0);
  if (conflicted) {
    const counterpart = dxf.candidates.find((candidate) => candidate.id === conflicted.conflictsWith[0]);
    if (counterpart) {
      parts.push(ar
        ? `القراءتان '${conflicted.label}' و'${counterpart.label}' تستندان إلى الدليل نفسه وتختلفان؛ أبقيت الاثنتين ولم أرجّح واحدة على الأخرى.`
        : `The readings '${conflicted.label}' and '${counterpart.label}' rest on the same evidence and disagree; I kept both and did not prefer one over another.`);
    } else {
      parts.push(ar
        ? `بعض القراءات الدلالية تختلف فيما بينها؛ أبقيتها كلها ولم أرجّح واحدة على الأخرى.`
        : `Some of the readings disagree with each other; I kept all of them and did not prefer one over another.`);
    }
  }

  const dimension = dxf.dimensions.find((entry) => entry.measurement !== null) ?? dxf.dimensions[0];
  if (dimension) parts.push(dimensionSentence(dimension, ar));

  const attribute = dxf.attributes.find((entry) => entry.value.trim());
  if (attribute) {
    parts.push(ar
      ? `يحمل المخطط سمة '${attribute.tag}' بقيمة '${attribute.value}'، وهي سمة CAD مرصودة وليست مواصفة منتج.`
      : `The drawing carries an attribute '${attribute.tag}' with the value '${attribute.value}'; this is an observed CAD attribute, not a product specification.`);
  }

  const xref = xrefSentence(dxf, ar);
  if (xref) parts.push(xref);

  if (dxf.truncated) parts.push(TRUNCATION_SENTENCE[locale]);
  parts.push(NO_COUNT_SENTENCE[locale]);
  if (dxf.candidates.length) parts.push(OBSERVED_ONLY_SENTENCE[locale]);

  const limitation = dxf.limitations.find((entry) => entry !== dxf.limitations[0]) ?? dxf.limitations[0];
  // The recorded sentence is English; in an Arabic brief it is rendered through
  // the translation table rather than pasted, so the reader never gets one
  // language inside the other.
  if (limitation) parts.push(ar ? `قيود: ${arabicLimitation(limitation)}` : `Limitation: ${limitation}`);
  return parts.join(" ");
}

/**
 * Phase 2A-7: Arabic renderings of every limitation sentence the CAD inspector
 * can emit.
 *
 * The inspection layer records limitations as English prose, which is the right
 * thing to store — it is stable, greppable, and survives persistence. But an
 * Arabic brief that appends an English sentence is half-translated, and a
 * reviewer reading right-to-left should not have to switch language mid-clause.
 * So each known sentence is translated here.
 *
 * Two things matter about the fallback at the bottom. First, English must never
 * leak into an Arabic brief, so an unrecognised sentence is replaced rather than
 * pasted. Second, replacing it must not hide the caveat: the fallback still
 * states that a limitation exists and where to read it.
 */
const DXF_LIMITATION_ARABIC: ReadonlyMap<string, string> = new Map([
  [
    DXF_BASELINE_LIMITATION,
    "يستند دليل الـCAD إلى القسم والمعرّف والطبقة والكتلة والتخطيط والفضاء بدلاً من أرقام الصفحات؛ وحوفظ على الإحداثيات وأنصاف الأقطار كما خزّنها المخطط تماماً، ولم تُستنتج أو تُحوّل أي وحدة، ولم يُقَس أو يُعاد حساب أي بُعد، وأي عدد للعناصر ليس كمية هندسية",
  ],
  [
    DXF_NO_COUNT_LIMITATION,
    "إجماليات العناصر والإدراجات والنصوص في هذا الفحص مقاييس قراءة تصف كم قرأ VOKA من الملف؛ وليست حصراً للمعدّات ولا كميات ولا نتائج استخلاص",
  ],
  [
    DXF_SEMANTIC_BASELINE_LIMITATION,
    "القراءات الدلالية المرشحة هي قراءات مرصودة من المخطط فقط: غير معتمدة وغير مختارة وغير محصورة، ولا تُرقّى أبداً إلى متطلب أو جدول مواد أو بند عرض سعر أو سجل توريد",
  ],
  [
    "an attribute definition names a field the block expects; it does not state what was filled in",
    "تعريف السمة يسمّي حقلاً تتوقعه الكتلة، ولا يوضح ما الذي مُلئ فيه",
  ],
  [
    "an attribute value is an observed CAD literal, not a product specification or a selection",
    "قيمة السمة نص CAD مرصود، وليست مواصفة منتج أو اختياراً",
  ],
  [
    "layer membership is drawing evidence only; the layer name does not determine what the entity is",
    "الانتساب إلى الطبقة دليل من المخطط فقط، واسم الطبقة لا يحدد ما هو العنصر",
  ],
  [
    "no block name, layer name, attribute value, or nearby text supported a semantic reading, so no candidate was proposed",
    "لم يدعم أي اسم كتلة أو اسم طبقة أو قيمة سمة أو نص مجاور قراءة دلالية، لذلك لم يُقترح أي مرشح",
  ],
  [
    "spline control points were preserved; the curve itself was not evaluated or measured",
    "حوفظ على نقاط تحكم المنحنى، أما المنحنى نفسه فلم يُقيَّم ولم يُقَس",
  ],
  ["the CIRCLE record carried no radius", "سجل الدائرة لم يحمل نصف قطر"],
  [
    "the ELLIPSE record carried no major-axis endpoint vector",
    "سجل القطع الناقص لم يحمل متجه نهاية المحور الأكبر",
  ],
  ["the INSERT carried no block name", "الإدراج لم يحمل اسم كتلة"],
  ["the LINE record did not carry both endpoints", "سجل الخط لم يحمل كلتا النقطتين"],
  [
    "the attribute carried no tag, so it cannot be keyed to a field name",
    "السمة لم تحمل وسم، لذلك لا يمكن ربطها باسم حقل",
  ],
  ["the attribute value was empty", "قيمة السمة كانت فارغة"],
  ["the block definition carried no handle", "تعريف الكتلة لم يحمل معرّفاً"],
  [
    "the drawing declared or implied a legacy code page, so its text was decoded with a single-byte fallback; characters outside it may not read exactly",
    "أعلن المخطط أو تضمّن صفحة ترميز قديمة، لذلك فُكّ نصه بترميز أحادي البايت كبديل؛ وقد لا تُقرأ الأحرف خارجها بدقة",
  ],
  [
    "the drawing did not declare CAD units ($INSUNITS is absent), so its units remain unknown and were not inferred from coordinates, extents, or project settings",
    "لم يعلن المخطط وحدات الـCAD ($INSUNITS غير موجود)، لذلك تبقى وحداته مجهولة ولم تُستنتج من الإحداثيات أو المدى أو إعدادات المشروع",
  ],
  [
    "the drawing did not declare CAD units ($INSUNITS is absent), so its units remain unknown and were not inferred",
    "لم يعلن المخطط وحدات الـCAD ($INSUNITS غير موجود)، لذلك تبقى وحداته مجهولة ولم تُستنتج",
  ],
  ["the drawing did not declare a $ACADVER version", "لم يعلن المخطط إصدار $ACADVER"],
  [
    "the drawing did not declare a code page ($DWGCODEPAGE), so text was decoded as UTF-8",
    "لم يعلن المخطط صفحة ترميز ($DWGCODEPAGE)، لذلك فُكّ النص كـUTF-8",
  ],
  [
    "the drawing stored no measurement value for this dimension",
    "لم يخزّن المخطط قيمة قياس لهذا البعد",
  ],
  [
    "the ellipse's major-axis vector and radian parameters were preserved as stored and were not converted into a radius or degrees",
    "حوفظ على متجه المحور الأكبر ومعاملات الراديان للقطع الناقص كما خُزّنت، ولم تُحوّل إلى نصف قطر أو درجات",
  ],
  [
    "the entity carried no handle, so it is referenced by its position in the file rather than by a CAD handle",
    "العنصر لم يحمل معرّفاً، لذلك يُشار إليه بموضعه في الملف بدلاً من معرّف CAD",
  ],
  ["the entity declared no layer", "العنصر لم يعلن طبقة"],
  [
    "the layer is frozen, so its content is hidden evidence",
    "الطبقة مجمّدة، لذلك محتواها دليل مخفي",
  ],
  ["the layer is locked in the drawing", "الطبقة مقفلة في المخطط"],
  [
    "the layer is switched off in the drawing, so its content is hidden evidence",
    "الطبقة مطفأة في المخطط، لذلك محتواها دليل مخفي",
  ],
  [
    "the layer record carried no handle, so it is cited by name only",
    "سجل الطبقة لم يحمل معرّفاً، لذلك يُستشهد به بالاسم فقط",
  ],
  [
    "the referenced file was not opened, fetched, or resolved; only this metadata was recorded",
    "لم يُفتح الملف المرجعي ولم يُجلب ولم يُحل؛ وسُجّلت هذه البيانات الوصفية فقط",
  ],
  ["the text record carried no readable content", "سجل النص لم يحمل محتوى قابلاً للقراءة"],
  [
    "this block is an external reference; the referenced file was not opened, fetched, or resolved",
    "هذه الكتلة مرجع خارجي؛ ولم يُفتح الملف المرجعي ولم يُجلب ولم يُحل",
  ],
  [
    "this is a reserved AutoCAD layer whose name carries no design meaning",
    "هذه طبقة محجوزة في AutoCAD ولا يحمل اسمها معنى تصميمياً",
  ],
  [
    "this is an anonymous block, typically the private geometry of a dimension",
    "هذه كتلة مجهولة الاسم، وهي عادة الهندسة الخاصة ببعد",
  ],
]);

/**
 * Limitations built by interpolation — truncation notices and per-record
 * warnings — cannot live in a static table, so their shapes are matched instead.
 * The numbers and names are carried across, never restated.
 */
const DXF_LIMITATION_ARABIC_PATTERNS: ReadonlyArray<readonly [RegExp, (m: RegExpMatchArray) => string]> = [
  [
    /^the block name and its BLOCK_RECORD entry differ \('(.*)'\); both were preserved$/,
    (m) => `اسم الكتلة يختلف عن مدخل BLOCK_RECORD الخاص بها ('${m[1]}')؛ وحوفظ على كليهما`,
  ],
  [
    /^only the first (\d+) of (\d+) contained entities were retained$/,
    (m) => `احتُفظ بأول ${m[1]} من ${m[2]} عنصر محتوًى فقط`,
  ],
  [
    /^only the first (\d+) of (\d+) spline control points were retained$/,
    (m) => `احتُفظ بأول ${m[1]} من ${m[2]} نقطة تحكم للمنحنى فقط`,
  ],
  [
    /^only the first (\d+) of (\d+) attributes on this insert were retained$/,
    (m) => `احتُفظ بأول ${m[1]} من ${m[2]} سمة على هذا الإدراج فقط`,
  ],
  [
    /^only the first (\d+) of (\d+) vertices were retained$/,
    (m) => `احتُفظ بأول ${m[1]} من ${m[2]} رأس فقط`,
  ],
  [
    /^the polyline carries (\d+) bulge value\(s\) describing curved segments; the raw coordinates were preserved and the curves were not measured$/,
    (m) => `يحمل الخط المتعدد ${m[1]} قيمة انحناء تصف مقاطع منحنية؛ وحوفظ على الإحداثيات الخام ولم تُقَس المنحنيات`,
  ],
  [
    /^the drawing inserts the block '(.*)' but defines no block with that name$/,
    (m) => `يُدرج المخطط الكتلة '${m[1]}' لكنه لا يعرّف كتلة بهذا الاسم`,
  ],
  [
    /^the entity type (\S+) is outside what this phase models; its presence is recorded without its geometry$/,
    (m) => `نوع العنصر ${m[1]} خارج ما تمثّله هذه المرحلة؛ وسُجّل وجوده بدون هندسته`,
  ],
  [
    /^more than (\d+) semantic candidates were supported; the remainder were not retained$/,
    (m) => `تم دعم أكثر من ${m[1]} قراءة دلالية مرشحة؛ ولم يُحتفظ بالباقي`,
  ],
];

/**
 * Truthful Arabic fallback for a limitation this table does not know.
 *
 * It deliberately does not paste the English sentence — that would put one
 * language inside the other. It also deliberately does not stay silent: the
 * caveat still reaches the reader, and it points at the structured record where
 * the full wording lives.
 */
const DXF_UNKNOWN_LIMITATION_ARABIC =
  "يوجد قيد إضافي على هذا الفحص مسجّل في السجل المهيكل للمخطط";

/**
 * Returns the Arabic wording for a recorded limitation sentence.
 *
 * Exported so the fallback can be exercised directly: it is the branch that
 * guarantees English never reaches an Arabic brief, and a guarantee like that
 * should not rest on an untested path.
 */
export function arabicLimitation(limitation: string): string {
  const exact = DXF_LIMITATION_ARABIC.get(limitation);
  if (exact) return exact;
  for (const [pattern, render] of DXF_LIMITATION_ARABIC_PATTERNS) {
    const match = limitation.match(pattern);
    if (match) return render(match);
  }
  return DXF_UNKNOWN_LIMITATION_ARABIC;
}

function dxfStatusWord(status: ArtifactInspectionStatus, ar: boolean): string {
  const map: Record<ArtifactInspectionStatus, { ar: string; en: string }> = {
    INSPECTED: { ar: "تم الفحص", en: "inspected" },
    INSPECTED_NO_MACHINE_READABLE_TEXT: { ar: "تم فحص البنية بدون نص مقروء آلياً", en: "inspected with no machine-readable text" },
    NOT_INSPECTED: { ar: "لم يتم الفحص", en: "not inspected" },
    UNAVAILABLE: { ar: "الفحص غير متاح", en: "unavailable" },
    ENCRYPTED: { ar: "مشفر", en: "encrypted" },
  };
  return map[status][ar ? "ar" : "en"];
}

/**
 * Truthful, localized message for a drawing VOKA will not open.
 *
 * The reason comes from the format decision itself, so a DWG is named as a DWG
 * instead of being reported as a generic failure.
 */
export function unsupportedDrawingMessage(decision: { format: string; reason: string }, locale: "ar" | "en"): string {
  const ar = locale === "ar";
  if (ar) return `لم أفتح هذا الملف كمخطط CAD: ${decision.reason}`;
  return `I did not open this file as a CAD drawing: ${decision.reason}`;
}

export { SEMANTIC_SOURCE_LABEL as DXF_SEMANTIC_SOURCE_LABEL };
