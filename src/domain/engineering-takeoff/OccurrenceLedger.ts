/**
 * Phase 2A-11: THE OCCURRENCE LEDGER.
 *
 * A counted engineering quantity must be REPRODUCIBLE. Storing "24" is
 * worthless: a reviewer has to be able to see the 24 individual things that were
 * counted, why each was eligible, why any were excluded, and under which rule
 * and rule version the decision was made. This module owns that ledger.
 *
 * Two source-native families are supported, and they are NOT the same problem:
 *
 * - DXF — a drawing is full of entities, and almost none of them are the thing
 *   being counted. Title blocks, legends, paper-space examples, dimension
 *   entities, text labels, block definitions, and XREF metadata are all
 *   excluded by RULE, not by heuristic;
 * - IFC — a BIM model contains a type object plus its instances, plus property
 *   sets, quantity sets, materials, systems, storeys, and relationship objects.
 *   An `IfcType` with five instances means FIVE occurrences, not six, and the
 *   spatial/relational scaffolding is never an occurrence.
 *
 * Counting is only ever over entities that the accepted 2A-7 (DXF) and 2A-8
 * (IFC) inspections actually retained, and every counted item carries an exact
 * locator back to that retained evidence. Nothing is inferred from file size,
 * drawing scale, visual density, or a parser's own summary total.
 *
 * This module is pure: no Prisma, no HTTP, no I/O.
 */

import { OCCURRENCE_COUNTING_VERSION, engineeringId } from "./EngineeringQuantityTaxonomy";

// ---------------------------------------------------------------------------
// Occurrence classification
// ---------------------------------------------------------------------------

/**
 * What an occurrence represents.
 *
 * `MODEL_SPACE_INSTANCE` and `DRAWING_MODEL_ENTITY` are the only classes that
 * may be counted as engineering occurrences. Everything else is classified so it
 * can be EXCLUDED with a reason, rather than being silently invisible.
 */
export const OCCURRENCE_CLASSES = [
  "MODEL_SPACE_INSTANCE",
  "DRAWING_MODEL_ENTITY",
  "TYPE_DEFINITION",
  "TYPE_OBJECT",
  "PAPER_SPACE_ENTITY",
  "TITLE_BLOCK",
  "LEGEND_SYMBOL",
  "ANNOTATION_SYMBOL",
  "DIMENSION_ENTITY",
  "TEXT_LABEL",
  "BLOCK_DEFINITION",
  "XREF_REFERENCE",
  "PROPERTY_SET",
  "QUANTITY_SET",
  "MATERIAL_ASSIGNMENT",
  "CLASSIFICATION_ASSIGNMENT",
  "SYSTEM_CONTAINER",
  "SPATIAL_CONTAINER",
  "RELATIONSHIP_OBJECT",
  "DOCUMENT_REFERENCE",
  "LAYER_DEFINITION",
  "STYLE_DEFINITION",
] as const;
export type OccurrenceClass = (typeof OCCURRENCE_CLASSES)[number];

const OCCURRENCE_CLASS_SET = new Set<string>(OCCURRENCE_CLASSES);
export function isOccurrenceClass(value: string): value is OccurrenceClass {
  return OCCURRENCE_CLASS_SET.has(value);
}

/** The only classes eligible to become a counted engineering occurrence. */
export const COUNTABLE_OCCURRENCE_CLASSES: readonly OccurrenceClass[] = [
  "MODEL_SPACE_INSTANCE",
  "DRAWING_MODEL_ENTITY",
];

export function isCountableOccurrenceClass(value: OccurrenceClass): boolean {
  return COUNTABLE_OCCURRENCE_CLASSES.includes(value);
}

// ---------------------------------------------------------------------------
// Inclusion / exclusion reasons
// ---------------------------------------------------------------------------

/**
 * Why an occurrence was included or excluded.
 *
 * Every exclusion carries one of these, so a ledger can explain the difference
 * between "VOKA found 40 entities and counted 24" and "VOKA found 24".
 */
export const OCCURRENCE_INCLUSION_REASONS = ["ELIGIBLE_MODEL_SPACE_OCCURRENCE", "ELIGIBLE_DRAWING_MODEL_ENTITY"] as const;
export type OccurrenceInclusionReason = (typeof OCCURRENCE_INCLUSION_REASONS)[number];

export const OCCURRENCE_EXCLUSION_REASONS = [
  "NOT_MODEL_SPACE",
  "PAPER_SPACE_ENTITY",
  "TITLE_BLOCK_ENTITY",
  "LEGEND_SYMBOL",
  "ANNOTATION_SYMBOL",
  "DIMENSION_ENTITY",
  "TEXT_OR_LABEL_ENTITY",
  "BLOCK_DEFINITION_ITSELF",
  "XREF_METADATA",
  "IFC_TYPE_OBJECT",
  "IFC_SPATIAL_CONTAINER",
  "IFC_RELATIONSHIP_OBJECT",
  "IFC_PROPERTY_SET",
  "IFC_QUANTITY_SET",
  "IFC_MATERIAL_ASSIGNMENT",
  "IFC_CLASSIFICATION_ASSIGNMENT",
  "IFC_SYSTEM_CONTAINER",
  "IFC_DOCUMENT_REFERENCE",
  "LAYER_OR_STYLE_DEFINITION",
  "SUBJECT_DOES_NOT_MATCH",
  "DERIVATION_FAMILY_DUPLICATE",
  "SOURCE_EVIDENCE_UNAVAILABLE",
  "COVERAGE_PARTIAL_EXCLUDED",
] as const;
export type OccurrenceExclusionReason = (typeof OCCURRENCE_EXCLUSION_REASONS)[number];

const OCCURRENCE_EXCLUSION_REASON_SET = new Set<string>(OCCURRENCE_EXCLUSION_REASONS);
export function isOccurrenceExclusionReason(value: string): value is OccurrenceExclusionReason {
  return OCCURRENCE_EXCLUSION_REASON_SET.has(value);
}

// ---------------------------------------------------------------------------
// Counting rules
// ---------------------------------------------------------------------------

/** Which source-native family a counting rule governs. */
export const COUNTING_RULE_FAMILIES = ["DXF", "IFC"] as const;
export type CountingRuleFamily = (typeof COUNTING_RULE_FAMILIES)[number];

/**
 * A versioned counting rule.
 *
 * The rule id and version are persisted onto every occurrence the rule
 * admitted, so changing the rule later cannot silently reinterpret history: the
 * old occurrences still cite the rule version that admitted them.
 */
export type CountingRule = {
  ruleId: string;
  ruleVersion: string;
  family: CountingRuleFamily;
  /** Human-readable statement of what the rule admits. */
  description: string;
  /** Entity/element type names the rule admits, when it is type-driven. */
  admittedEntityTypes: readonly string[];
  /** Layers, if any, inside which a DXF entity is considered model space content. */
  modelSpaceOnly: boolean;
  /** True when the rule requires the occurrence to carry a resolvable subject key. */
  requiresSubjectIdentity: boolean;
  createdAt: string;
};

export const DXF_COUNTING_RULE_VERSION = `${OCCURRENCE_COUNTING_VERSION}/dxf`;
export const IFC_COUNTING_RULE_VERSION = `${OCCURRENCE_COUNTING_VERSION}/ifc`;

export function buildCountingRuleId(input: { companyId: string; family: CountingRuleFamily; ruleVersion: string; description: string }): string {
  return engineeringId("ecr", "counting-rule", [input.companyId, input.family, input.ruleVersion, input.description]);
}

// ---------------------------------------------------------------------------
// Source-native occurrence input
// ---------------------------------------------------------------------------

/**
 * One occurrence as the accepted source channel retained it.
 *
 * This is the ONLY shape counting may read. It is deliberately source-native,
 * because 2A-10 intentionally owns comparison evidence rather than enumeration
 * catalogs — but every field here must trace back to a retained 2A-7/2A-8 record
 * with a real locator, so the counted quantity still has governed provenance.
 */
export type SourceOccurrence = {
  /** Deterministic id of the occurrence within its artifact. */
  occurrenceId: string;
  artifactId: string;
  /** Phase 2A-9 family root: always the original proprietary artifact. */
  derivationFamilyRootArtifactId: string;
  family: CountingRuleFamily;
  /** Source-native entity or element type name, verbatim, exactly as retained. */
  sourceType: string;
  occurrenceClass: OccurrenceClass;
  /** True when the accepted inspection recorded this entity in model space. */
  modelSpace: boolean;
  /** True when the entity lives inside a title block region/name. */
  insideTitleBlock: boolean;
  /** True when the entity lives inside a legend region/name. */
  insideLegend: boolean;
  /** True when the accepted inspection classified the entity as an annotation. */
  annotation: boolean;
  /** True when the source itself flagged the entity as a block definition. */
  blockDefinition: boolean;
  /** True when the source itself flagged the entity as XREF metadata. */
  xrefMetadata: boolean;
  /** Exact locator retained by the accepted source channel. Never re-invented. */
  locator: string;
  /** Claim id of the equally-governed 2A-10 claim for the same subject, when one exists. */
  evidenceClaimId: string | null;
  /** Subject identity the occurrence resolved to, when the rule required one. */
  subjectMatchKey: string | null;
  subjectKeyNamespace: string | null;
  /** Coverage of the source channel that retained this occurrence. */
  sourceCoverage: "COMPLETE" | "PARTIAL";
  /** Grouping key the source used, e.g. an IFC type object id or a DXF block name. */
  definitionGroupKey: string | null;
};

export type CountedOccurrenceOutcome = {
  occurrenceId: string;
  included: boolean;
  occurrenceClass: OccurrenceClass;
  inclusionReason: OccurrenceInclusionReason | null;
  exclusionReason: OccurrenceExclusionReason | null;
  note: string | null;
};

export type OccurrenceLedgerEntry = {
  entryId: string;
  companyId: string;
  takeoffScopeId: string;
  subjectMatchKey: string | null;
  subjectKeyNamespace: string | null;
  artifactId: string;
  derivationFamilyRootArtifactId: string;
  /** 2A-10 claim id when the occurrence also has governed comparison evidence. */
  evidenceClaimId: string | null;
  locator: string;
  family: CountingRuleFamily;
  sourceType: string;
  occurrenceClass: OccurrenceClass;
  included: boolean;
  inclusionReason: OccurrenceInclusionReason | null;
  exclusionReason: OccurrenceExclusionReason | null;
  note: string | null;
  countingRuleId: string;
  countingRuleVersion: string;
  createdAt: string;
};

export function buildLedgerEntryId(input: { companyId: string; takeoffScopeId: string; occurrenceId: string }): string {
  return engineeringId("occ", "occurrence-ledger", [input.companyId, input.takeoffScopeId, input.occurrenceId]);
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

/**
 * Classifies one occurrence.
 *
 * Ordering is intentional and is the whole safety property of this function: the
 * structural exclusions are tested BEFORE the "is this a countable classic"
 * question, so an entity that is both a model-space line and a dimension can
 * never be counted as a line.
 */
export function classifyOccurrence(occurrence: SourceOccurrence): OccurrenceClass {
  // Structural flags the source itself asserted win over everything else.
  if (occurrence.xrefMetadata) return "XREF_REFERENCE";
  if (occurrence.blockDefinition) return "BLOCK_DEFINITION";
  if (occurrence.insideTitleBlock) return "TITLE_BLOCK";
  if (occurrence.insideLegend) return "LEGEND_SYMBOL";
  if (occurrence.annotation) return "ANNOTATION_SYMBOL";

  if (occurrence.family === "IFC") {
    // `sourceType` is the source-native name VERBATIM, so these tables must hold
    // the real IFC entity names. Matching on symbolic placeholders here would
    // let every real type object, property set, and relationship fall through to
    // the countable branch, which is exactly the "IfcType + 5 instances = 6"
    // defect this module exists to prevent.
    const ifcClass = IFC_OCCURRENCE_CLASS_BY_ENTITY_TYPE[normalizeEntityType(occurrence.sourceType)];
    if (ifcClass) return ifcClass;
    // An `...Type` entity is always a definition, never an occurrence, even for
    // an element type this build has not enumerated yet.
    if (/^IFC[A-Z0-9_]*TYPE$/.test(normalizeEntityType(occurrence.sourceType))) return "TYPE_OBJECT";
    return "MODEL_SPACE_INSTANCE";
  }

  // Paper space is excluded as a whole: an entity the drawing placed on a sheet
  // is drawing furniture regardless of what its entity type happens to be, so
  // the space check outranks the entity-type table. Reporting it as a dimension
  // would describe the wrong reason.
  if (!occurrence.modelSpace) return "PAPER_SPACE_ENTITY";

  const dxfClass = DXF_OCCURRENCE_CLASS_BY_ENTITY_TYPE[normalizeEntityType(occurrence.sourceType)];
  if (dxfClass) return dxfClass;
  return "DRAWING_MODEL_ENTITY";
}

/** Strips a namespace prefix and normalizes case, so `IfcDoor` and `IFCDOOR` agree. */
function normalizeEntityType(sourceType: string): string {
  const withoutNamespace = sourceType.includes(":") ? sourceType.slice(sourceType.lastIndexOf(":") + 1) : sourceType;
  return withoutNamespace.trim().toUpperCase();
}

/**
 * IFC entity names that are NEVER an occurrence.
 *
 * Everything absent from this table is treated as a potentially countable
 * element instance, because a BIM model's countable content is open-ended while
 * its scaffolding is a closed, well-known set. Anything matching `...Type` is
 * additionally caught structurally by the pattern check in `classifyOccurrence`.
 */
const IFC_OCCURRENCE_CLASS_BY_ENTITY_TYPE: Record<string, OccurrenceClass> = {
  IFCPROPERTYSET: "PROPERTY_SET",
  IFCELEMENTQUANTITY: "QUANTITY_SET",
  IFCQUANTITYAREA: "QUANTITY_SET",
  IFCQUANTITYCOUNT: "QUANTITY_SET",
  IFCQUANTITYLENGTH: "QUANTITY_SET",
  IFCQUANTITYTIME: "QUANTITY_SET",
  IFCQUANTITYVOLUME: "QUANTITY_SET",
  IFCQUANTITYWEIGHT: "QUANTITY_SET",
  IFCMATERIAL: "MATERIAL_ASSIGNMENT",
  IFCMATERIALLAYER: "MATERIAL_ASSIGNMENT",
  IFCMATERIALLAYERSET: "MATERIAL_ASSIGNMENT",
  IFCMATERIALLIST: "MATERIAL_ASSIGNMENT",
  IFCMATERIALPROFILE: "MATERIAL_ASSIGNMENT",
  IFCMATERIALCONSTITUENTSET: "MATERIAL_ASSIGNMENT",
  IFCMATERIALPROPERTIES: "MATERIAL_ASSIGNMENT",
  IFCCLASSIFICATION: "CLASSIFICATION_ASSIGNMENT",
  IFCCLASSIFICATIONREFERENCE: "CLASSIFICATION_ASSIGNMENT",
  IFCSYSTEM: "SYSTEM_CONTAINER",
  IFCDISTRIBUTIONSYSTEM: "SYSTEM_CONTAINER",
  IFCBUILDINGSYSTEM: "SYSTEM_CONTAINER",
  IFCPROJECT: "SPATIAL_CONTAINER",
  IFCSITE: "SPATIAL_CONTAINER",
  IFCBUILDING: "SPATIAL_CONTAINER",
  IFCBUILDINGSTOREY: "SPATIAL_CONTAINER",
  IFCSPACE: "SPATIAL_CONTAINER",
  IFCFACILITY: "SPATIAL_CONTAINER",
  IFCFACILITYPART: "SPATIAL_CONTAINER",
  IFCSPATIALZONE: "SPATIAL_CONTAINER",
  IFCRELCONTAINEDINSPATIALSTRUCTURE: "RELATIONSHIP_OBJECT",
  IFCRELDEFINESBYPROPERTIES: "RELATIONSHIP_OBJECT",
  IFCRELASSOCIATESCLASSIFICATION: "RELATIONSHIP_OBJECT",
  IFCRELASSOCIATESMATERIAL: "RELATIONSHIP_OBJECT",
  IFCRELAGGREGATES: "RELATIONSHIP_OBJECT",
  IFCRELNESTS: "RELATIONSHIP_OBJECT",
  IFCRELVOIDSELEMENT: "RELATIONSHIP_OBJECT",
  IFCRELFILLSELEMENT: "RELATIONSHIP_OBJECT",
  IFCRELSPACEBOUNDARY: "RELATIONSHIP_OBJECT",
  IFCRELASSIGNSTOGROUP: "RELATIONSHIP_OBJECT",
  IFCRELDECLARES: "RELATIONSHIP_OBJECT",
  IFCDOCUMENTREFERENCE: "DOCUMENT_REFERENCE",
  IFCDOCUMENTINFORMATION: "DOCUMENT_REFERENCE",
  // Explicitly excluded even though they are "instances": an opening is a void
  // in a host element, not a supplied item, so counting it would inflate the
  // quantity by counting the same physical assembly twice.
  IFCOPENINGELEMENT: "RELATIONSHIP_OBJECT",
  IFCOPENINGSTANDARDCASE: "RELATIONSHIP_OBJECT",
  IFCANNOTATION: "ANNOTATION_SYMBOL",
  IFCGRID: "ANNOTATION_SYMBOL",
};

/**
 * DXF entity names that are never a countable model occurrence.
 *
 * As with IFC, the countable set is open-ended while the excluded set is a
 * closed, well-known set of drawing furniture.
 */
const DXF_OCCURRENCE_CLASS_BY_ENTITY_TYPE: Record<string, OccurrenceClass> = {
  DIMENSION: "DIMENSION_ENTITY",
  ALIGNEDDIMENSION: "DIMENSION_ENTITY",
  ANGULARDIMENSION: "DIMENSION_ENTITY",
  RADIALDIMENSION: "DIMENSION_ENTITY",
  DIAMETRICDIMENSION: "DIMENSION_ENTITY",
  ORDINATEDIMENSION: "DIMENSION_ENTITY",
  LINEAR: "DIMENSION_ENTITY",
  TEXT: "TEXT_LABEL",
  MTEXT: "TEXT_LABEL",
  ATTDEF: "TEXT_LABEL",
  ATTRIB: "TEXT_LABEL",
  LEADER: "TEXT_LABEL",
  MULTILEADER: "TEXT_LABEL",
  TOLERANCE: "TEXT_LABEL",
  LAYER: "LAYER_DEFINITION",
  STYLE: "STYLE_DEFINITION",
  DIMSTYLE: "STYLE_DEFINITION",
  TEXTSTYLE: "STYLE_DEFINITION",
  MLEADERSTYLE: "STYLE_DEFINITION",
  XREF: "XREF_REFERENCE",
  XREFRECORD: "XREF_REFERENCE",
  WIPEOUT: "ANNOTATION_SYMBOL",
};

/** Re-exported for tests/diagnostics: the DXF/IFC exclusion tables in one place. */
export { DXF_OCCURRENCE_CLASS_BY_ENTITY_TYPE, IFC_OCCURRENCE_CLASS_BY_ENTITY_TYPE };

const EXCLUSION_REASON_BY_CLASS: Record<OccurrenceClass, OccurrenceExclusionReason> = {
  MODEL_SPACE_INSTANCE: "NOT_MODEL_SPACE",
  DRAWING_MODEL_ENTITY: "NOT_MODEL_SPACE",
  TYPE_DEFINITION: "IFC_TYPE_OBJECT",
  TYPE_OBJECT: "IFC_TYPE_OBJECT",
  PAPER_SPACE_ENTITY: "PAPER_SPACE_ENTITY",
  TITLE_BLOCK: "TITLE_BLOCK_ENTITY",
  LEGEND_SYMBOL: "LEGEND_SYMBOL",
  ANNOTATION_SYMBOL: "ANNOTATION_SYMBOL",
  DIMENSION_ENTITY: "DIMENSION_ENTITY",
  TEXT_LABEL: "TEXT_OR_LABEL_ENTITY",
  BLOCK_DEFINITION: "BLOCK_DEFINITION_ITSELF",
  XREF_REFERENCE: "XREF_METADATA",
  PROPERTY_SET: "IFC_PROPERTY_SET",
  QUANTITY_SET: "IFC_QUANTITY_SET",
  MATERIAL_ASSIGNMENT: "IFC_MATERIAL_ASSIGNMENT",
  CLASSIFICATION_ASSIGNMENT: "IFC_CLASSIFICATION_ASSIGNMENT",
  SYSTEM_CONTAINER: "IFC_SYSTEM_CONTAINER",
  SPATIAL_CONTAINER: "IFC_SPATIAL_CONTAINER",
  RELATIONSHIP_OBJECT: "IFC_RELATIONSHIP_OBJECT",
  DOCUMENT_REFERENCE: "IFC_DOCUMENT_REFERENCE",
  LAYER_DEFINITION: "LAYER_OR_STYLE_DEFINITION",
  STYLE_DEFINITION: "LAYER_OR_STYLE_DEFINITION",
};

/** The exclusion reason implied by an occurrence class. */
export function exclusionReasonForClass(occurrenceClass: OccurrenceClass): OccurrenceExclusionReason {
  return EXCLUSION_REASON_BY_CLASS[occurrenceClass];
}

// ---------------------------------------------------------------------------
// Eligibility
// ---------------------------------------------------------------------------

export type EligibilityOutcome = {
  occurrenceId: string;
  eligible: boolean;
  occurrenceClass: OccurrenceClass;
  inclusionReason: OccurrenceInclusionReason | null;
  exclusionReason: OccurrenceExclusionReason | null;
  note: string | null;
};

/**
 * Decides whether ONE occurrence is eligible to be counted.
 *
 * The checks run in a fixed order and every negative outcome names a reason.
 * Two governance choices are load-bearing here:
 *
 * 1. a PARTIAL source is excluded rather than counted. If the accepted
 *    inspection truncated, an occurrence it happened to retain cannot be said to
 *    be the complete population, so counting from it would produce a
 *    confidently wrong total;
 * 2. a rule that requires subject identity EXCLUDES an identity-less occurrence,
 *    because an occurrence VOKA cannot tie to an engineering subject cannot
 *    support a subject-scoped quantity.
 */
export function evaluateEligibility(input: { occurrence: SourceOccurrence; rule: CountingRule }): EligibilityOutcome {
  const occurrenceClass = classifyOccurrence(input.occurrence);
  const base = { occurrenceId: input.occurrence.occurrenceId, occurrenceClass };

  if (input.occurrence.sourceCoverage === "PARTIAL") {
    return { ...base, eligible: false, inclusionReason: null, exclusionReason: "COVERAGE_PARTIAL_EXCLUDED", note: "the accepted source inspection was truncated, so this occurrence cannot be counted as part of a complete population" };
  }
  if (!isCountableOccurrenceClass(occurrenceClass)) {
    return { ...base, eligible: false, inclusionReason: null, exclusionReason: exclusionReasonForClass(occurrenceClass), note: null };
  }
  if (input.rule.modelSpaceOnly && !input.occurrence.modelSpace) {
    return { ...base, eligible: false, inclusionReason: null, exclusionReason: "NOT_MODEL_SPACE", note: "the counting rule admits model-space content only" };
  }
  if (input.rule.admittedEntityTypes.length > 0 && !input.rule.admittedEntityTypes.some((admitted) => normalizeEntityType(admitted) === normalizeEntityType(input.occurrence.sourceType))) {
    return { ...base, eligible: false, inclusionReason: null, exclusionReason: "SUBJECT_DOES_NOT_MATCH", note: `the entity type ${input.occurrence.sourceType} is not among the types this counting rule admits` };
  }
  if (input.rule.requiresSubjectIdentity && (!input.occurrence.subjectMatchKey || !input.occurrence.subjectKeyNamespace)) {
    return { ...base, eligible: false, inclusionReason: null, exclusionReason: "SUBJECT_DOES_NOT_MATCH", note: "the counting rule requires a resolvable subject identity and this occurrence has none" };
  }

  const inclusionReason: OccurrenceInclusionReason =
    occurrenceClass === "DRAWING_MODEL_ENTITY" ? "ELIGIBLE_DRAWING_MODEL_ENTITY" : "ELIGIBLE_MODEL_SPACE_OCCURRENCE";
  return { ...base, eligible: true, inclusionReason, exclusionReason: null, note: null };
}

// ---------------------------------------------------------------------------
// Derivation-family deduplication
// ---------------------------------------------------------------------------

/**
 * Collapses occurrences so the SAME physical thing is never counted twice.
 *
 * The family root is always the original proprietary artifact (2A-9). Two cases
 * must be told apart, and they look identical at the level of subject alone:
 *
 * - the same physical thing seen in an original AND in its derived conversion
 *   (a DWG and the DXF generated from it) is ONE occurrence;
 * - several genuinely distinct things that happen to share a subject (three
 *   ceiling cameras of the same tag, in one drawing) are THREE occurrences.
 *
 * The distinguishing signal is WHICH ARTIFACT an occurrence came from. Within a
 * single artifact, every retained occurrence is distinct by construction — the
 * accepted inspection already deduplicated its own entities and gave each one a
 * locator — so all of them survive. Across artifacts of the same family, a
 * subject-keyed occurrence is a re-representation of the same subject and only
 * one representation survives.
 *
 * The surviving representation is chosen DETERMINISTICALLY by lowest artifact
 * id, never by document role, so the outcome cannot depend on read order. The
 * collapsed representation is still recorded with reason
 * `DERIVATION_FAMILY_DUPLICATE` so the collapse is visible rather than silent.
 */
export function deduplicateByDerivationFamily(occurrences: readonly SourceOccurrence[]): Array<{ occurrence: SourceOccurrence; duplicateOf: string | null }> {
  // Which artifacts contribute to each family? A family with one contributing
  // artifact has nothing to collapse.
  const artifactsByFamily = new Map<string, Set<string>>();
  for (const occurrence of occurrences) {
    const bucket = artifactsByFamily.get(occurrence.derivationFamilyRootArtifactId) ?? new Set<string>();
    bucket.add(occurrence.artifactId);
    artifactsByFamily.set(occurrence.derivationFamilyRootArtifactId, bucket);
  }

  // Occurrences in a single-artifact family, and identity-less occurrences, can
  // never be a cross-representation duplicate.
  const results: Array<{ occurrence: SourceOccurrence; duplicateOf: string | null }> = [];

  // Group candidates for cross-artifact comparison by family + subject identity.
  const crossArtifactGroups = new Map<string, SourceOccurrence[]>();
  const standalone: SourceOccurrence[] = [];

  for (const occurrence of occurrences) {
    const familyHasMultipleArtifacts = (artifactsByFamily.get(occurrence.derivationFamilyRootArtifactId)?.size ?? 0) > 1;
    // Only a subject-bearing occurrence in a multi-artifact family can be a
    // re-representation. Two identity-less entities are not provably the same.
    if (!familyHasMultipleArtifacts || !occurrence.subjectMatchKey) {
      standalone.push(occurrence);
      continue;
    }
    const key = [occurrence.derivationFamilyRootArtifactId, occurrence.subjectMatchKey].join("\u0000");
    const list = crossArtifactGroups.get(key) ?? [];
    list.push(occurrence);
    crossArtifactGroups.set(key, list);
  }

  for (const list of crossArtifactGroups.values()) {
    // Within one artifact each occurrence is inherently distinct, so every
    // occurrence of every artifact survives EXCEPT those from artifacts that lose
    // the cross-representation comparison. The comparison is per (family,
    // subject): the lowest artifact id that represents this subject wins, and
    // other artifacts' representations of that subject are the duplicates.
    const artifactIds = [...new Set(list.map((occurrence) => occurrence.artifactId))].sort();
    if (artifactIds.length <= 1) {
      for (const occurrence of list) results.push({ occurrence, duplicateOf: null });
      continue;
    }
    const survivorArtifactId = artifactIds[0]!;
    for (const occurrence of list) {
      results.push({ occurrence, duplicateOf: occurrence.artifactId === survivorArtifactId ? null : survivorArtifactId });
    }
  }
  for (const occurrence of standalone) results.push({ occurrence, duplicateOf: null });

  return results.sort((left, right) => (left.occurrence.occurrenceId < right.occurrence.occurrenceId ? -1 : left.occurrence.occurrenceId > right.occurrence.occurrenceId ? 1 : 0));
}

// ---------------------------------------------------------------------------
// Ledger construction
// ---------------------------------------------------------------------------

export type OccurrenceLedger = {
  companyId: string;
  takeoffScopeId: string;
  entries: OccurrenceLedgerEntry[];
  countedOccurrences: number;
  excludedOccurrences: number;
  /** Populations by exclusion reason, so a reviewer sees the whole funnel. */
  exclusionSummary: Array<{ reason: OccurrenceExclusionReason; count: number }>;
  countingRuleId: string;
  countingRuleVersion: string;
  /** Distinct derivation families the ledger drew from. */
  derivationFamilyRoots: string[];
  limitations: string[];
};

/**
 * Builds the durable occurrence ledger.
 *
 * Every eligible occurrence becomes an immutable entry retaining its exact
 * locator, rule id, and rule version, so the counted total is reproducible by
 * re-reading the ledger rather than by re-running the counter and trusting it.
 */
export function buildOccurrenceLedger(input: {
  companyId: string;
  takeoffScopeId: string;
  rule: CountingRule;
  occurrences: readonly SourceOccurrence[];
  createdAt: string;
}): OccurrenceLedger {
  const deduplicated = deduplicateByDerivationFamily(input.occurrences);
  const duplicatesByOccurrenceId = new Map(deduplicated.map((item) => [item.occurrence.occurrenceId, item.duplicateOf]));

  const entries: OccurrenceLedgerEntry[] = deduplicated.map((item) => {
    const duplicateOf = duplicatesByOccurrenceId.get(item.occurrence.occurrenceId) ?? null;
    const eligibility = duplicateOf
      ? {
        occurrenceId: item.occurrence.occurrenceId,
        eligible: false,
        occurrenceClass: classifyOccurrence(item.occurrence),
        inclusionReason: null,
        exclusionReason: "DERIVATION_FAMILY_DUPLICATE" as OccurrenceExclusionReason,
        note: `this occurrence belongs to the same evidence family as ${duplicateOf} and is already represented by it, so it does not add to the engineering quantity`,
      }
      : evaluateEligibility({ occurrence: item.occurrence, rule: input.rule });

    return {
      entryId: buildLedgerEntryId({ companyId: input.companyId, takeoffScopeId: input.takeoffScopeId, occurrenceId: item.occurrence.occurrenceId }),
      companyId: input.companyId,
      takeoffScopeId: input.takeoffScopeId,
      subjectMatchKey: item.occurrence.subjectMatchKey,
      subjectKeyNamespace: item.occurrence.subjectKeyNamespace,
      artifactId: item.occurrence.artifactId,
      derivationFamilyRootArtifactId: item.occurrence.derivationFamilyRootArtifactId,
      evidenceClaimId: item.occurrence.evidenceClaimId,
      locator: item.occurrence.locator,
      family: item.occurrence.family,
      sourceType: item.occurrence.sourceType,
      occurrenceClass: eligibility.occurrenceClass,
      included: eligibility.eligible,
      inclusionReason: eligibility.inclusionReason,
      exclusionReason: eligibility.exclusionReason,
      note: eligibility.note,
      countingRuleId: input.rule.ruleId,
      countingRuleVersion: input.rule.ruleVersion,
      createdAt: input.createdAt,
    };
  });

  const exclusionCounts = new Map<OccurrenceExclusionReason, number>();
  for (const entry of entries) {
    if (entry.included || !entry.exclusionReason) continue;
    exclusionCounts.set(entry.exclusionReason, (exclusionCounts.get(entry.exclusionReason) ?? 0) + 1);
  }

  const countedOccurrences = entries.filter((entry) => entry.included).length;
  const limitations: string[] = [];
  if (input.occurrences.some((occurrence) => occurrence.sourceCoverage === "PARTIAL")) {
    limitations.push("at least one source inspection was truncated, so occurrences it retained were excluded rather than counted as a complete population");
  }

  return {
    companyId: input.companyId,
    takeoffScopeId: input.takeoffScopeId,
    entries,
    countedOccurrences,
    excludedOccurrences: entries.length - countedOccurrences,
    exclusionSummary: [...exclusionCounts.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((left, right) => (left.reason < right.reason ? -1 : 1)),
    countingRuleId: input.rule.ruleId,
    countingRuleVersion: input.rule.ruleVersion,
    derivationFamilyRoots: [...new Set(entries.map((entry) => entry.derivationFamilyRootArtifactId))].sort(),
    limitations,
  };
}

/** The counting contract version this module implements. */
export const COUNTING_CONTRACT_VERSION = OCCURRENCE_COUNTING_VERSION;
