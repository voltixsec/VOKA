/**
 * Phase 2A-8: textual IFC / BIM intelligence.
 *
 * The STEP reader is confined to this folder. Everything outside it works with
 * the bounded domain evidence model, never with a STEP value or a parser
 * class. There is deliberately no external IFC library here: maintained Node
 * parsers were evaluated and rejected because they pull geometry/WASM runtimes
 * and drop STEP provenance this phase is required to preserve (raw entity
 * text, exact GlobalId, declared quantities without meshing).
 */
export * from "./IfcFormat";
export * from "./IfcStepReader";
export * from "./IfcDocumentInspector";
export * from "./IfcRelationshipAnalyzer";
export * from "./IfcSemanticAnalyzer";
export * from "./IfcInspectionAnalyzer";
