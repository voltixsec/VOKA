import {
  IFC_SEMANTIC_BASELINE_LIMITATION,
  MAX_IFC_LIMITATIONS,
  MAX_IFC_LIMITATIONS_PER_RECORD,
  MAX_IFC_SEMANTIC_CANDIDATES,
  ifcCandidatesConflict,
  ifcNameTokens,
  phraseForIfcEntityType,
  phraseForIfcTokens,
  type IfcInspection,
  type IfcSemanticCandidate,
  type IfcSemanticSource,
  type ObservationReliability,
} from "@/src/domain/source-artifact";

/**
 * Phase 2A-8: conservative BIM semantic candidates.
 *
 * A candidate may combine entity class, Name, ObjectType, Tag, PredefinedType,
 * assigned type object, property values, system membership, classification,
 * and material evidence. It stays OBSERVED / REVIEWABLE / NON-APPROVED. When
 * two readings rest on the same evidence both survive: VOKA does not pick a
 * winner, because choosing would be selecting equipment.
 */

export type IfcSemanticLimits = {
  maxSemanticCandidates: number;
};

export const DEFAULT_IFC_SEMANTIC_LIMITS: IfcSemanticLimits = {
  maxSemanticCandidates: MAX_IFC_SEMANTIC_CANDIDATES,
};

type Draft = {
  label: string;
  sources: Set<IfcSemanticSource>;
  evidenceLocators: string[];
  reasons: string[];
  limitations: string[];
};

function add(draft: Draft, source: IfcSemanticSource, locator: string, reason: string): void {
  draft.sources.add(source);
  if (!draft.evidenceLocators.includes(locator)) draft.evidenceLocators.push(locator);
  if (!draft.reasons.includes(reason)) draft.reasons.push(reason);
}

export function analyzeIfcSemantics(
  inspection: IfcInspection,
  partialLimits: Partial<IfcSemanticLimits> = {},
): { candidates: IfcSemanticCandidate[]; truncated: boolean; limitations: string[] } {
  const limits = { ...DEFAULT_IFC_SEMANTIC_LIMITS, ...partialLimits };
  const drafts = new Map<string, Draft>();
  const limitations: string[] = [];
  let truncated = false;

  const draftFor = (label: string): Draft => {
    const key = label.toUpperCase();
    let draft = drafts.get(key);
    if (!draft) {
      draft = {
        label,
        sources: new Set<IfcSemanticSource>(),
        evidenceLocators: [],
        reasons: [],
        limitations: [IFC_SEMANTIC_BASELINE_LIMITATION],
      };
      drafts.set(key, draft);
    }
    return draft;
  };

  const consider = (text: string | null | undefined, source: IfcSemanticSource, locator: string, reason: string) => {
    if (!text?.trim()) return;
    const phrase = phraseForIfcTokens(ifcNameTokens(text)) ?? (text.trim().length >= 3 && text.trim().length <= 80 ? text.trim() : null);
    if (!phrase) return;
    add(draftFor(phrase), source, locator, reason);
  };

  for (const element of inspection.elements) {
    const typePhrase = phraseForIfcEntityType(element.entityType);
    if (typePhrase) {
      add(draftFor(typePhrase), "ENTITY_TYPE", element.locator, `the entity is declared as ${element.entityType}`);
    }
    consider(element.name, "NAME", element.locator, `the entity is named '${element.name}'`);
    consider(element.objectType, "OBJECT_TYPE", element.locator, `the entity declares ObjectType '${element.objectType}'`);
    consider(element.tag, "TAG", element.locator, `the entity declares Tag '${element.tag}'`);
    consider(element.predefinedType, "PREDEFINED_TYPE", element.locator, `the entity declares PredefinedType '${element.predefinedType}'`);
    if (element.typeName) {
      consider(element.typeName, "ASSIGNED_TYPE", element.typeLocator ?? element.locator, `the assigned type object is named '${element.typeName}'`);
    }
    for (const locator of element.systemLocators) {
      const system = inspection.systems.find((item) => item.locator === locator);
      if (system?.name) consider(system.name, "SYSTEM_MEMBERSHIP", locator, `the element is assigned to the system '${system.name}'`);
    }
    for (const locator of element.materialLocators) {
      const material = inspection.materials.find((item) => item.locator === locator);
      if (material?.name) consider(material.name, "MATERIAL", locator, `the element is associated with the material '${material.name}'`);
    }
    for (const locator of element.classificationLocators) {
      const classification = inspection.classifications.find((item) => item.locator === locator);
      const label = classification?.name ?? classification?.identification;
      if (label) consider(label, "CLASSIFICATION", locator, `the element is associated with classification '${label}'`);
    }
  }

  for (const property of inspection.properties) {
    if (!property.rawValue) continue;
    const interesting = /manufacturer|model|reference|status|isexternal|firerating/iu.test(property.name)
      || Boolean(phraseForIfcTokens(ifcNameTokens(property.rawValue)));
    if (!interesting) continue;
    const locator = property.definedObjectLocators[0] ?? property.locator;
    consider(property.rawValue, "PROPERTY_VALUE", locator, `the property '${property.name}' reads '${property.rawValue}'`);
  }

  const candidates: IfcSemanticCandidate[] = [];
  let index = 0;
  for (const draft of drafts.values()) {
    index += 1;
    const corroborationCount = draft.sources.size;
    const reliability: ObservationReliability = corroborationCount >= 3 ? "MEDIUM" : corroborationCount === 2 ? "MEDIUM" : "LOW";
    if (candidates.length < limits.maxSemanticCandidates) {
      candidates.push({
        id: `ifc-s:${index}`,
        label: draft.label,
        sources: [...draft.sources],
        evidenceLocators: draft.evidenceLocators.slice(0, 8),
        reasons: draft.reasons.slice(0, 6),
        corroborationCount,
        confidence: Math.min(0.9, 0.3 + corroborationCount * 0.15),
        reliability,
        status: "OBSERVED_NOT_APPROVED",
        conflictsWith: [],
        limitations: [...new Set(draft.limitations)].slice(0, MAX_IFC_LIMITATIONS_PER_RECORD),
      });
    } else {
      truncated = true;
    }
  }

  for (const left of candidates) {
    for (const right of candidates) {
      if (ifcCandidatesConflict(left, right) && !left.conflictsWith.includes(right.id)) {
        left.conflictsWith.push(right.id);
      }
    }
  }
  for (const candidate of candidates) {
    if (candidate.conflictsWith.length > 0) {
      candidate.limitations = [...new Set([...candidate.limitations, "another reading of the same evidence disagrees; both were kept and VOKA did not choose between them"])].slice(0, MAX_IFC_LIMITATIONS_PER_RECORD);
    }
  }

  if (truncated) limitations.push(`more than ${limits.maxSemanticCandidates} semantic candidates were supported; the remainder were not retained`);
  if (candidates.length === 0) {
    limitations.push("no entity class, name, type, property, or system membership supported a semantic reading, so no candidate was proposed");
  }
  return { candidates, truncated, limitations: limitations.slice(0, MAX_IFC_LIMITATIONS) };
}
