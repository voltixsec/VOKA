/**
 * Phase 2A-7: ASCII DXF / CAD intelligence.
 *
 * The group-code reader is confined to this folder. Everything outside it works
 * with the bounded domain evidence model, never with a group code or a raw
 * section. There is deliberately no external DXF library here: the maintained
 * Node parsers were evaluated and rejected because they silently drop the
 * evidence this phase is required to preserve (attributes attached to inserts,
 * layer line type and lock state, block records, and layouts) and one of them
 * synthesises a handle when the file omits one, which would fabricate CAD
 * provenance.
 */
export * from "./DxfGroupCodes";
export * from "./DxfFormat";
export * from "./DxfEntityAnalyzer";
export * from "./DxfDocumentInspector";
export * from "./DxfStructureAnalyzer";
export * from "./DxfInspectionAnalyzer";

// The canonical DXF MIME types live in the domain index alongside the artifact
// kind they route to, so there is one source of truth for both.
