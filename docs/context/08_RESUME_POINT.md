<!-- VOKA-REQUIREMENT-EVIDENCE-ATTACHMENT-FOUNDATION-2026-09-10 -->

## Current execution — Requirement + Evidence + real attachment foundation — 2026-09-10

Implementation is on the Arena-fixed branch `arena/01a08c94-voka`. The requested
`e46857f` is available as `origin/v1-live-certification` after fetch, but this
checkout was not switched or reset because the Arena branch contained pre-existing
user work. The sprint checkpoint is
[Requirement + Evidence + Attachment Foundation](../checkpoints/2026-09-10-requirement-evidence-attachment-foundation.md).

Delivered: tenant-owned persisted SourceArtifact intake with real multipart bytes,
SHA-256 and local storage seam; bounded machine-readable PDF extraction with page
citations; Citation / Requirement / RequirementCitation additive schema; truthful
attachment, BOQ, and drawing inspection statuses; conservative BOQ review-required
requirements; shared Takeoff SourceArtifact linkage; Composer picker/drop/paste; and
active Sales Assistant governed workspace synchronization.

The active Vehicle Elevator regression now preserves system identity, quantity 1,
and six stops/floors through corrections and reconciliation without inventing an
engineering BOM. Images remain `STORED_PENDING_VISION`; drawing visual analysis,
OCR, XLSX/DOCX, automatic quantity extraction, Requirement review UI, and object
storage remain unavailable. Supplier/RFQ/PO/messaging/scraping and Data Factory
remain out of scope and paused.

Recovery validation is green for the affected foundation/runtime groups: 44 files
and 271 tests passed, with targeted ESLint and diff-check passing. Full Vitest
reached 334 passing files / 2,185 passing tests, with 15 files failing / 4 tests
failing because the generated Prisma client is absent. `npx prisma generate` was
attempted with local placeholder database URLs and was blocked downloading the
Prisma engine; `npm run typecheck` has the resulting generated-client cascade,
and `npm run build` is additionally blocked by Google Fonts network failures.
No database migration was deployed from this environment.

Exact next slice: validate the additive migration/generated client in the target
environment, then add only a small human Requirement review/correction surface.
Do not start Supplier Intelligence, RFQ/PO, drawing visual intelligence, or Data
Factory.

---

<!-- VOKA-V1-FINAL-CLOSURE-VOLTX-2026-09-10 -->

## VOKA V1 final product closure — 2026-09-10

Execution is on Arena-fixed branch `arena/01a08c94-voka`, with authoritative base
`f31b12fbb11339aa65698044c03e76189434f7fe`. This sprint is the current product
state for the Sales Assistant, Quotation, and Drawing Takeoff surfaces. Customer
identity is optional while a quotation remains a DRAFT; final approval/send still
requires a customer, resolved pricing, quantities, and product readiness.

Implemented in this slice: customer-optional quotation handoff/API/composer, explicit
candidate rejection and researched-fact approval, confirmed takeoff → quotation
draft conversion with provenance and unresolved pricing, preservation of multi-line
takeoff review state, terms/notes handoff, and quotation combobox ARIA ownership.
DB data and schema remain untouched. Data Factory remains paused. See the durable
checkpoint `../checkpoints/2026-09-10-v1-final-product-closure-voltx-arena.md`.

<!-- VOKA-PHASE4E-BIG-CLOSURE-SPRINT-2026-09-10 -->

## Phase 4E big closure sprint (execution-branch, non-authoritative) — 2026-09-10

A bounded shared-chrome + localization polish sprint ran on Arena execution
branch `arena/01a08bf6-voka`, based on authoritative HEAD
`f75b0c75fa376d5ab354f2ad1471747e4ec7bb1a`. It closed Group A (dashboard chrome
localization/nav consistency), Group B (catalog polish), Group C (Drawing Takeoff
XLSX localization), and a bounded Group D AR/EN error-leak sweep. Frozen areas,
DB data, and DB schema were untouched; typecheck/build are environment-deferred
(no Prisma client / network). Details:
[Phase 4E big closure sprint](../checkpoints/2026-09-10-phase4e-big-closure-sprint.md).
No authoritative-branch update, PR, merge, or tag from this sprint. No acceptance
status below is changed.

---

## Current Phase 4D handoff — 2026-09-10 office close

This section supersedes the night-close PENDING-visual language and older current-state/slice instructions below. Phase 4C and payment re-acceptance remain CLOSED. A/B/E remain PASS and must not be reopened.

Phase 4D **software engineering is CLOSED** on Arena `3d570b1f688d8bcf0806f9caf3587e15fb616bb1`.

- A Customers: PASS
- B Invoice list + Sales Order picker: PASS
- C Commercial documents: ENGINEERING PASS + **CEO VISUAL PASS**
- D Catalog XLSX import: PASS
- D2 Catalog Arabic UX: PASS
- E Catalog XLSX export: PASS
- F Sector installer: ENGINEERING/BEHAVIOR PASS
- UCL production content: **NOT MATERIALIZED** (taxonomy-only Security tree; JSONL artifacts not in Git; Data Factory PAUSED)

Do not keep 4D code open because a test DB lacks published items. Do not claim UCL production-content PASS.

Home resume: [office session close](../checkpoints/2026-09-10-office-session-close-home-resume.md). Night proof details remain in [night checkpoint](../checkpoints/2026-09-10-phase4d-night-close.md).

Next execution package (audit only, no 4E code yet): [Phase 4E readiness audit](../checkpoints/2026-09-10-phase4e-readiness-audit.md). First home implementation slice: **P1 Sales Order list localization**.

Quotation/Sales Assistant remain frozen. Data Factory remains PAUSED at System 008 / SEC-SYS008-B004. No Phase 4E implementation, PR, merge, tag or official-branch update from this audit.

---

<!-- VOKA-SLICE1-CANONICAL-CLOSURE-2026-09-09 -->

## Current resume point - 2026-09-09 (Slice 1 canonical closure)

**PHASE 4C = CLOSED.**

**LIVE-FAIL-001 / CEO-R1-030 = CLOSED.**

Official base: `7b00c857a39d4d0d8bd6d8fbe4434b2595ba5287`

- Engineering validation = PASS
- Live auth/session/platform acceptance = PASS
- Cross-Tenant Isolation = PASS 8/8 (`AUTH-DIRECT-ROUTE-GATE` CLOSED)
- Payment live re-acceptance = PASS (10.000 ISSUED; 4.000 → 201 PARTIALLY_PAID 4/6; register/statement/dashboard PASS; 6.000 → 201 PAID 10/0 form hidden; overpay 1.000 → 409 PAYMENT_CONFLICT, no extra payment)

Deferred, not blockers: D4 multi-membership selector (fail-closed); D5 refresh revocation (Phase 5); D6 broader expired-session UX.

Sales Assistant and Quotation remain CEO-FROZEN. Data Factory remains PAUSED. Do not reopen UCL foundation. **Do not start Phase 4D in this slice.**

Read the [current canonical acceptance ledger](../product/MASTER_PRODUCT_ACCEPTANCE_LEDGER.md) and [final verification checkpoint](../checkpoints/2026-09-09-phase4c-final-verification.md).

This resume point supersedes the older current-state instructions below, including the same-day Phase 4C PARTIAL / payment-not-closed snapshot.

<!-- VOKA-PHASE4C-FINAL-VERIFICATION-2026-09-09 -->

## Historical resume snapshot - 2026-09-09 (superseded)

Phase 4C was then ENGINEERING PASS / LIVE ACCEPTANCE PARTIAL / CROSS-TENANT LIVE PENDING at `fbc79c2ad435aada3d6c451dbd57f91c0f6e2573`. That snapshot is superseded by Slice 1 canonical closure above.

<!-- VOKA-UCL-PHASE4A-FINAL-CLOSE-2026-09-08 -->

## Phase 4A UCL Final Closure — 2026-09-08

**CLOSED / CEO ACCEPTED.**

Official product baseline before this documentation checkpoint:

`26713485d752a0ea96c6e89cd846c39bb46181d1`

Current accepted state:

- UCL-CLOSE-01 through UCL-CLOSE-06 = CLOSED / ACCEPTED.
- UCL-UX-01 Global Library Search = CLOSED / LIVE ACCEPTED.
- Phase 4A — UCL Final Closure = COMPLETE.
- Exact next execution slice = **Phase 4B — Sales Assistant + Quotation Final Acceptance**.
- Broad Data Factory harvesting remains PAUSED.
- Future Data Factory resume marker remains System008 / `SEC-SYS008-B004`.
- `LIVE-FAIL-001 / CEO-R1-030 — Payment Registration End-to-End` remains RED / RELEASE BLOCKER.
- `AUTH-DIRECT-ROUTE-GATE` remains OPEN for Phase 4C.
- Review-heading mojibake (`Review â†’ Approve...`) is a bounded UX/localization cleanup, not an open UCL governance gate.
- No merge to main. No release tag.

Canonical closure evidence:

`docs/checkpoints/2026-09-08-ucl-final-closure-session-close.md`

This section supersedes the earlier same-day CLOSE-06 `PENDING CEO LIVE UI ACCEPTANCE` status for current execution.

<!-- VOKA-CANONICAL-RELEASE-STATUS-2026-09-06 -->

## UCL-CLOSE-06 implementation — 2026-09-08

IMPLEMENTED / ENGINEERING VALIDATED / PENDING CEO LIVE UI ACCEPTANCE. Not closed:

- Operator E2E Batch Wizard on `/dashboard/universal-library/batches`.
- Journey: File → Upload → Batch → Process → Staging → Hierarchy → Products → Review → Publish → Status / History.
- Process API `POST /api/universal-library/bulk-import/ui/process` lands `NEEDS_REVIEW` and never publishes.
- Journey API `GET /api/universal-library/bulk-import/ui/journey` drives the 10-step stepper plus retry/resume affordances.
- Automated CLOSE-06 proof covers happy path, isolated failure, retry, remaining-record resume, invalid JSONL, and control-plane gating.
- Chunk Resume from history still requires re-selecting the original file.
- Selected batch identity persists in localStorage (`voka.ucl.batch-wizard.selection`).
- Journey counts separate pending vs succeeded vs failed; process remaining/retry
  does not republish or duplicate review-ready rows.
- Data Factory remains **PAUSED** at System008 / `SEC-SYS008-B004`.
- `LIVE-FAIL-001` and `AUTH-DIRECT-ROUTE-GATE` remain open and out of scope.
- No merge/tag. Do not claim UCL V1 fully closed.

Exact next UCL action:

**CEO live UI acceptance of UCL-CLOSE-06** on Batches, including error,
partial/failure, retry, and resume. Engineering implementation is complete:
Prisma generate/validate, 484 UCL tests in 68 files, typecheck, build and diff
checks passed. No next product phase starts until CEO acceptance.

See [engineering evidence and local DB migrations](../checkpoints/2026-09-08-ucl-close06-engineering-ready.md).

## Phase 4A UCL Session Closure — 2026-09-07

Accepted:

- 🟢 UCL-CLOSE-01 — Global Metrics Truth
- 🟢 UCL-CLOSE-02 — Staged vs Published Clarity
- 🟢 UCL-CLOSE-03 — Platform Admin / Control-Plane Boundary
- 🟢 UCL-CLOSE-04 — Review → Approve/Reject → Publish

Latest validation:

- full UCL + Auth regression: 57 / 57 test files PASS;
- 426 / 426 tests PASS;
- TypeScript PASS;
- Prisma validate PASS; all 45 repository migrations applied / database up to date;
- production build PASS; diff check PASS (CRLF conversion notices only);
- UCL control plane fails closed for an ordinary tenant OWNER/ADMIN;
- explicit platform allowlisting is required before global operator access is granted.

Pre-session remote baseline: `50fb05ab46a8f80278a00f880fa6cddca4a66956` on
`feature/pre-staging-product-coherence`. Commit and push of this bounded closure
were authorized; no merge to main or tag is authorized.
See the [session checkpoint](../checkpoints/2026-09-07-ucl-close04-session-close.md)
for final validation and live acceptance evidence. Its containing commit is the
durable closure checkpoint; do not infer a later publication or deployment.

Exact next execution slice:

**UCL-CLOSE-05 — Explicit Adoption / Commercial Truth**

UCL-CLOSE-06 remains OPEN. Data Factory remains PAUSED; future harvesting resumes
at **System008 — IP Video / SEC-SYS008-B004 — Hikvision IP fixed/network cameras**.
`LIVE-FAIL-001 / CEO-R1-030` Payment Registration remains RED/BLOCKER.
`AUTH-DIRECT-ROUTE-GATE` remains OPEN for Phase 4C.
Preserve the two CLOSE04 synthetic DB acceptance records. No manual Review API
403 call was executed in the final live pass; the API gate has automated proof.

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

## Resume Update — UCL-CLOSE-05 CLOSED — 2026-09-07

- `UCL-CLOSE-05 — Explicit Adoption / Commercial Truth` = **CLOSED / ACCEPTED**.
- Exact next UCL slice = `UCL-CLOSE-06 — E2E Batch Wizard`.
- Do **not** begin UCL-CLOSE-06 as part of the CLOSE-05 closure commit.
- Data Factory remains **PAUSED**.
- Exact future Data Factory resume remains:
  - System008 — IP Video
  - `SEC-SYS008-B004 — Hikvision IP fixed/network cameras`
- `LIVE-FAIL-001 — Payment Registration End-to-End` remains RED / RELEASE BLOCKER.
- `AUTH-DIRECT-ROUTE-GATE` remains OPEN for Phase 4C.
- No merge or release tag has been authorized as part of this closure.

## Resume Update — UCL-CLOSE-06 IMPLEMENTED — 2026-09-08

- `UCL-CLOSE-06 — E2E Batch Wizard` = **IMPLEMENTED / ENGINEERING VALIDATED / PENDING CEO LIVE UI ACCEPTANCE**.
- UCL V1 is **not** fully closed.
- Data Factory remains **PAUSED** at System008 / `SEC-SYS008-B004`.
- `LIVE-FAIL-001` remains RED / BLOCKER.
- `AUTH-DIRECT-ROUTE-GATE` remains OPEN for Phase 4C.
- No merge or release tag is authorized by this implementation.
