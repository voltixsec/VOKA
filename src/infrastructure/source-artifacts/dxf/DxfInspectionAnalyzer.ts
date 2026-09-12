import {
  DXF_BASELINE_LIMITATION,
  DXF_NO_COUNT_LIMITATION,
  MAX_DXF_LIMITATIONS,
  type DxfAnalysis,
  type DxfInspection,
} from "@/src/domain/source-artifact";
import { DxfInspectionError, detectDxfFormat } from "./DxfFormat";
import { inspectDxfDocument, type DxfInspectionLimits } from "./DxfDocumentInspector";
import { analyzeDxfStructure, type DxfStructureLimits } from "./DxfStructureAnalyzer";

/**
 * Phase 2A-7: orchestrator for governed CAD intelligence.
 *
 * Pipeline: format decision -> bounded group-code parse -> layer, block, insert,
 * text, dimension, and attribute evidence -> relationships -> conservative
 * semantic candidates. It holds no format knowledge of its own: the inspector
 * owns bytes, the entity analyzer owns records, and the structure analyzer owns
 * relationships and candidates.
 *
 * Nothing here approves, verifies, measures, counts, or selects anything. It
 * also creates nothing: there is no requirement, quotation line, BOM, product
 * selection, or procurement record anywhere downstream of this module.
 */

export type { DxfAnalysis, DxfInspection };

/** Runs the structure pass over an already-inspected drawing. */
export function analyzeDxfDocument(
  inspection: DxfInspection,
  limits: Partial<DxfStructureLimits> = {},
): DxfAnalysis {
  const structure = analyzeDxfStructure(inspection, limits);
  return {
    format: "ASCII_DXF",
    inspection,
    relationships: structure.relationships,
    relationshipCount: structure.relationshipCount,
    candidates: structure.candidates,
    truncated: inspection.truncated || structure.truncated,
    limitations: [...new Set([
      DXF_BASELINE_LIMITATION,
      DXF_NO_COUNT_LIMITATION,
      // The declared-metadata disclosures belong in the merged list. "The
      // drawing did not declare CAD units" is the single most important caveat a
      // reviewer needs, and leaving it on the metadata record alone would drop
      // it from the persisted artifact and from the assistant's brief.
      ...inspection.document.units.limitations,
      ...inspection.document.version.limitations,
      ...inspection.limitations,
      ...structure.limitations,
    ])].slice(0, MAX_DXF_LIMITATIONS),
  };
}

/** Inspects ASCII DXF bytes and runs the full structure and semantic pass. */
export function analyzeDxfBytes(
  bytes: Uint8Array,
  options: {
    filename?: string | null;
    mimeType?: string | null;
    limits?: Partial<DxfInspectionLimits>;
    structureLimits?: Partial<DxfStructureLimits>;
  } = {},
): DxfAnalysis {
  return analyzeDxfDocument(
    inspectDxfDocument(bytes, options),
    options.structureLimits ?? {},
  );
}

/**
 * Bounded text rendering of a drawing for reuse and search.
 *
 * It is a convenience view of the same evidence, not a second extraction: text
 * and attribute literals joined with their locators, capped hard so a large
 * drawing can never bloat a persisted column. Coordinates are deliberately not
 * rendered, because a bare number with no declared unit invites exactly the
 * reading this phase refuses to make.
 */
export function flattenDxfText(inspection: DxfInspection, maxCharacters = 20_000): string {
  const parts: string[] = [];
  const header = inspection.document;
  if (header.version.code) parts.push(`[version ${header.version.code}${header.version.label ? ` (${header.version.label})` : ""}]`);
  parts.push(header.units.declared && header.units.name ? `[units ${header.units.name}]` : "[units not declared]");
  parts.push(`[model space entities: ${inspection.spaces.MODEL_SPACE.entityCount}]`);
  parts.push(`[paper space entities: ${inspection.spaces.PAPER_SPACE.entityCount}]`);
  for (const layer of inspection.layers) {
    parts.push(`[layer ${layer.name}]`);
    if (parts.join("\n").length >= maxCharacters) break;
  }
  for (const text of inspection.texts) {
    const label = text.normalized || text.raw;
    if (!label.trim()) continue;
    parts.push(label.replace(/\s+/gu, " ").trim());
    if (parts.join("\n").length >= maxCharacters) break;
  }
  for (const attribute of inspection.attributes) {
    if (!attribute.value.trim()) continue;
    parts.push(`${attribute.tag}=${attribute.value}`);
    if (parts.join("\n").length >= maxCharacters) break;
  }
  return parts.join("\n").slice(0, maxCharacters);
}

/** Bounded per-layer citation set, one entry per significant layer. */
export function dxfCitationEntries(inspection: DxfInspection, maxEntries = 12): Array<{ locator: string; claim: string }> {
  const entries: Array<{ locator: string; claim: string }> = [];
  for (const layer of inspection.layers) {
    if (entries.length >= maxEntries) break;
    if (layer.reserved) continue;
    entries.push({
      locator: layer.locator,
      claim: `layer ${layer.name} (${layer.observedEntityCount} inspected entit${layer.observedEntityCount === 1 ? "y" : "ies"})`,
    });
  }
  for (const block of inspection.blocks) {
    if (entries.length >= maxEntries) break;
    if (block.spaceOwner || block.anonymous) continue;
    entries.push({ locator: block.locator, claim: `block ${block.name}` });
  }
  if (inspection.spaces.MODEL_SPACE.entityCount > 0 && entries.length < maxEntries) {
    entries.push({ locator: inspection.spaces.MODEL_SPACE.locator, claim: "model space" });
  }
  if (inspection.spaces.PAPER_SPACE.entityCount > 0 && entries.length < maxEntries) {
    entries.push({ locator: inspection.spaces.PAPER_SPACE.locator, claim: inspection.spaces.PAPER_SPACE.layoutName ? `paper space (${inspection.spaces.PAPER_SPACE.layoutName})` : "paper space" });
  }
  return entries;
}

export { DxfInspectionError, detectDxfFormat };
