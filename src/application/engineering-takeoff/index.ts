/**
 * Phase 2A-11 — ENGINEERING TAKEOFF + GOVERNED BOM (application layer).
 *
 * This layer orchestrates the accepted Phase 2A-10 evidence handoff into
 * governed engineering truth, and publishes the stable read contract Phase 2A-12
 * consumes. It owns no commercial or procurement concept: the store surface it
 * depends on (`EngineeringStore`) composes engineering stores only, so there is
 * no code path from this layer to a Quotation, Invoice, ProductSelection,
 * Supplier, ProcurementRequirement, Rfq, Offer, Award, or PurchaseOrder.
 */

export * from "./ports";
export * from "./EngineeringTakeoffService";
export * from "./EngineeringDecisionService";
export * from "./EngineeringCalculationService";
export * from "./EngineeringAdjustmentService";
export * from "./EngineeringBomService";
export * from "./EngineeringBomHandoff";
