/**
 * Phase 2A-11: ENGINEERING TAKE OFF — the quantity taxonomy and the shared
 * vocabulary every other 2A-11 module reads.
 *
 * Phase 2A-11 owns ENGINEERING TRUTH. It does not own commercial truth and it
 * does not own procurement truth, and the vocabularies below are built so that
 * neither can be expressed:
 *
 * - there is no rate, amount, currency, price, discount, tax, margin, supplier,
 *   pack size, MOQ, order quantity, lead time, award, or purchase-order token
 *   anywhere in this phase;
 * - a quantity ORIGIN is not a quantity STATUS: `STATED` says where a number
 *   came from, `APPROVED_ENGINEERING` says a human governance decision adopted
 *   it. Collapsing the two is exactly the defect this phase exists to prevent.
 *
 * This module is pure: no Prisma, no HTTP, no I/O, no provider library.
 */

import { createHash } from "node:crypto";

// ---------------------------------------------------------------------------
// Quantity taxonomy
// ---------------------------------------------------------------------------

/**
 * The origins and states an engineering quantity can have.
 *
 * They are deliberately NOT collapsed:
 *
 * - `OBSERVED`           — a value was seen in a source but no quantity reading
 *                          was asserted for it (evidence exists, quantity does
 *                          not);
 * - `STATED`             — a document stated the quantity in its own words
 *                          (inherited from 2A-10 `STATED`);
 * - `DECLARED_MODEL`     — a BIM model declared the quantity as model evidence
 *                          (inherited from 2A-10 `DECLARED_MODEL`);
 * - `COUNTED`            — VOKA counted N eligible occurrences itself;
 * - `CALCULATED`         — VOKA derived the quantity from explicit governed
 *                          inputs through a versioned rule;
 * - `ADJUSTED`           — an approved base quantity plus an explicit
 *                          engineering adjustment;
 * - `APPROVED_ENGINEERING` — a human/governance decision adopted the result as
 *                          the engineering quantity of record.
 *
 * `APPROVED_ENGINEERING` is reachable only through an explicit governed
 * decision. No source, count, or calculation becomes approved by existing.
 */
export const ENGINEERING_QUANTITY_ORIGINS = [
  "OBSERVED",
  "STATED",
  "DECLARED_MODEL",
  "COUNTED",
  "CALCULATED",
  "ADJUSTED",
  "APPROVED_ENGINEERING",
] as const;
export type EngineeringQuantityOrigin = (typeof ENGINEERING_QUANTITY_ORIGINS)[number];

const ENGINEERING_QUANTITY_ORIGIN_SET = new Set<string>(ENGINEERING_QUANTITY_ORIGINS);
export function isEngineeringQuantityOrigin(value: string): value is EngineeringQuantityOrigin {
  return ENGINEERING_QUANTITY_ORIGIN_SET.has(value);
}

/**
 * Origins a CANDIDATE may carry.
 *
 * `APPROVED_ENGINEERING` is deliberately excluded: a candidate is what the
 * evidence supports, never what governance has adopted. A type-level exclusion
 * is stronger than a runtime check because it cannot be forgotten.
 */
export const CANDIDATE_QUANTITY_ORIGINS = [
  "OBSERVED",
  "STATED",
  "DECLARED_MODEL",
  "COUNTED",
  "CALCULATED",
  "ADJUSTED",
] as const;
export type CandidateQuantityOrigin = (typeof CANDIDATE_QUANTITY_ORIGINS)[number];

/** Origins that trace back to something a SOURCE asserted, as opposed to VOKA working one out. */
export const SOURCE_BACKED_ORIGINS: readonly CandidateQuantityOrigin[] = ["STATED", "DECLARED_MODEL"];
/** Origins VOKA produced itself from governed inputs. */
export const ENGINE_DERIVED_ORIGINS: readonly CandidateQuantityOrigin[] = ["COUNTED", "CALCULATED"];
/** Origins that only exist on top of an already-approved base quantity. */
export const DERIVED_FROM_APPROVAL_ORIGINS: readonly CandidateQuantityOrigin[] = ["ADJUSTED"];

// ---------------------------------------------------------------------------
// Requirement kind and scope nature
// ---------------------------------------------------------------------------

/**
 * What a BOM row requires. A service is never a fake product.
 *
 * `SERVICE` and `WORK` exist so that installation, commissioning, testing, and
 * labour can be carried in an engineering BOM WITHOUT inventing a manufactured
 * item and without a quantity that pretends to be a piece count.
 */
export const ENGINEERING_REQUIREMENT_KINDS = [
  "EQUIPMENT",
  "MATERIAL",
  "COMPONENT_OR_ACCESSORY",
  "SERVICE_OR_WORK",
] as const;
export type EngineeringRequirementKind = (typeof ENGINEERING_REQUIREMENT_KINDS)[number];

const ENGINEERING_REQUIREMENT_KIND_SET = new Set<string>(ENGINEERING_REQUIREMENT_KINDS);
export function isEngineeringRequirementKind(value: string): value is EngineeringRequirementKind {
  return ENGINEERING_REQUIREMENT_KIND_SET.has(value);
}

/**
 * Whether a requirement line is a physical article or a performed service.
 *
 * It exists so downstream phases can never mistake an installation service for
 * a manufactured quantity: the distinction is structural, not conventional.
 */
export const REQUIREMENT_NATURES = ["PHYSICAL_ARTICLE", "PERFORMED_SERVICE"] as const;
export type RequirementNature = (typeof REQUIREMENT_NATURES)[number];

const REQUIREMENT_NATURE_BY_KIND: Record<EngineeringRequirementKind, RequirementNature> = {
  EQUIPMENT: "PHYSICAL_ARTICLE",
  MATERIAL: "PHYSICAL_ARTICLE",
  COMPONENT_OR_ACCESSORY: "PHYSICAL_ARTICLE",
  SERVICE_OR_WORK: "PERFORMED_SERVICE",
};

/** The nature implied by a requirement kind. Deterministic, never configurable per row. */
export function requirementNatureForKind(kind: EngineeringRequirementKind): RequirementNature {
  return REQUIREMENT_NATURE_BY_KIND[kind];
}

// ---------------------------------------------------------------------------
// Readiness
// ---------------------------------------------------------------------------

/**
 * Truthful readiness of one engineering thing.
 *
 * It is separate from `APPROVED` on purpose: a thing can be fully evidenced,
 * calculated, and still be waiting for a human. `BLOCKED` is a first-class
 * answer, because a takeoff whose inputs are unresolved must say so rather than
 * present a plausible number.
 */
export const ENGINEERING_READINESS_STATES = [
  "NOT_READY",
  "BLOCKED",
  "REVIEW_REQUIRED",
  "READY_FOR_DECISION",
  "APPROVED",
] as const;
export type EngineeringReadinessState = (typeof ENGINEERING_READINESS_STATES)[number];

const ENGINEERING_READINESS_STATE_RANK: Record<EngineeringReadinessState, number> = {
  NOT_READY: 0,
  BLOCKED: 1,
  REVIEW_REQUIRED: 2,
  READY_FOR_DECISION: 3,
  APPROVED: 4,
};

/** Ranking, used only to pick the WEAKEST state across a set. Never a score. */
export function readinessRank(state: EngineeringReadinessState): number {
  return ENGINEERING_READINESS_STATE_RANK[state];
}

// ---------------------------------------------------------------------------
// BOM completeness
// ---------------------------------------------------------------------------

/**
 * Completeness of a whole BOM version.
 *
 * `PARTIALLY_APPROVED` exists because an approved subset is a real, usable
 * state. The model never lets one approved row promote the whole BOM, and never
 * lets one unresolved mandatory component silently disappear into "complete".
 */
export const BOM_COMPLETENESS_STATES = [
  "INCOMPLETE",
  "REVIEW_REQUIRED",
  "PARTIALLY_APPROVED",
  "APPROVED",
] as const;
export type BomCompletenessState = (typeof BOM_COMPLETENESS_STATES)[number];

// ---------------------------------------------------------------------------
// Versioning
// ---------------------------------------------------------------------------

/** Version of the engineering quantity decision contract. */
export const ENGINEERING_DECISION_VERSION = "2a-11.decision.v1";
/** Version of the occurrence counting rules. */
export const OCCURRENCE_COUNTING_VERSION = "2a-11.counting.v1";
/** Version of the engineering calculation rule contract. */
export const ENGINEERING_CALCULATION_VERSION = "2a-11.calculation.v1";
/** Version of the engineering adjustment rule contract. */
export const ENGINEERING_ADJUSTMENT_VERSION = "2a-11.adjustment.v1";
/** Version of the unit conversion contract. */
export const ENGINEERING_CONVERSION_VERSION = "2a-11.conversion.v1";
/** Version of the engineering BOM aggregate contract. */
export const ENGINEERING_BOM_VERSION = "2a-11.bom.v1";
/** Version of the 2A-12 read contract. */
export const ENGINEERING_HANDOFF_VERSION = "2a-11.handoff.v1";

// ---------------------------------------------------------------------------
// Deterministic identifiers
// ---------------------------------------------------------------------------

/**
 * Deterministic identifier helper.
 *
 * Every durable 2A-11 record derives its id from its own identity inputs, so
 * re-running a derivation over unchanged evidence collides with itself instead
 * of appending a duplicate. History can therefore only ever grow.
 */
export function engineeringId(prefix: string, namespace: string, parts: readonly (string | number | null | undefined)[]): string {
  const canonical = [`voka:2a-11:${namespace}:v1`, ...parts.map((part) => (part === null || part === undefined ? "" : String(part)))].join("\u0000");
  return `${prefix}_${createHash("sha256").update(canonical, "utf8").digest("hex")}`;
}

// ---------------------------------------------------------------------------
// Prohibited concepts
// ---------------------------------------------------------------------------

/**
 * Concepts Phase 2A-11 must never create, invoke, or persist.
 *
 * They are named here so a governance test can assert their absence from the
 * engineering schema and the engineering read contract positively, rather than
 * relying on nobody having added them yet.
 */
export const ENGINEERING_PROHIBITED_CONCEPTS: readonly string[] = [
  "Quotation",
  "QuotationLine",
  "Invoice",
  "ProductSelection",
  "Supplier",
  "ProcurementRequirement",
  "Rfq",
  "Offer",
  "Award",
  "PurchaseOrder",
  "packSize",
  "minimumOrderQuantity",
  "orderQuantity",
  "commercialRate",
  "commercialAmount",
  "currencyAmount",
] as const;

/** True when a token names a concept this phase is forbidden from creating. */
export function isProhibitedEngineeringConcept(token: string): boolean {
  const normalized = token.trim().toLocaleLowerCase();
  return ENGINEERING_PROHIBITED_CONCEPTS.some((concept) => concept.toLocaleLowerCase() === normalized);
}
