# Slice 3 — Engineering → Commercial BOM

Owner-authorized feature work on `feature/pre-staging-product-coherence`, from
`8309b0bd557f07175e3761125a59edfab0aeb479`. Unmerged, not deployed; manual CEO
acceptance is still required.

## Canonical boundary

Existing AI understanding → deterministic SmartSystem requirements → explicit
`CommercialRequirement` → tenant catalog match or temporary commercial item →
canonical proposal lines → existing quotation composer → explicit human save.

The application-owned commercial requirement records category, preferred
product/service type, sale quantity/unit, structured technical specifications,
source requirement, inputs/default provenance, calculation-rule version, match
state and mandatory review. Provider output cannot supply this structure.
Calculation rules remain unchanged; CCTV now exposes their sizing facts without
parsing human-readable formulas. Non-CCTV engineering and conversation flow are
not redesigned.

## CCTV matching and commercial units

- Existing tenant repository ports perform bounded bilingual searches (51 results
  per term). Only active, same-tenant products/services with an active compatible
  canonical sale unit are eligible. A capped search cannot establish uniqueness.
- Unique exact matches precede compatible matches. Multiple suitable options
  remain ambiguous, ranked by exactness then spare capacity then stable code/ID;
  ranking is not a design or price recommendation. Up to five choices are shown.
- Human candidate choices are revalidated against tenant, unit and specification
  evidence on every clarification turn. Stale/invalid selections cannot fabricate
  an identity and remain unresolved for review.
- NVR quantity uses required channels / stated catalog channel capacity. PoE
  quantity uses required camera ports / (stated catalog ports − the existing
  reserved-uplink allowance). Both round upward and retain review warnings.
- Cable remains `ceil(required metres / 305)` commercial rolls; metre-priced or
  differently sized products are not silently substituted. Cameras/recorders/HDDs/
  cabinets use discrete units; accessories retain Set and services Point under
  the existing template. No implicit pack, metre, TB or service-lot conversion.
- Real catalog identity, code, localized names, unit and existing trusted pricing
  flow into the proposal. Custom lines never invent IDs/SKUs or zero prices.

## Storage: commercial allocation, not verified engineering design

A clearly stated, unambiguous HDD capacity and a discrete sale unit enable a
preliminary `ceil(required TB / nominal catalog HDD TB)` commercial quantity.
This is not proof of usable capacity, RAID/reserve provision, recorder-bay count,
drive compatibility or retention performance. Those assumptions remain internal
and require human review. Alternatives expose their individual sale quantities.

Without sufficient product/capacity/unit evidence, the existing truthful storage
supply package remains one provisional package, not one disk. It remains
unpriced and requires confirmation. NVR maximum supported storage, capacity
ranges, unspecified HDDs and TB/pack-priced products are not treated as confirmed
disk allocations. Generic arrays/NAS need explicit usable-capacity/compatibility
modeling and are left for manual design rather than inferred from nominal TB.

## Presentation and pricing boundaries

Commercial match/ambiguity/temporary status, formula explanations and rule
versions appear in collapsed internal review. AR/EN choice labels show actual
commercial quantities and localized display units. A commercial match never
means design approval; the permanent estimate notice remains.

The composer continues to hydrate only canonical commercial lines, with its
explicit save whitelist excluding engineering metadata. Subject, Brief, Notes,
Terms, customer persistence, unknown-price save blocking and human approval
remain governed by [Slice 2/2.1](2026-08-28-professional-quotation-field-ownership.md).
No PDF renderer changes are required: the saved quotation contains no internal
engineering rows or formulas.

Existing catalog price/currency and optional explicitly marked AI-estimate
semantics are unchanged. This slice adds no market pricing, FX or price provider;
unavailable prices remain null/NEEDS_CONFIRMATION unless the existing pricing
path legitimately supplies them. Provisional storage is excluded from estimation.

## Validation

- Final focused regression run: **256 passed / 27 files**. Includes SmartSystem,
  commercial intelligence, Slice 1 completion, Slice 2/2.1 composer behavior,
  Voice UI, localized choices and unit display. A new composer test initially
  raced hydration; it now waits for the populated value, not merely the input.
- Full suite (one run): **1,506 passed, 2 skipped / 228 passed files, 1 skipped**.
  Known best-effort localization tests log dummy-database authentication warnings;
  none failed. The final non-CCTV scope guard and its added regression were then
  verified by the focused run above and final build; the full suite was not repeated.
- Standalone typecheck passed. Production build passed, including its final
  type/lint checks; only existing hook-dependency and combobox ARIA warnings.
- Prisma schema validation passed using a non-secret dummy validation URL; no
  schema/migration/generated-client/dependency changes. `git diff --check` passed.
- Live tenant hardware compatibility, voice/browser and AR/EN PDF acceptance
  remain manual checks, not claimed by these automated tests.

## Manual CEO acceptance

1. Request a 180-camera supply/install system in AR and EN. Confirm professional
   BOM names, COMPLETE SmartSystem, no repeat camera-count question and estimate
   notice. Expand internal assumptions; never mistake match status for approval.
2. With one eligible 18TB tenant HDD, inspect its real code/ID, 26-unit preliminary
   allocation at the default 467TB requirement and trusted price. Review bays,
   RAID/reserve, retention, network power and actual site constraints separately.
3. With 16TB and 18TB options, inspect alternatives, choose one, and answer project/
   attention/validity by voice/text. Confirm selection and BOM persist and no
   document is created automatically.
4. Without eligible storage, confirm an unpriced provisional package, no invented
   SKU and no raw required-TB quotation line. Enter/clear a price and verify save
   remains blocked while any price is unresolved.
5. Open the existing quotation composer. Check customer, title/brief, Notes,
   Terms/default replacement, commercial units and prices. Save explicitly;
   inspect AR/EN PDF for commercial rows only, without engineering formulas.

## Limits

Catalog compatibility is conservative name/spec/unit evidence, not a hardware
compatibility database. Missing catalog translations remain tenant data. Power
budgets, disk bays, RAID/reserve, rack dimensions, layouts and larger catalog
searches require human review. Other systems, drawing architecture, pricing
completion (Slice 5), migrations and deployment are outside this slice.
