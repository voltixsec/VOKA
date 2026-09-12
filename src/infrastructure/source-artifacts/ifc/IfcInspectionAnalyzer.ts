import {
  IFC_BASELINE_LIMITATION,
  IFC_NO_COUNT_LIMITATION,
  MAX_IFC_LIMITATIONS,
  type IfcAnalysis,
  type IfcInspection,
} from "@/src/domain/source-artifact";
import { IfcInspectionError, detectIfcFormat } from "./IfcFormat";
import { inspectIfcDocument, type IfcInspectionLimits } from "./IfcDocumentInspector";
import { analyzeIfcRelationships, type IfcRelationshipLimits } from "./IfcRelationshipAnalyzer";
import { analyzeIfcSemantics, type IfcSemanticLimits } from "./IfcSemanticAnalyzer";

/**
 * Phase 2A-8: orchestrator for governed BIM intelligence.
 *
 * Pipeline: format decision -> bounded STEP parse -> spatial/element/property
 * evidence -> relationships -> conservative semantic candidates. It holds no
 * format knowledge of its own.
 *
 * Nothing here approves, verifies, measures, counts, or selects anything. It
 * also creates nothing: there is no requirement, quotation line, BOM, product
 * selection, supplier, or procurement record anywhere downstream of this module.
 */

export type { IfcAnalysis, IfcInspection };

export function analyzeIfcDocument(
  inspection: IfcInspection,
  limits: Partial<IfcRelationshipLimits & IfcSemanticLimits> = {},
): IfcAnalysis {
  const relationships = analyzeIfcRelationships(inspection, limits);
  const semantics = analyzeIfcSemantics(inspection, limits);
  return {
    format: "IFC_SPF",
    inspection,
    relationships: relationships.relationships,
    relationshipCount: relationships.count,
    candidates: semantics.candidates,
    truncated: inspection.truncated || relationships.truncated || semantics.truncated,
    limitations: [...new Set([
      IFC_BASELINE_LIMITATION,
      IFC_NO_COUNT_LIMITATION,
      ...inspection.document.schema.limitations,
      ...inspection.limitations,
      ...relationships.limitations,
      ...semantics.limitations,
    ])].slice(0, MAX_IFC_LIMITATIONS),
  };
}

export function analyzeIfcBytes(
  bytes: Uint8Array,
  options: {
    filename?: string | null;
    mimeType?: string | null;
    limits?: Partial<IfcInspectionLimits>;
    structureLimits?: Partial<IfcRelationshipLimits & IfcSemanticLimits>;
  } = {},
): IfcAnalysis {
  return analyzeIfcDocument(
    inspectIfcDocument(bytes, options),
    options.structureLimits ?? {},
  );
}

/** Bounded text rendering of a model for reuse and search. */
export function flattenIfcText(inspection: IfcInspection, maxCharacters = 20_000): string {
  const parts: string[] = [];
  const schema = inspection.document.schema.declared;
  parts.push(schema ? `[schema ${schema}]` : "[schema not declared]");
  if (inspection.project?.name) parts.push(`[project ${inspection.project.name}]`);
  parts.push(`[storeys: ${inspection.storeys.length}]`);
  parts.push(`[spaces: ${inspection.spaces.length}]`);
  parts.push(`[inspected product entities: ${inspection.elements.length}]`);
  for (const storey of inspection.storeys) {
    if (storey.name) parts.push(`[storey ${storey.name}]`);
    if (parts.join("\n").length >= maxCharacters) break;
  }
  for (const space of inspection.spaces) {
    const label = space.longName || space.name;
    if (label) parts.push(`[space ${label}]`);
    if (parts.join("\n").length >= maxCharacters) break;
  }
  for (const element of inspection.elements) {
    const label = [element.entityType, element.name, element.tag].filter(Boolean).join(" ");
    if (label) parts.push(label);
    if (parts.join("\n").length >= maxCharacters) break;
  }
  return parts.join("\n").slice(0, maxCharacters);
}

/** Bounded citation set: project, storeys, strongest elements. */
export function ifcCitationEntries(inspection: IfcInspection, maxEntries = 12): Array<{ locator: string; claim: string }> {
  const entries: Array<{ locator: string; claim: string }> = [];
  if (inspection.project) {
    entries.push({ locator: inspection.project.locator, claim: inspection.project.name ? `project ${inspection.project.name}` : "project" });
  }
  for (const storey of inspection.storeys) {
    if (entries.length >= maxEntries) break;
    entries.push({ locator: storey.locator, claim: storey.name ? `storey ${storey.name}` : storey.entityType });
  }
  for (const system of inspection.systems) {
    if (entries.length >= maxEntries) break;
    entries.push({ locator: system.locator, claim: system.name ? `system ${system.name}` : system.entityType });
  }
  for (const element of inspection.elements) {
    if (entries.length >= maxEntries) break;
    const label = element.name || element.tag || element.entityType;
    entries.push({ locator: element.locator, claim: label });
  }
  return entries;
}

export { IfcInspectionError, detectIfcFormat };
