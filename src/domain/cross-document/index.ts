/**
 * Phase 2A-10 — CROSS-DOCUMENT EVIDENCE + CONSISTENCY ENGINE (domain layer).
 *
 * The domain owns the vocabulary and the rules. It holds no Prisma, no HTTP,
 * no provider library, and no I/O: the application layer orchestrates, and the
 * infrastructure layer persists.
 *
 * What this phase does NOT do, by construction: it does not decide engineering
 * truth, calculate takeoff quantities, count equipment, measure geometry,
 * approve quantities, create a BOM, choose products, create quotation lines or
 * procurement demand, rank suppliers, or create RFQs, offers, awards, or POs.
 * Phase 2A-11 consumes this phase and makes its own governed engineering
 * quantity decisions.
 */

export * from "./EvidenceClaim";
export * from "./ComparisonPolicy";
export * from "./DocumentIdentity";
export * from "./SubjectMatching";
export * from "./CrossDocumentFindings";
export * from "./CrossDocumentLabels";
export * from "./FindingStatement";
