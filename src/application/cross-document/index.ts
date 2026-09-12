/**
 * Phase 2A-10 — CROSS-DOCUMENT EVIDENCE + CONSISTENCY ENGINE (application layer).
 *
 * The application layer owns the governed flow: evidence → immutable claims →
 * lineage collapse → document/revision governance → conservative subject
 * matching → findings → human review → a stable Phase 2A-11 read contract.
 *
 * It creates no Requirement, DrawingTakeoffLine, Engineering BOM line,
 * QuotationLine, ProductSelection, Supplier, ProcurementRequirement, RFQ,
 * Offer, Award, or PO, and it imports no repository that could.
 */

export * from "./ports";
export * from "./matching-types";
export * from "./LineageCollapse";
export * from "./DocumentGovernance";
export * from "./ActiveRevisionDecisionService";
export * from "./SubjectMatchEngine";
export * from "./ValueComparison";
export * from "./FindingProjection";
export * from "./computeComparison";
export * from "./ComparisonRunService";
export * from "./FindingReviewService";
export * from "./CrossDocumentHandoff";
export * from "./ReadModels";
export * from "./materialization/ClaimBuilder";
export * from "./materialization/PdfMaterializer";
export * from "./materialization/VisionMaterializer";
export * from "./materialization/SpreadsheetMaterializer";
export * from "./materialization/DxfMaterializer";
export * from "./materialization/IfcMaterializer";
export * from "./ScopeService";
