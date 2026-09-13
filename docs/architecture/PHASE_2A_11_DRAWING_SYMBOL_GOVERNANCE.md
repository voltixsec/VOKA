# Phase 2A-11 — Drawing-Symbol Governed Occurrence Counting: Capability Status

**Status:** RECORDED CAPABILITY BLOCKER (not implemented, not fabricated)
**Date:** 2026-09-13
**Applies to:** Phase 2A-11 engineering takeoff, consuming the accepted Phase 2A-10
cross-document evidence contract.

## 1. What the task required

Phase 2A-11 was asked to audit whether the current implementation supports
**human-reviewed drawing-symbol counting** with this governed chain:

```
2A-10 drawing / vision evidence
  -> symbol occurrence candidate
  -> exact page / region / source provenance
  -> human included / excluded decision
  -> occurrence ledger
  -> COUNTED candidate only after governed inclusion
```

with two explicit prohibitions:

- AI must never auto-approve a symbol occurrence.
- No aggregate count may be inferred from a vision summary.

And one explicit escape hatch:

> If 2A-10 cannot support safe symbol occurrence identity, **record a truthful
> blocker**, do not fabricate.

## 2. Audit result: the blocker is real

Phase 2A-10 deliberately does **not** retain a durable per-occurrence symbol
inventory. The evidence chain is decisive:

### 2.1 The DXF materializer publishes zero quantity claims from structural counts

`src/application/cross-document/materialization/DxfMaterializer.ts` (header and
constant `DXF_REFUSED_INGESTION_METRICS`) states that structural metrics —
`entityCount`, `entityRecordsRetained`, `entityTypeCounts`, `insertCount` — and
symbol counts **produce ZERO quantity claims**. Those metrics are retained only as
bounded structural context, never as an engineering quantity unit.

### 2.2 The retained model is bounded counts, not an entity inventory

`src/application/source-artifacts/IngestSourceArtifact.ts`
(`toStoredDxfModel` / `toStoredIfcModel`) persists only **bounded structural
counts** (the versioned `StoredDxfModel` / `StoredIfcModel` shapes). There is no
persisted list of individual drawing entities or symbol locations from which an
occurrence identity could be reconstructed.

### 2.3 The vision materializer treats a symbol as a candidate only

`src/application/cross-document/materialization/VisionMaterializer.ts`:
`SYMBOL_CANDIDATE` is a member of `DRAWING_QUANTITY_PROHIBITED_TYPES`
(alongside `PRINTED_SCALE`, `LEGEND_ENTRY`, `DETAIL_REFERENCE`,
`SECTION_REFERENCE`, `ELEVATION_REFERENCE`). A `SYMBOL_CANDIDATE` observation maps
to the `PROPERTY_VALUE` context predicate and carries the explicit annotation
*"a symbol candidate is a candidate only; it was never counted as equipment."*

### 2.4 The 2A-10 claim vocabulary has no counted-occurrence predicate

`src/domain/cross-document/EvidenceClaim.ts`:

- `CLAIM_PREDICATES` contains **no** counted-occurrence / occurrence-identity
  predicate. `PROPERTY_VALUE` is context, not a count.
- `QUANTITY_ORIGINS` is exactly `["STATED", "DECLARED_MODEL"]`. There is no
  "COUNTED_FROM_DRAWING" origin, and `APPROVED` is deliberately absent because
  approval is 2A-11's decision, never read back into an evidence claim.

**Conclusion:** 2A-10 exposes no durable per-occurrence symbol location with page /
region / source provenance. Symbol semantics are intentionally reduced to
candidate-level context claims and bounded aggregate counts. A safe physical
occurrence identity therefore **cannot** be constructed from the accepted 2A-10
contract.

## 3. Consequence in the 2A-11 implementation

Because no safe occurrence identity can be derived, the production occurrence
source is deliberately an honest empty source:

- `src/infrastructure/engineering-takeoff/compose.ts` binds
  `OccurrenceSourcePort` to `EmptyOccurrenceSource`, which returns `[]`.
- This is a **declared capability limit**, not a stub or placeholder: the
  composition root cannot fabricate occurrences that 2A-10 never published.
- The occurrence ledger, inclusion/exclusion decisions, and COUNTED-candidate
  promotion machinery **already exist** and are fully governed. They will accept
  real occurrences the moment a source that owns per-occurrence provenance is
  introduced. Nothing in the ledger requires redesign.

## 4. What is explicitly NOT done

- No symbol occurrence is auto-approved by AI.
- No aggregate count is inferred from any vision summary.
- No synthetic "occurrence" is manufactured from a structural count to make the
  pipeline look complete.
- No drawing-symbol API route is exposed, because there is no truthful data
  behind it yet.

## 5. Unblock path (for a future phase)

To enable governed drawing-symbol counting, an upstream phase must publish a
durable per-occurrence symbol inventory carrying, at minimum:

1. a stable occurrence identity within one artifact,
2. the exact page / region / coordinate provenance,
3. the source artifact + derivation-family lineage (Phase 2A-9),
4. an explicit "candidate, not counted" state that only a human decision can
   promote.

Until that contract exists, the truthful status is: **recorded capability blocker.**
