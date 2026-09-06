<!-- VOKA-CANONICAL-RELEASE-STATUS-2026-09-06 -->

## Canonical Release Status — 2026-09-06

The canonical current VOKA product/release acceptance source is:

`docs/product/MASTER_PRODUCT_ACCEPTANCE_LEDGER.md`

Future CTO/release sessions MUST read and update that ledger instead of
reconstructing current state from disconnected historical checkpoints.

Current release baseline before this documentation update:

- Branch: `feature/pre-staging-product-coherence`
- HEAD: `de3e1ce8cfdd90236f8ef25b7a89cac651f563a3`
- PR #83: merged
- GitHub Quality/verify: green
- Current phase: **Phase 4 — Final Product Closure**

Immediate execution order:

`4A UCL Final Closure`
→ `4B Sales Assistant + Quotation Acceptance`
→ `4C Authentication / Tenant / Security`
→ `4D Remaining Visible V1 Modules`
→ `4E Full AR/EN Responsive Sweep`
→ `Phase 5 Production Hardening`
→ `Phase 6 Release Candidate`
→ `Phase 7 Sep 15 Launch`.

Mandatory acceptance item:

`AUTH-DIRECT-ROUTE-GATE`

A logged-out user must not be able to access protected dashboard UI/data by
entering a direct nested URL. API-level 401 proof alone is insufficient.

Known canonical live failure must also remain visible until closed or explicitly
removed from V1 scope:

`LIVE-FAIL-001 / CEO-R1-030 — Payment Registration End-to-End`.

Supporting Release War Room Phase 2 evidence:

`docs/product/changes/2026-09-06-release-war-room-phase-2-audit.md`

That audit is supporting evidence only and does not replace the Master Product
Acceptance Ledger.

Historical sections below remain evidence, not competing current status.

---
# Resume Point

## Release stabilization local review — 2026-09-06

Phase 1 was validated locally against baseline `338a168` before CTO approval.
See the [Release War Room Phase 1 handoff](../product/changes/2026-09-06-release-war-room-phase-1.md)
for validation evidence, the subsequent bounded CTO corrections, and acceptance limits.
The validation branch was
`feature/pre-staging-product-coherence-2978252134715781250`.
This verified baseline supersedes older local-WIP descriptions below for this task.

## Local review handoff — 2026-09-02

The subsequent [quotation Draft-only correction](../product/changes/2026-09-02-quotation-draft-only-correction.md)
was recorded as uncommitted at that checkpoint: Draft labels/units, governed line identity, current scope Terms,
and Notes mapping, with its validation limits recorded separately.

The owner-requested [focused live commercial correction](../product/changes/2026-09-02-focused-live-commercial-correction.md)
was recorded as uncommitted WIP on `feature/pre-staging-product-coherence`, preserving
the preceding coherence pass. It records the current customer-required Draft policy,
component selection fixes, validation and remaining live acceptance. Do not treat
this local handoff as a published checkpoint or change to roadmap station order.

## Active feature execution — 2026-08-30

The current owner-authorized branch is `feature/pre-staging-product-coherence`.
See [Conversational Experience V2](../product/changes/2026-08-30-conversational-experience-v2.md)
for the latest implementation boundary, validation evidence and remaining manual acceptance, while
[Slice 2.2 payment percentages and validity](../product/changes/2026-08-28-professional-quotation-field-ownership.md#slice-22--payment-percentages-and-validity)
retains its own field-ownership acceptance checks. This
unmerged feature checkpoint supersedes the historical execution guidance below
for this task only; it does not change main or establish release readiness.

## Historical baseline

Verified on: 2026-08-20 (Asia/Kuwait)

## Current Verified State

- Canonical branch: `main`.
- Base GitHub main baseline: `87f985ce111d28eb2bd38416d3d1e199f35cda88` (PR #55 merged docs/architecture Phase 7).
- Phase 7A Commercial Document Foundation & Phase 7B.1 Contract MVP are implemented on the handoff branch and remain unmerged pending final CTO acceptance.

## Phase 7A & Phase 7B.1 Implemented Review Boundary

### Phase 7A — Commercial Document Foundation

Implemented and reviewed locally:

- Domain-owned canonical `CommercialDocumentKind` (`QUOTATION`, `SALES_ORDER`, `CONTRACT`, `INVOICE`, `PAYMENT`);
- Pure domain value object `CommercialDocumentProvenance` supporting `DIRECT` and sourced (`QUOTATION`, `SALES_ORDER`, `CONTRACT`) origins;
- Strict domain validation for provenance valid/invalid combinations;
- Shared pure commercial snapshot primitives (`CommercialCustomerSnapshot`, `CommercialLineSnapshot`, `CommercialTotals`, `CommercialConversionContract`);
- Pure domain unit tests for all valid/invalid provenance combinations.

### Phase 7B.1 — Contract MVP

Implemented and reviewed locally:

- Clean Architecture & DDD `Contract` aggregate, `ContractMilestone` entity, and `ContractNumber` value object (`CN-YYYYMM-XXXX`);
- Contract status limited to `DRAFT` for this slice;
- Server-authoritative commercial totals calculation;
- Milestone validation for percentage and fixed amount representations;
- Application repository interface (`IContractRepository`) and use cases (`CreateContractUseCase`, `GetContractUseCase`, `ListContractsUseCase`);
- Direct Contract creation supported as primary workflow without fake upstream quotation requirements;
- Additive database schema for `Contract`, `ContractLine`, and `ContractMilestone` models;
- Forward non-destructive migration `20260820200000_contract_mvp_foundation`;
- `PrismaContractMapper` and `PrismaContractRepository` infrastructure implementations;
- Authenticated, tenant-scoped API endpoints (`POST /api/contracts`, `GET /api/contracts`, `GET /api/contracts/[contractId]`);
- Tenant authorization (`OWNER`, `ADMIN`, `SALES` write; `VIEWER` read);
- Cross-tenant requests return safe 404 boundary (indistinguishable from missing resource).
- Direct creation ignores client provenance and always creates `DIRECT` contracts.
- Monthly contract numbers use an atomic company-scoped sequence.
- Catalog-linked lines use server-owned catalog identity/unit snapshots, canonical pricing, and DB-resolved tax.
- Repository updates require both contract id and company id.
- Contract list status is validated and missing/cross-tenant customers use a controlled not-found boundary.

## CTO Review Evidence

- Blockers 1-4: PASS in the local review worktree.
- Focused Contract gate: 6 test files / 23 tests PASS.
- TypeScript (`tsc --noEmit --incremental false`): PASS.
- Production compilation and type/lint phase: PASS; page-data collection could not run because `DATABASE_URL` is not configured in this worktree.
- Full test suite: 119 files PASS, 1 skipped, 1 environment-blocked (`Phase64BBlockerFixes.test.ts` imports Prisma without `DATABASE_URL`); 745 tests PASS, 2 skipped.
- Prisma validation could not load configuration because `DATABASE_URL` is not configured. The earlier Blocker #2 Prisma generate result remains historical evidence, not a fresh validation result.
- No commit, push, pull request, or merge has been performed for the CTO review changes.

## Continuing Guardrails

- Clean Architecture + DDD + dependency inversion.
- Domain stays independent of Next.js, Prisma, HTTP, browser speech APIs and AI providers.
- `companyId` always comes from authenticated server context.
- Cross-tenant resources use the established safe not-found boundary.
- Browser/client values are never canonical tax or totals authority.
- Approved quotation and Sales Order snapshots remain historical and immutable.
- AI produces proposals/drafts; consequential actions require human approval.

## Next Session Start Point

Phase 7A and Phase 7B.1 remain on the review branch pending final acceptance and publication workflow.
Do not begin **Phase 7B.2 / Contract UI / PDF rendering** or **Phase 7C Invoices** from this resume point until the current review changes are accepted and merged.

<!-- ADR-011-UCL-RESUME -->

## Approved Next Architecture — Universal Commercial Library

On 2026-08-20 the CEO approved the Universal Commercial Library architecture.

This decision must be preserved across future CTO sessions.

VOKA will ultimately support a very large shared commercial knowledge library
covering products and services across industries and countries.

This does NOT mean loading all records into a tenant catalog, browser session or
AI prompt.

The permanent architecture is:

Universal Commercial Library
-> bounded retrieval
-> explicit tenant adoption
-> canonical Company Catalog
-> Quotation / Contract / Sales Order / Invoice snapshots.

The Company Catalog remains tenant-owned operational truth.

The Universal Library is shared knowledge and discovery infrastructure.

Required future capabilities include taxonomy, manufacturers, brands, models,
variants, multilingual aliases, GTIN/EAN/UPC/MPN-style identifiers,
specifications, extensible attributes, provenance, confidence, entity
resolution, bundles/services, ingestion, source governance, licensing controls,
search ranking, caching and AI retrieval.

Performance is a hard architectural requirement:

large server-side corpus + small indexed retrieval + small client payload +
small AI context.

Never implement full-library browser loading or full-library AI context.

Canonical architecture:
`docs/ADR-011-UNIVERSAL-COMMERCIAL-LIBRARY.md`.


## Resume Guard — 2026-09-03 Product Intelligence Boundary

Do not re-merge the Universal Library type model into the commercial Catalog
type model.

`UniversalItemType`
= PRODUCT | SERVICE | SYSTEM | SOLUTION | SHIPPING | LABOR | DISCOUNT | CUSTOM

`CatalogItemType`
= PRODUCT | SERVICE | SHIPPING | LABOR | DISCOUNT | CUSTOM

SYSTEM/SOLUTION are UCL knowledge records only at the current commercial
frontier. They are excluded from default Commercial Hybrid Retrieval and
Company Catalog adoption.

Do not widen commercial documents merely because UCL supports SYSTEM/SOLUTION.

Smart System remains separate deterministic engineering/calculation execution.

Library population is separate from the Sales Assistant:

OpenAI/Web Research
-> governed discovery/structuring
-> evidence/provenance
-> validation/staging/review
-> UCL publication
-> bounded product consumption.

The Sales Assistant consumes governed published knowledge; it is not the
library-building engine.

Permanent scale invariant:

**Huge Library, Small Working Set.**

Canonical architecture:
`docs/ADR-011-UNIVERSAL-COMMERCIAL-LIBRARY.md`.
