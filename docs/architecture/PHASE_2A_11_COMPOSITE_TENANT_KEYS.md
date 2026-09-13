# Phase 2A-11 — Composite Tenant Keys for Phase 2A-12 Handoff

**Status:** DECIDED AND IMPLEMENTED
**Date:** 2026-09-13

## Decision

`EngineeringBomVersion` and `EngineeringBomRow` each carry a composite unique
constraint on `(companyId, id)`:

```prisma
model EngineeringBomVersion {
  ...
  @@unique([companyId, id])
}

model EngineeringBomRow {
  ...
  @@unique([companyId, id])
}
```

## Why

Phase 2A-12 will hold commercial records that reference engineering parents
(a BOM version, and rows within it). Those children must not be able to point at
an engineering parent belonging to another company. Two options existed:

1. **Global id + application-only tenant check.** The child stores only the
   parent `id`; correctness depends on every future code path remembering to
   verify the parent's company.
2. **Composite tenant key.** The schema itself can express
   `(companyId, id) -> parent`, so a child that carries a `companyId` can be
   constrained (or validated by join) against the parent *with company agreement
   enforced by the data model*, not only by application discipline.

Option 2 was chosen. A tenant boundary that only the application enforces is one
forgotten check away from a cross-tenant leak; a composite key makes the
agreement structurally expressible.

## Precedent

This is not a new pattern in VOKA. The schema already uses
`@@unique([companyId, id])` elsewhere (the established composite tenant-key
precedent), so Phase 2A-11 follows the existing convention rather than inventing
one.

## Why this is not a wasteful duplicate index

A narrow reading might object that `id` is already unique, so `(companyId, id)`
adds a redundant index. It does not, for two reasons:

- The composite key's purpose is **referential expressibility**, not lookup
  speed. It is the key a child foreign-key/validation join targets so that
  `companyId` agreement can be enforced by the schema.
- The extra index cost is bounded: it is only on BOM versions and rows, the two
  objects Phase 2A-12 must anchor to. No other 2A-11 model was given a redundant
  composite key.

## Scope guard

- No column was added; this is a constraint only.
- No established unique constraint was removed or weakened.
- The constraint belongs to the **additive** 2A-11 migration
  (`20260916000000_phase_2a_11_engineering_takeoff_bom`). No accepted 2A-10
  migration was touched.
