# VOKA — Master Product Acceptance Ledger

<!-- VOKA-RELEASE-WAR-ROOM-2026-09-06 -->

# CURRENT RELEASE WAR ROOM RECONCILIATION — 2026-09-06

> **CURRENT OPERATIONAL AUTHORITY**
>
> This section supersedes older "active program" labels for current execution
> priority only. Historical sections below remain immutable evidence.
>
> Current program:
>
> **PHASE 4 — FINAL PRODUCT CLOSURE**
>
> Release target:
>
> **VOKA V1 — Production Launch / Early Access — 2026-09-15**

## Current Release Baseline

Session closure checkpoint — **2026-09-07**:

- Pre-session remote baseline: `50fb05ab46a8f80278a00f880fa6cddca4a66956`.
- **UCL-CLOSE-01 through UCL-CLOSE-04 = 🟢 CLOSED / ACCEPTED** by the CEO.
- Exact next slice: **UCL-CLOSE-05 — Explicit Adoption / Commercial Truth**.
- UCL-CLOSE-06 remains open; UCL as a whole is not yet declared closed.

Later same-day CLOSE-05 was accepted. On **2026-09-08**, UCL-CLOSE-06 was
implemented on `arena/01a08189-voka` and remains **OPEN** pending live CEO
operator acceptance. Do not declare UCL V1 closed.
- [Closure evidence, migrations and validation](../checkpoints/2026-09-07-ucl-close04-session-close.md).
- Data Factory remains PAUSED at System008 / `SEC-SYS008-B004`.
- `LIVE-FAIL-001 / CEO-R1-030` remains RED/BLOCKER;
  `AUTH-DIRECT-ROUTE-GATE` remains OPEN for Phase 4C.

Branch:

`feature/pre-staging-product-coherence`

Verified release baseline before this documentation-only reconciliation:

`de3e1ce8cfdd90236f8ef25b7a89cac651f563a3`

PR #83 is merged into this baseline.

Important merged release-stabilization lineage:

- `17897e9` — restore capacity-based storage commercialization;
- `0031402` — isolate injected persistence tests from runtime Prisma;
- `3f10a92` — record Release War Room Phase 1 validation;
- `4256089` — normalize bulk-upload filenames across Windows/Linux boundaries;
- `de3e1ce` — merge PR #83 into the integration/release baseline.

GitHub `Quality/verify` passed after the cross-platform filename correction.

Current operating rule:

**Do not build more VOKA. Close VOKA for release.**

---

# CURRENT STATUS PRIORITY

The historical CEO Acceptance Round 1 remains authoritative.

Do not replace its 40 findings with a newer audit.

Current-state reconciliation model:

CEO Acceptance Round 1
+
later implementation / PR evidence
+
Product Intelligence / UCL evidence
+
Sales Assistant approved rules
+
Release War Room findings
=
this single Master Product Acceptance Ledger.

Automated tests alone do not close browser/manual workflow findings.

---

# 🔴 CONFIRMED LIVE RELEASE BLOCKER

## LIVE-FAIL-001 / CEO-R1-030 — Payment Registration End-to-End

Status:

🔴 **BROKEN LIVE / BLOCKER — REMAINS OPEN**

The pre-existing Master Ledger records a CEO-observed live failure in the
Invoice → Payment commercial lifecycle.

No later live CEO acceptance has been recorded that closes it.

Required governed journey:

Issued Invoice
→ valid governed payment
→ immutable payment record
→ invoice recalculation
→ invoice history
→ Payments register
→ Customer Statement
→ Dashboard / summaries
→ audit event
→ meaningful notification where applicable.

A code implementation or isolated passing test is not sufficient for closure.

This blocker may leave V1 only through one of two explicit paths:

1. successful live end-to-end acceptance; or
2. explicit CEO decision to remove/hide/defer the affected Payment workflow from V1.

Do not silently downgrade it.

---

# 🟡 NEW MANDATORY AUTHENTICATION ACCEPTANCE GATE

## AUTH-DIRECT-ROUTE-GATE

Status:

🟡 **OPEN / ACCEPTANCE REQUIRED**

Scenario:

A fully logged-out user manually enters a protected nested URL directly, e.g.:

`/dashboard/sales-assistant`

`/dashboard/quotations/...`

`/dashboard/customers/...`

`/dashboard/settings/...`

`/dashboard/sales-orders/...`

`/dashboard/invoices/...`

Required behavior:

Logged out
→ protected page and protected data do not render
→ authentication gate/login is enforced
→ valid safe `returnTo` may restore navigation after authentication.

API-level 401 evidence alone does NOT close this finding.

Manual browser acceptance must include:

- clean incognito/logged-out session;
- direct nested protected URLs;
- stale/expired cookies;
- logout then browser-back behavior;
- no protected-data flash before redirect;
- safe `returnTo`;
- protected APIs remain unauthorized.

Escalation rule:

If protected UI/data is available without authentication:

🔴 **P0 RELEASE BLOCKER**

This finding must remain in the Master Ledger until directly accepted.

---

# RELEASE WAR ROOM PHASE 2 AUDIT — EVIDENCE RECONCILIATION

Evidence document:

`docs/product/changes/2026-09-06-release-war-room-phase-2-audit.md`

The audit reported:

- readiness estimate: 78/100;
- P0: 0;
- P1: 3;
- P2: 12;
- Post Release: 8.

The audit is preserved as supporting evidence only.

It is NOT the canonical product status because its execution was incomplete and
several conclusions conflict with stronger existing evidence.

## KILO-AUDIT-DELTA-01 — React Hook Warnings

The audit labeled hook warnings both P1 and P2.

Canonical release treatment:

🟡/P2 **NON-BLOCKING unless a concrete live functional failure is proven.**

Missing React hook dependencies can create stale behavior or incorrect effects,
but warning existence alone is not evidence of a release-blocking memory leak.

The audit table lists nine hook dependency warnings, despite the executive text
referring to eight, plus one ARIA combobox warning.

Do not make "zero hook warnings" a Sep 14 release criterion unless one is tied to
an actual release-critical defect.

## KILO-AUDIT-DELTA-02 — Tenant Isolation

The audit did not prove a tenant leak.

It recorded tenant isolation as unverified.

Canonical treatment:

🟡 **SECURITY ACCEPTANCE GATE**

Required:
representative tenant-isolation verification across customers, quotations,
orders, invoices/payments, Company Catalog, settings, and global UCL boundaries.

If any credible cross-tenant exposure is found:

🔴 **P0 RELEASE BLOCKER**

## KILO-AUDIT-DELTA-03 — Sales Assistant Rules

The audit did not prove the Sales Assistant rules are absent.

It recorded them as unverified and even listed paths as unknown/search required.

Canonical treatment:

🟡 **COMPLIANCE / FINAL ACCEPTANCE REQUIRED**

Do not rewrite or implement all rules from scratch.

Verify current implementation against approved behavior and correct only real
divergences.

## KILO-AUDIT-DELTA-04 — Audit Completeness Limit

The Phase 2 audit itself contains unresolved audit gaps:

- skipped-test register was not completed;
- deployment readiness remained UNKNOWN;
- core-journey evidence was largely "components exist";
- tenant proof was not executed;
- Sales Assistant rules were not inventoried;
- test execution was described as partial;
- severity classification duplicated hook warnings;
- report final Git state said clean even though the report itself remained an
  untracked file in the actual repository state.

Therefore its `78/100` is an auditor estimate, not the canonical VOKA release
readiness authority.

---

# 🟡 SALES ASSISTANT FINAL ACCEPTANCE

Substantial governed implementation exists.

Do not rebuild its foundation.

Final acceptance must verify at minimum:

- conversation → workspace synchronization after every turn;
- corrections replace stale governed facts;
- rejected facts do not remain active;
- explicit approval promotes governed state;
- Draft can be created without Customer Name;
- Draft can be created without Attention/Contact;
- Company Terms & Conditions load from current scope/request defaults;
- SUPPLY vs SUPPLY_AND_INSTALLATION behavior is correct;
- site readiness goes to Notes;
- responsibility boundaries go to Notes;
- exclusions go to Notes;
- access requirements go to Notes;
- jurisdiction remains governed;
- catalog-first product retrieval;
- bounded web fallback only when necessary;
- governed ranked options;
- unknown price remains null/pending, never fabricated zero;
- engineering requirements do not become invented commercial products;
- ambiguous catalog matches remain ambiguous;
- no cross-tenant product binding;
- inactive/stale product binding is rejected;
- stale approved selection is not replayed;
- provenance survives commercial projection;
- no raw enums leak to the user;
- Arabic UI does not display raw `SUPPLY_AND_INSTALLATION`;
- CTA/readiness statements remain truthful;
- Chat → Workspace → Draft/Quotation remains coherent;
- Arabic/English locale integrity is maintained.

Status remains:

🟡 **IMPLEMENTED / FINAL ACCEPTANCE PENDING**

---

# 🟡 QUOTATION FINAL ACCEPTANCE

Required end-to-end browser journey:

Sales Request
→ Sales Assistant
→ Product / Solution
→ Quotation Draft
→ Edit
→ Save
→ Preview / PDF
→ Retrieve later
→ Revise
→ Commercial output.

Acceptance includes:

- Customer optionality at Draft;
- Attention optionality at Draft;
- scope;
- current Terms;
- governed Notes;
- line identity;
- units;
- quantities;
- pricing / unknown-price behavior;
- tax;
- totals;
- Arabic;
- English;
- PDF;
- persisted historical truth;
- reopen / continue.

Status:

🟡 **FINAL LIVE ACCEPTANCE REQUIRED**

---

# UNIVERSAL COMMERCIAL LIBRARY — FINAL CLOSURE

Historical UCL-1 through UCL-6 architecture/foundation remain preserved and
must NOT be rebuilt.

The items below use the prefix `UCL-CLOSE-*` deliberately to avoid confusion
with historical UCL-1 through UCL-6.

## UCL-CLOSE-01 — Global Metrics Truth

Status:

🟢 **CLOSED — IMPLEMENTATION + REGRESSION + LIVE UI ACCEPTED**

Closure date:

**2026-09-06**

Accepted truth:

- Total Staged Commercial Records is global governed staging truth;
- Total Product Models is global governed staging truth;
- Total Items is global governed staging truth;
- Total Services is global governed staging truth;
- Matching Records is the current filtered server result;
- Loaded / Current Page is explicitly bounded page state;
- PUBLISHED / REJECTED / FAILED records are excluded from staged global totals.

Evidence:

- focused UCL suite before targeted regression: 44 files / 392 tests PASS;
- targeted metrics regression: 2 files / 2 tests PASS;
- TypeScript PASS;
- live CEO browser acceptance at `/dashboard/universal-library/products`;
- live values: 3,248 Product Models + 40 Items + 48 Services = 3,336 Total Staged Commercial Records;
- Loaded / Current Page = 50.

**UCL-CLOSE-01 = 🟢 CLOSED**

## UCL-CLOSE-02 — Staged vs Published Clarity

Status:

🟢 **CLOSED — LIVE UI ACCEPTED**

Closure date:

**2026-09-06**

Accepted operator truth:

**Staged record != Published Canonical Library record.**

Live evidence at
`/dashboard/universal-library/population`:

- Mode: Governed Staging;
- Publication: Review Required;
- population copy explicitly states staging occurs without direct publication;
- governance copy states Evidence before publication;
- the operator console does not represent discovered candidates as already canonical.

No code correction was required for this closure.

**UCL-CLOSE-02 = 🟢 CLOSED**

## UCL-CLOSE-03 — Platform Admin / Control-Plane Boundary

Status:

🟢 **CLOSED — PLATFORM CONTROL-PLANE BOUNDARY ACCEPTED**

Closure date:

**2026-09-06**

Accepted security boundary:

Global UCL operator capabilities are not granted merely because a tenant
membership has OWNER or ADMIN role.

Implementation:

- dedicated server-side platform-admin authorization boundary;
- explicit platform allowlist via authenticated user id/email;
- configured through `VOKA_PLATFORM_ADMIN_USER_IDS` / `VOKA_PLATFORM_ADMIN_EMAILS`, independently of CompanyRole;
- fail-closed when no platform allowlist matches;
- UCL operator dashboard is server-gated;
- global acquisition, population, ingestion, staging and bulk-import control-plane routes require platform-admin authorization;
- no Prisma schema or database migration was required.

Automated evidence:

- dedicated platform authorization tests: 6 / 6 PASS;
- full UCL + Auth regression: 50 / 50 test files PASS;
- full UCL + Auth regression: 409 / 409 tests PASS;
- TypeScript PASS;
- git diff check contains line-ending warnings only.

Live CEO security acceptance:

1. authenticated company administrator without platform allowlist:
   `/api/universal-library/staging/products?limit=1`
   returned `403 PLATFORM_ADMIN_REQUIRED`;

2. after explicitly allowlisting
   `admin@voka.local` as a platform administrator:
   the same API returned `success: true` and governed UCL data;

3. the server-gated
   `/dashboard/universal-library/products`
   operator UI opened successfully for that explicitly allowlisted user.

Therefore:

**Company OWNER/ADMIN != VOKA Platform Admin**

and the global UCL control plane is no longer an ordinary tenant governance power.

**UCL-CLOSE-03 = 🟢 CLOSED**

Additional final live acceptance: a logged-in company administrator without
platform allowlisting was redirected from `/dashboard/universal-library/review`
to `/dashboard`. Published reads and explicit tenant adoption remain tenant scoped.

## UCL-CLOSE-04 — Review → Approve/Reject → Publish

Status:

🟢 **CLOSED / ACCEPTED — 2026-09-07**

Accepted implementation:

- Processing routes valid normalized candidates to `NEEDS_REVIEW`, never directly
  to publication. Automated malformed/normalization failures use `FAILED`.
- Explicit `ReviewIngestionRecord` APPROVE/REJECT decisions use the authenticated
  server actor; client reviewer identity is not authoritative.
- Publication uses persisted staged state. Publish and reject both require
  `NEEDS_REVIEW`; transactional state guards prevent double decisions.
- Review decisions append `UniversalIngestionReviewEvent` history with actor,
  decision, note and time. `REJECTED` is reserved for explicit reviewer decisions.
- The operator sees source/type/verification/trust, source and canonical links,
  attribution/fetch metadata when available, publication target, normalized
  candidate and raw payload before publication.

CEO-supplied final live acceptance evidence:

- `VOKA-UCL-CLOSE04-LIVE-APPROVE-20260907`: `PUBLISHED`, matched item
  `cmtqc2k8k0003i8t1z4etlzwh`, latest decision `APPROVED`.
- `VOKA-UCL-CLOSE04-LIVE-REJECT-20260907`: `REJECTED`, matched item null,
  latest decision `REJECTED`.
- Both latest decisions carry authenticated actor `cmsaa0wym00000ct1nju00h2l`
  (`admin@voka.local`). Preserve both synthetic records as acceptance evidence.
- A separate manual browser-console 403 call to `/api/universal-library/review`
  was **not executed** in the final pass. Denial is covered by route tests,
  the earlier shared platform-gate live proof and the Review UI redirect proof.

Final closure validation: 57 files / 426 tests PASS; typecheck PASS; Prisma
validation PASS; all 45 repository migrations applied / database up to date.
See the [bounded checkpoint](../checkpoints/2026-09-07-ucl-close04-session-close.md)
for migration names, build result and acceptance limitations.

## UCL-CLOSE-05 — Explicit Adoption / Commercial Truth

Status:

🟡 **OPEN — EXACT NEXT SLICE / LIVE ACCEPTANCE REQUIRED**

Prove:

Universal Library item
→ explicit tenant adoption
→ Company Catalog
→ tenant-owned mutable commercial fields
→ quotation uses tenant Catalog snapshot.

Universal data must never overwrite tenant commercial truth.

## UCL-CLOSE-06 — End-to-End Batch Wizard

Status:

🟡 **IMPLEMENTED / CEO OPERATOR ACCEPTANCE REQUIRED — 2026-09-08**

Do **not** treat this slice as CLOSED. Automated proof exists; live CEO
operator acceptance has not been executed in this environment.

Implemented bounded operator journey on `/dashboard/universal-library/batches`:

File
→ Upload
→ Batch
→ Process
→ Staging
→ Hierarchy
→ Products
→ Review
→ Publish
→ Status / History.

Implemented behavior:

- Upload remains bounded resumable JSONL staging and never publishes.
- Process claims only the logical batch's acquisition runs (`FOR UPDATE SKIP LOCKED`).
- Process normalizes and lands `NEEDS_REVIEW`; `publishedCount` must stay `0`.
- Failed records stay failed inside the same process pass and can retry on a later pass.
- Remaining RECEIVED records can resume without replaying review-ready rows.
- Failed/missing chunks remain resumable through the existing chunk uploader.
- History **Resume** still requires re-selecting the original file; it fills the
  batch keys and opens upload. **Process remaining** loads keys into the wizard
  without requiring a file.
- Process and journey APIs are platform-admin gated (`OWNER`/`ADMIN`) and do not
  expose the operational secret to the browser.

Automated evidence (this implementation slice):

- CLOSE-06 focused suite: 8 files / 21 tests PASS
  (`ProcessBulkImportWizardBatch`, `GetBatchWizardJourney`,
  `UclClose06E2EBatchWizard`, mapper, process/journey routes, wizard UI,
  `UclControlPlaneBoundary`).
- Broader UCL + operator UI run in this sandbox: 51 files / 297 tests PASS.
  Nine additional files did not load because `lib/generated/prisma` is gitignored
  and `prisma generate` could not download engines here. That is an environment
  limit, not a CLOSE-06 product failure.

Live CEO operator acceptance remains required. No `DATABASE_URL` was available
in this worktree, so no live Batches journey was executed.

When `UCL-CLOSE-01` through `UCL-CLOSE-06` are all accepted:

**UCL V1 IMPLEMENTATION = 🟢 CLOSED / FROZEN**

After that, do not reopen UCL engineering for V1 except for a confirmed blocker
or regression.

Normal future activity becomes controlled data population.

---

# DATA FACTORY — PAUSED DURABLE RESUME

Status:

⚪ **PAUSED BY RELEASE DECISION**

Do not restart broad harvesting during Release Closure.

Latest preserved production direction:

Systems002–007 production pass completed.

Current unfinished system:

**System008 — IP Video**

Exact future resume:

**SEC-SYS008-B004 — Hikvision IP fixed/network cameras**

B004 research/validation progress existed but was not durably
produced/merged/checkpointed.

Do not invent a later durable checkpoint.

Recent cumulative Data Factory artifacts include:

- `VOKA_UCL_LIBRARY_CURRENT.jsonl`
- `VOKA_UCL_LIBRARY_CURRENT_MANIFEST.json`
- `VOKA_UCL_IDENTITY_INDEX.json`

Older source-data filenames must be recovered from physical evidence rather than
guessed.

---

# CURRENT RELEASE EXECUTION PLAN

## PHASE 1 — Core Commercial Foundation

Status:

🟢 **IMPLEMENTED FOUNDATION**

## PHASE 2 — AI Sales OS Foundation

Status:

🟢 **IMPLEMENTED FOUNDATION**
with remaining live acceptance items.

## PHASE 3 — Universal Commercial Library Foundation

Status:

🟢 **IMPLEMENTED FOUNDATION**
with `UCL-CLOSE-05` and `UCL-CLOSE-06` remaining before implementation
freeze.

## PHASE 4 — Final Product Closure

Status:

🚧 **CURRENT PHASE**

Execution order:

### 4A — UCL Final Closure

UCL-CLOSE-01 through UCL-CLOSE-04 are accepted. Next close UCL-CLOSE-05,
then UCL-CLOSE-06.

### 4B — Sales Assistant + Quotation Final Acceptance

Close governed conversational/commercial journey.

### 4C — Authentication / Tenant / Security Acceptance

Mandatory:
`AUTH-DIRECT-ROUTE-GATE`
plus representative tenant-isolation proof.

### 4D — Remaining Visible V1 Modules

Any visible module must be usable or explicitly hidden/deferred.

Includes review of:

Customer
Company Settings
Sales Order
Invoice
Payments
Shared Documents / Delivery
Authorized Signatories
Branding
Dashboard
Drawing / Takeoff scope.

### 4E — Full Responsive Arabic / English Sweep

Final user-facing acceptance across AR/EN, RTL/LTR, states, terminology and
responsive behavior.

## PHASE 5 — Production Hardening

Required:

- production DB/migration rehearsal;
- backup/restore proof;
- tenant isolation;
- secrets/env;
- production providers;
- failure/timeouts/fallback;
- observability;
- production performance;
- deployment configuration.

## PHASE 6 — Release Candidate

Required:

- clean production-style deployment;
- smoke tests;
- critical journey acceptance;
- blocker-only corrections;
- Sep 14 Go / No-Go.

## PHASE 7 — Launch

Target:

**2026-09-15**

VOKA V1 — Production Launch / Early Access.

Sep 15–20:
marketing launch execution.

---

# SEP 14 GO / NO-GO

GO requires:

- zero active 🔴 blockers;
- all launch-critical yellow/P1 items closed or explicitly CEO-waived;
- CI green;
- typecheck/build green;
- production migration rehearsal green;
- critical manual journey green;
- `AUTH-DIRECT-ROUTE-GATE` green;
- tenant-isolation smoke test green;
- production provider configuration proven;
- critical PDF/output proven.

---

# RELEASE GOVERNANCE UPDATE RULE

After every CEO acceptance, bounded correction, PR closure or release slice:

1. update this same Master Product Acceptance Ledger;
2. preserve historical findings;
3. attach exact automated evidence where applicable;
4. attach live/manual CEO evidence where required;
5. record commit/PR/checkpoint if published;
6. update `docs/context/08_RESUME_POINT.md`;
7. never create a competing current-status ledger;
8. never downgrade a known live failure from code inspection alone.

This document remains the canonical current operational acceptance source.

---


Status: **LIVING SOURCE OF TRUTH**
Owner: **CEO + CTO**
Last reconciled: **2026-09-06 — Release War Room / UCL final closure reconciliation**
Current branch: `feature/pre-staging-product-coherence`
Verified pre-reconciliation checkpoint HEAD: `006bdc72bf0bd19098aae84e74d54a6618c6c15a`

## 1. Purpose

This ledger is the current operational source of truth for VOKA product acceptance.

It does not replace or rewrite historical evidence. It reconciles:

1. Current code and current Git state.
2. Git history and implementation commits.
3. CEO hands-on acceptance evidence.
4. Automated test evidence.
5. Historical product documentation.
6. Known live failures.
7. Paused work and current execution priorities.

Historical authoritative records remain immutable:

- `docs/product/changes/2026-08-27-ceo-acceptance-review-round-1.md`
- `docs/product/changes/2026-08-27-ceo-acceptance-implementation-checklist.md`

The CEO Acceptance Review remains the historical record of what was observed.
This ledger records what is true now.

---

# 2. Status Model

## 🟢 CLOSED / PROTECTED

The governed user outcome is accepted and should not be redesigned without a new product decision.

Closure requires:

- implementation evidence;
- automated gates where applicable;
- live workflow evidence;
- CEO/CTO acceptance;
- a preserved checkpoint.

## 🟡 IMPLEMENTED / ACCEPTANCE PENDING

Substantial or complete implementation exists, but one or more live, data-backed, responsive, migration, or workflow acceptance gates remain.

Code existence alone is not closure.

## 🔴 OPEN / PARTIAL / BROKEN LIVE

The required outcome is incomplete, unimplemented, or has failed live acceptance.

A working API, component, or isolated test does not override a failed user workflow.

## ⚪ DEFERRED

Explicitly excluded by CEO decision.

Deferred does not mean defective.

---

# 3. Permanent Governance Rules

## G-001 — Commercial Authority Boundary

**AI understands. Rules calculate. Human approves.**

Generative output may understand, research, propose, clarify, recommend, and prepare work.

Consequential commercial truth remains governed by deterministic rules, domain logic, server authority, and human approval.

## G-002 — Workflow Acceptance

A feature is not complete because a button, API, class, test, or component exists.

Acceptance is based on the complete user outcome.

Examples:

- Voice must survive pause → continue → review.
- Payment must update every authoritative dependent.
- Drawing must reach clarification/review/commercial handoff.
- Import must complete template → mapping → validation → preview → safe import.
- Notifications must be actionable and persistent.

## G-003 — Commercial Truth

Screen, PDF, XLSX, dashboard, reports, and downstream documents must derive from authoritative governed values.

No implicit cross-currency aggregation or invented FX is allowed.

## G-004 — Historical Immutability

Approved commercial snapshots, quotation revisions, source provenance, document history, and signatory approval context must remain historically trustworthy.

---

# 4. Verified Current Baseline

Branch:

`feature/pre-staging-product-coherence`

Pre-reconciliation checkpoint HEAD:

`006bdc72bf0bd19098aae84e74d54a6618c6c15a`

Checkpoint:

`docs(product): add master acceptance ledger`

At the start of the 2026-09-03 Product/UCL historical reconciliation:

- local HEAD matched the pushed feature branch;
- working tree was clean;
- no merge to `main` had been performed;
- the Master Product Acceptance Ledger existed at checkpoint `006bdc7`;
- subsequent historical archaeology identified additional preserved UCL, ETIM, real-data pilot, and Smart System evidence that required this ledger reconciliation.

CEO Acceptance Round 1 base:

`0f380cbebbe0b50d9c8099a3dfe19f3f4b54434e`

The pre-reconciliation checkpoint is **50 commits ahead** of that Round 1 base.

Historical implementation documents remain evidence of what was true at their respective dates. This ledger reconciles those records with the current product decision and must not reinterpret older `PENDING MERGE` or `NOT STARTED` statements as current truth when later commits prove completion.

---
# 5. Current Program State

## ACTIVE NEXT PROGRAM

### Product Intelligence Closure Program

Status: **ACTIVE — CEO REACTIVATED 2026-09-03**

The active product program is no longer Catalog-only.

The CEO explicitly reactivated the complete Product / Catalog / Universal Commercial Library / Smart System topic after historical recovery proved that substantial architecture and implementation already existed and had previously been parked.

The active governed scope is now:

Company Catalog
→ Universal Commercial Library
→ governed external product population
→ taxonomy/classification
→ commercial retrieval
→ explicit tenant adoption
→ Smart System deterministic coverage
→ Catalog-to-commercial-document acceptance.

### Critical Resume Rule

**DO NOT create a second Catalog, UCL, ingestion, retrieval, acquisition, or Smart System foundation.**

Historical archaeology performed on 2026-09-03 proved that these foundations already exist.

Future work must resume from the preserved implementation lineage and close remaining population, coverage, integration, live-acceptance, and product-governance gaps.

Sales Assistant and Quotation Draft remain preserved/paused unless required for Product integration acceptance.

Payment remains a known blocker but is not automatically reactivated by this program.

---

## Product Intelligence Historical Recovery — Authoritative Resume Evidence

The following evidence supersedes any earlier interpretation that Product Intelligence required a new architecture or foundation.

### Universal Commercial Library preserved lineage

- `83cc3b4` — `docs(architecture): define Universal Commercial Library`
  - ADR-011 established the canonical separation between shared Universal commercial knowledge and tenant-owned Company Catalog commercial truth.

- `fb1ac46` — `feat(ucl): implement Universal Commercial Library foundation`
  - UCL-1 foundation.

- `3834be9` — `feat(ucl): expand Universal Commercial Library identity model`
  - UCL-2 manufacturers, brands, product families, aliases, identifiers and structured attributes.

- `e3622bfd4677bd5a3fe66488fab0a94ee2ba896a` — UCL-3 ingestion and normalization pipeline.
  - source-isolated staging;
  - payload hashing;
  - bounded batch processing;
  - normalization;
  - conservative identity resolution;
  - review routing;
  - provenance;
  - canonical publication boundaries.

- `d372952de9cd14dfe26b8e4c184e408be4333b03` — UCL-4 hybrid commercial retrieval.
  - Company Catalog + Universal Library retrieval while preserving tenant authority.

- `7db31ed5c0dfece93ea4603155c01f837504fa0e` — UCL-5 search intelligence and scale validation.
  - lexical/hybrid strategy;
  - provider-neutral semantic boundary;
  - deterministic exact-identity precedence;
  - bounded caching and observability;
  - synthetic 10k / 50k / 100k retrieval validation.
  - This was synthetic scale validation, not a production PostgreSQL/vector benchmark.

- `42832749399ca9c9c22e2a8a908f4ea5c88b57c6` — UCL-6 controlled external data acquisition.
  - governed source approval;
  - licensing/commercial-use states;
  - bounded acquisition;
  - SSRF/access safety;
  - retries;
  - dry-run;
  - quota accounting;
  - acquisition audit;
  - UCL-3 provenance linkage.

### Real external source pilots — 2026-08-23

Real-data qualification was completed after UCL-6.

#### Wikidata

Two bounded product dry runs requested 100 records each and returned 0 product records.

Decision:

`NOT_PREFERRED_PRIMARY_SOURCE`

Preserved role:

- taxonomy enrichment;
- knowledge graph references;
- manufacturer relationships.

Do not repeat Wikidata primary-product qualification.

#### Open Icecat

Technical API access was successfully proven using:

`https://live.icecat.biz/api`

Building & Construction vertical `4776`:

- requested: 100;
- successful: 99;
- restricted: 1;
- commercially useful: 88.9%;
- ACCEPT: 48;
- NEEDS_REVIEW: 40;
- REJECT: 11.

Lighting vertical `2332`:

- requested: 100;
- successful: 100;
- ACCEPT: 17%;
- REJECT: 76%;
- 76% of the sample was off-market/stale.

Decision:

`ICECAT_RECOMMEND_SUPPLEMENTARY_SOURCE_ONLY`

Approved strategic role:

- brand identity;
- MPN/product-code verification;
- GTIN/barcode enrichment;
- descriptions;
- structured technical specification enrichment.

Open Icecat is not approved as the sole global Product population source, and production generative-AI use still requires licensing/commercial clarification.

A local pilot review console was also built and preserved historically at:

`C:\Dev\VOKA-worktrees\ucl-icecat-pilot-ui-lighting`

It read local pilot JSON only and performed zero Prisma/UCL/Company Catalog writes.

### ETIM taxonomy population — 2026-08-25

Commit:

`76352b3 — feat(ucl): import governed ETIM taxonomy`

Official ETIM 10.0 English master taxonomy was imported locally through the existing governed UCL source model.

Verified local result:

- ETIM groups: **159**
- ETIM product classes: **5,640**
- Total Universal Categories: **5,799**

The importer is bounded, local-development-only, explicit-apply, hierarchy-validating and idempotent.

ETIM is authoritative taxonomy/classification evidence only.

It did **not** create products, prices, manufacturers, brands, Company Catalog records, tenant adoption records or commercial truth.

Historical checkpoint status:

`TAXONOMY_POPULATED / PRODUCT_POPULATION_EXTERNAL_SOURCE_PENDING`

### Smart System preserved implementation

The deterministic Smart System architecture also already exists.

Foundation proof systems:

- Gypsum Board
- CCTV

Additional bounded implemented system:

- Access Control `1.0.0`

Core invariant:

**AI identifies/proposes. Deterministic rules calculate. Human confirms commercial truth.**

AI must not invent engineering quantities, brands, models or prices.

Known remaining candidate deterministic packs include:

- Structured Cabling
- Wi-Fi
- Fire Alarm
- Ceiling
- Painting
- Tiles
- Electrical
- Lighting
- HVAC
- Plumbing

These candidates are NOT represented as implemented until separately evidenced.

### Historical stop point

The project did not stop because Product Intelligence architecture was missing.

The proven historical stop point was:

1. UCL architecture/foundation complete through UCL-6;
2. real source pilots complete;
3. ETIM taxonomy populated;
4. Smart System proof architecture implemented and expanded to Access Control;
5. broad authoritative product population still pending an approved source strategy;
6. additional deterministic Smart System coverage still pending;
7. real production-style database/search performance validation still pending;
8. final Catalog/UCL/Commercial live acceptance still pending.

This is the authoritative resume point.

# 6. Paused Work

## SALES-ASSISTANT

Status: 🟡 **PAUSED — NOT CLOSED**

Checkpoint:

`62337fb`

Substantial implementation includes:

- conversational runtime;
- Flexible Brain / Strict Brain separation;
- governed workspace;
- commercial clarification;
- research/tool pathways;
- proposed customer handling;
- engineering-to-commercial resolution;
- product selection state;
- pricing state;
- quotation handoff;
- governed quotation draft preparation;
- company scope defaults;
- company Terms integration;
- commercial projection coherence.

Known position:

The work is intentionally preserved and paused for broader product work.

Do not treat it as final acceptance.

## QUOTATION-DRAFT

Status: 🟡 **PAUSED — NOT CLOSED**

Latest correction work includes:

- Arabic quotation wording corrections;
- localized display units;
- governed selection mapping;
- Company Settings scope-based Terms;
- governed Notes separation;
- customer-required Draft readiness;
- product and price allowed to remain pending for Draft.

Remaining:

- live persistence/reload acceptance;
- remaining CEO observations;
- no bulk repair of historical malformed records.

---

# 7. Known Live Failures

## LIVE-FAIL-001 — Payment Registration End-to-End

Source:

`CEO-R1-030`

Status: 🔴 **BROKEN LIVE / BLOCKER**

CEO observed and reconfirmed that registering a payment from the Invoice workflow does not successfully complete the required commercial lifecycle.

Code exists.

This does NOT make the feature accepted.

Required successful workflow:

Issued Invoice
→ valid governed payment
→ immutable payment record
→ invoice recalculation
→ invoice history
→ Payments register
→ Customer Statement
→ Dashboard / summaries
→ audit event
→ meaningful notification where applicable.

Do not mark this item green from source-code inspection alone.

---

# 8. CEO Acceptance Round 1 — 40 Finding Ledger

Progress percentages below are management estimates only.
Status and acceptance evidence have higher authority than percentage.

## CEO-R1-001 — One Commercial Operating System

Status: 🟡
Estimated implementation maturity: **75%**

Implemented:

- substantial cross-module commercial composition work;
- shared patterns increasingly used;
- improved navigation/terminology/localization coherence.

Remaining:

- full shared commercial document family;
- final cross-module workflow acceptance.

---

## CEO-R1-002 — Intelligence and Authority Boundary

Status: 🟡
Estimated maturity: **90%**

Implemented:

- Flexible Brain / Strict Brain direction;
- governed workspace;
- server/domain authority;
- human review boundaries.

Remaining:

- full live acceptance across AI, Drawing, pricing and commercial execution.

---

## CEO-R1-003 — Quotation as Golden Commercial UX

Status: 🟡
Estimated maturity: **80%**

Implemented:

- shared commercial composer foundations;
- Sales Order coherence improvements;
- Invoice composer modernization.

Remaining:

- final cross-document design/output consistency.

---

## CEO-R1-004 — Authoritative Values and Currency Isolation

Status: 🟡
Estimated maturity: **85%**

Implemented:

- server-authoritative reporting/export direction;
- currency-separated dashboard logic;
- authoritative document export work.

Remaining:

- final reconciliation across screen/PDF/XLSX and live commercial workflows;
- Payment dependency remains broken.

---

## CEO-R1-005 — Multilingual Active-Language UX

Status: 🟡
Estimated maturity: **92%**

Implemented:

- major authenticated AR/EN cleanup;
- active-language presentation;
- catalog localization model;
- shared domain labels.

Remaining:

- final system-wide AR/EN live sweep.

---

## CEO-R1-006 — Arabic Typography Consistency

Status: 🟡
Estimated maturity: **90%**

Implemented:

- major typography normalization.

Remaining:

- final responsive and formal-output sweep.

---

## CEO-R1-007 — Temporary VOKA Logo

Status: ⚪ **DEFERRED / DECISION SATISFIED**

Do not redesign temporary VOKA corporate identity during the current correction program.

---

## CEO-R1-008 — Session Expiry During Active Work

Status: 🟡
Estimated maturity: **85%**

Implementation evidence:

`4f65cab — fix(auth): refresh valid sessions before protected requests`

Implemented:

- session middleware;
- access-refresh handling;
- invalid-cookie handling;
- regression tests.

Remaining:

- live long-form workflow acceptance beyond the original failure interval;
- unsaved-form preservation acceptance.

---

## CEO-R1-009 — Notification Center

Status: 🟡
Estimated maturity: **90%**

Implementation status in historical checklist:

**COMPLETE IN CODE**

Evidence:

`ebf4a80 — feat(notifications): add tenant-safe notification center`

Remaining:

- manual browser acceptance;
- later lifecycle event expansion as authorized.

---

## CEO-R1-010 — Search / User Menu / Logout

Status: 🟢 **PROTECTED**

CEO manually confirmed working behavior.

Do not unnecessarily reimplement.

Must survive final regression acceptance.

---

## CEO-R1-011 — Advanced Account Administration

Status: ⚪ **DEFERRED**

Future account-administration program.

---

## CEO-R1-012 — Voice Finalizes on Natural Pauses

Status: 🟡
Estimated maturity: **70%**

Substantial voice implementation exists after Round 1.

Remaining:

- explicit live proof of natural pause → continue → finish behavior;
- consistent retained-entry-point acceptance.

---

## CEO-R1-013 — Universal Commercial AI Assistant

Status: 🟡 **PAUSED**
Estimated maturity: **90%**

Major implementation exists for conversational commercial routing and Sales Assistant.

Remaining:

- final workflow acceptance;
- broader module intent acceptance;
- paused by CEO.

---

## CEO-R1-014 — Conversational Clarification Loop

Status: 🟡 **PAUSED**
Estimated maturity: **90%**

Implemented:

- clarification turns;
- conversational state;
- suggestion/context handling;
- governed workspace synchronization.

Remaining:

- CEO final live acceptance.

---

## CEO-R1-015 — Drawing Must Lead to Governed Commercial System

Status: 🔴
Estimated maturity: **45%**

Current gap:

The Drawing/Takeoff experience still does not prove the complete governed journey:

Upload
→ requested system
→ quantities/components
→ governed system recommendation
→ clarification
→ review
→ quotation.

Do not fabricate engineering facts or prices.

---

## CEO-R1-016 — Simplify Ordinary Drawing UX

Status: 🔴 / 🟡
Estimated maturity: **50%**

Some localization/UI cleanup exists.

Remaining:

- ordinary commercial journey;
- simplified result/history;
- complete clarification and quotation handoff.

---

## CEO-R1-017 — Product / Service Multilingual Identity

Status: 🟡
Estimated maturity: **92%**

Implementation status:

**COMPLETE IN CODE**

Evidence:

`240ea99 — feat(catalog): add extensible item localizations`

Implemented:

- scalable localization model;
- canonical identity;
- localized representations;
- governed fallback;
- preserved historical snapshots.

Remaining:

- migration deployment verification;
- live Catalog acceptance.

This finding becomes part of the active Catalog Closure Program.

---

## CEO-R1-018 — ERP-Style Import / Export Framework

Status: 🔴
Estimated maturity: **10%**

Current Catalog does not expose the required governed import workflow.

Required:

Official XLSX template
→ upload
→ mapping
→ validation
→ preview
→ row errors
→ duplicate/conflict handling
→ explicit safe batch commit.

This finding becomes a primary active Catalog workstream.

---

## CEO-R1-019 — Customer Form Unexpected Submission

Status: 🟡
Estimated maturity: **90%**

Evidence:

`93e505a — fix(customers): require deliberate form submission`

Implemented:

- explicit form submission protection;
- Enter behavior protection;
- Contact Picker regression coverage.

Remaining:

- live browser acceptance.

---

## CEO-R1-020 — Customer 360 Direction

Status: 🟢 **PROTECTED**

CEO-approved direction.

Preserve connected commercial context.

Do not regress tenant/currency authority.

---

## CEO-R1-021 — Statement Terminology / Arabic Presentation

Status: 🟡
Estimated maturity: **85%**

Substantial localization work exists.

Remaining:

- full formal AR acceptance;
- ensure accounting terminology remains domain-correct.

---

## CEO-R1-022 — Dashboard Counts Reconciliation

Status: 🟡
Estimated maturity: **90%**

Implementation status:

**COMPLETE IN CODE**

Evidence:

`b47ef67 — fix(dashboard): reconcile authoritative module metrics`

Remaining:

- manual data reconciliation against real module records.

---

## CEO-R1-023 — Quotation Revision Governance

Status: 🟢 **PROTECTED**

CEO manually exercised this successfully.

Preserve:

- approved immutability;
- family/revision numbering;
- historical read-only state;
- current revision clarity;
- downstream exact provenance.

---

## CEO-R1-024 — Quotation Detail / Revision Language Cleanup

Status: 🟡
Estimated maturity: **90%**

Major localization cleanup exists.

Remaining:

- final AR/EN live detail/revision acceptance.

---

## CEO-R1-025 — Sales Order Semantic Coherence

Status: 🟡
Estimated maturity: **90%**

Major implementation exists.

Evidence includes historical Sales Order coherence work.

Implemented direction:

- Sales Order is primary identity;
- source quotation is secondary provenance;
- exact source revision preserved.

Remaining:

- final screen/output/live acceptance.

---

## CEO-R1-026 — Shared Commercial Document Design System

Status: 🟡
Estimated maturity: **70%**

Implemented:

- shared commercial composer foundations;
- extensive PDF/XLSX authority work;
- document-family progress.

Remaining:

- one coherent header/footer/identity/table/totals/branding/signature system;
- final side-by-side screen/PDF/XLSX acceptance.

---

## CEO-R1-027 — Contract Output Coherence

Status: 🟡
Estimated maturity: **75%**

Implemented:

- contract lifecycle;
- payment stages;
- terms;
- notes;
- PDF;
- XLSX;
- provenance.

Remaining:

- final shared document visual/output alignment.

---

## CEO-R1-028 — Invoice Horizontal Editing

Status: 🟡
Estimated maturity: **90%**

Major composer modernization exists.

Remaining:

- final desktop/mobile acceptance;
- no awkward field discovery or overflow.

---

## CEO-R1-029 — Governed Invoice Source Selection

Status: 🟡
Estimated maturity: **75%**

Substantial source/composer work exists.

Remaining:

- prove user can choose eligible source without internal-ID discovery;
- prove authoritative source hydration and provenance live.

---

## CEO-R1-030 — Payment Registration Fails End-to-End

Status: 🔴 **BROKEN LIVE / BLOCKER**

Estimated implementation maturity is not a closure metric.

Code exists.

Live workflow failed.

See:

`LIVE-FAIL-001`

This item stays RED until the complete dependent lifecycle succeeds.

---

## CEO-R1-031 — Company Settings Correction

Status: 🟡
Estimated maturity: **75%**

Implemented:

- broader Company Settings;
- AR/EN identity;
- company assets;
- default currency;
- delivery readiness;
- scope-based Terms templates.

Remaining:

- final structured master-data review;
- jurisdiction/legal optional fields;
- responsive composition;
- final asset/authority separation acceptance.

---

## CEO-R1-032 — Live Email / WhatsApp Activation

Status: ⚪ **DEFERRED**

Do not activate or fake providers.

---

## CEO-R1-033 — Company Logo Studio

Status: 🔴
Estimated maturity: **5%**

Requested customer-company feature remains substantially unimplemented.

This is separate from VOKA corporate branding.

---

## CEO-R1-034 — Authorized Signatories Governance

Status: 🟡
Estimated maturity: **85%**

Substantial implementation exists:

- localized identity;
- upload/draw/capture;
- permissions;
- Active/Inactive;
- default signatory;
- document authorization direction;
- snapshot work.

Remaining:

- final audit-history verification;
- immutable approval snapshot live acceptance.

---

## CEO-R1-035 — Company Assets vs Personal Authority

Status: 🟡
Estimated maturity: **75%**

Principle:

Company assets:
- logo;
- letterhead;
- stamp/seal.

Personal authority:
- signatory name;
- title;
- signature;
- permitted document types.

Remaining:

- final Settings/document acceptance.

---

## CEO-R1-036 — Formal Language Quality

Status: 🟡
Estimated maturity: **92%**

Major AR/EN cleanup exists.

Remaining:

- full product sweep for raw enums, mixed language, direction and formal output quality.

---

## CEO-R1-037 — Commercial Export Authority

Status: 🟡
Estimated maturity: **85%**

Historical implementation includes authoritative XLSX/PDF work across major modules.

Required roles:

Screen = operational interaction.
PDF = fixed official delivery.
XLSX = structured editable downstream work.

Remaining:

- full reconciliation acceptance.

---

## CEO-R1-038 — Drawing / Takeoff Export Semantics

Status: 🔴 / 🟡
Estimated maturity: **55%**

PDF/XLSX export capability exists.

Remaining:

- complete Drawing workflow;
- uncertainty/provenance/review semantics throughout quotation handoff.

---

## CEO-R1-039 — Major Workstreams / Reactivation State

Status: 🟡 **PARTIALLY REACTIVATED BY CEO — 2026-09-03**

The original Round-1 decision deferred several major workstreams.

Historical deferral remains valid for:

- live WhatsApp;
- live Email;
- Google Cloud production infrastructure;
- subscription/billing;
- payment gateway;
- staging;
- production;
- pilot;
- final VOKA identity;
- Advanced Account Manager;
- deep CAD expansion.

The following two items are **NO LONGER DEFERRED** after explicit CEO reactivation on 2026-09-03:

- Universal Commercial Library / governed product population completion;
- Smart System / System Intelligence coverage expansion.

Reactivation does not authorize architectural replacement.

Both must resume from the preserved UCL-1 through UCL-6, ETIM, Company Catalog, and deterministic Smart System foundations documented in this ledger.

---
## CEO-R1-040 — Workflow-Based Acceptance

Status: 🟢 **PERMANENT GOVERNANCE RULE**

This is not a feature to implement once.

It governs every future closure decision.

---

# 9. Round 1 Workstream Ledger

To avoid ambiguity, these are named:

`R1-WS-A` through `R1-WS-Q`

They must not be confused with historical numeric workstreams such as WS8, WS9, WS10, etc.

| Workstream | Area | Current State |
|---|---|---|
| R1-WS-A | Session/Auth | 🟡 IMPLEMENTED / LIVE ACCEPTANCE PENDING |
| R1-WS-B | Localization/Typography | 🟡 COMPLETE IN CODE / FINAL ACCEPTANCE PENDING |
| R1-WS-C | Notifications | 🟡 COMPLETE IN CODE / BROWSER ACCEPTANCE PENDING |
| R1-WS-D | Voice + Commercial AI | 🟡 MAJOR IMPLEMENTATION / PAUSED |
| R1-WS-E | Drawing → Quotation | 🔴 PARTIAL / BLOCKER |
| R1-WS-F | Customer Form | 🟡 IMPLEMENTED / LIVE ACCEPTANCE PENDING |
| R1-WS-G | Product Multilingual Identity | 🟡 COMPLETE IN CODE / LIVE-MIGRATION ACCEPTANCE PENDING |
| R1-WS-H | ERP Import/Export | 🔴 OPEN |
| R1-WS-I | Dashboard Summaries | 🟡 COMPLETE IN CODE / DATA RECONCILIATION PENDING |
| R1-WS-J | Shared Commercial Documents | 🟡 PARTIAL / STRONG FOUNDATION |
| R1-WS-K | Sales Order | 🟡 STRONG IMPLEMENTATION / FINAL ACCEPTANCE PENDING |
| R1-WS-L | Invoice Composer/Source | 🟡 STRONG PARTIAL / E2E ACCEPTANCE PENDING |
| R1-WS-M | Payments | 🔴 BROKEN LIVE / BLOCKER |
| R1-WS-N | Company Settings | 🟡 PARTIAL / SUBSTANTIAL IMPLEMENTATION |
| R1-WS-O | Signatories | 🟡 STRONG IMPLEMENTATION / FINAL GOVERNANCE ACCEPTANCE |
| R1-WS-P | Company Logo Studio | 🔴 OPEN |
| R1-WS-Q | Full Product Acceptance Sweep | 🔴 FINAL CLOSURE GATE NOT EXECUTED |

---

# 10. Historical Workstream Naming Rule

Older project records contain numeric workstream labels including examples such as:

- WS8
- WS9
- WS10
- WS11
- WS12
- WS13
- WS14

These are historical Product/Release workstreams.

They are NOT equivalent to:

`R1-WS-A ... R1-WS-Q`

From this document onward:

- Round 1 workstreams always use prefix `R1-WS-`.
- Historical numeric workstreams use prefix `LEGACY-WS`.

This prevents future documentation ambiguity.

---

# 11. Catalog — Current Truth

Catalog is not a placeholder.

Current source surface includes:

- `features/catalog/domain`
- `features/catalog/application`
- `features/catalog/infrastructure`
- `app/api/catalog/items`
- `app/dashboard/products`
- `components/catalog`
- localization utilities and tests.

Current capabilities include substantial support for:

- Products and Services;
- create/edit;
- search/filter/pagination;
- code/SKU;
- sale/purchase pricing fields;
- unit;
- tax;
- active state;
- tenant-aware persistence;
- localized catalog representation.

Key historical catalog evidence includes:

`240ea99 — feat(catalog): add extensible item localizations`

Catalog Closure must build on this architecture.

Do not create a second Catalog implementation.

---

# 12. Product / Catalog / UCL / Smart Systems Closure Program

Status: **ACTIVE**

This program replaces the earlier Catalog-only execution interpretation.

It preserves the existing Company Catalog architecture and expands closure to the already-built Universal Commercial Library and deterministic Smart System foundations.

## PIC-00 — Historical Baseline Reconciliation

Status: 🟡 **IN PROGRESS**

Evidence recovered:

- Catalog canonical implementation exists;
- UCL-1 through UCL-6 exist;
- Open Icecat and Wikidata real pilots exist;
- ETIM taxonomy population exists;
- Gypsum, CCTV and Access Control deterministic system implementations exist.

Required before new architecture work:

- reconcile current code with historical evidence;
- identify regressions or missing integration;
- distinguish implemented vs population-pending vs live-acceptance-pending;
- preserve all existing boundaries.

No greenfield architecture is authorized.

## PIC-01 — Current-Code Integrity Audit

READ-ONLY first.

Verify current HEAD still preserves:

- Company Catalog canonical domain/application/infrastructure/API/UI;
- UCL schemas/entities/repositories/use cases;
- ingestion and normalization;
- hybrid retrieval;
- search intelligence;
- controlled acquisition;
- ETIM taxonomy and importer;
- explicit UCL → Company Catalog adoption;
- Smart System registry/templates;
- Quotation/commercial integration;
- tenant isolation;
- localization and authoritative pricing boundaries.

Output:

`DONE / PARTIAL / REGRESSED / BROKEN / NOT IMPLEMENTED / LIVE ACCEPTANCE REQUIRED`

## PIC-02 — Governed Product Source Strategy

Do not select a single global source by assumption.

Evaluate current authoritative/supplementary source options using:

- legal/commercial-use rights;
- redistribution rights;
- generative-AI rights;
- API/feed availability;
- freshness;
- identity quality;
- MPN/GTIN coverage;
- technical specification coverage;
- taxonomy compatibility;
- Middle East relevance;
- update frequency;
- cost;
- manufacturer authority.

Preserved historical roles:

- ETIM → taxonomy/classification;
- Wikidata → taxonomy/relationships enrichment;
- Open Icecat → supplementary identity/spec enrichment;
- Manufacturer Direct Feeds → preferred authoritative product-detail candidate.

## PIC-03 — Governed Product Population

Resume through the existing UCL acquisition → staging → normalization → identity resolution → review/publication pipeline.

Do not bypass UCL governance.

Required:

- approved sources only;
- bounded ingestion;
- provenance;
- deduplication;
- identifier integrity;
- review-required routing;
- canonical publication;
- no automatic Company Catalog mutation.

## PIC-04 — Company Catalog Adoption & Commercial Truth

Prove:

Universal Library
→ explicit tenant adoption
→ Company Catalog
→ tenant-governed unit
→ tenant-governed price/tax/inventory
→ localized identity
→ quotation/commercial snapshot.

Universal data must never overwrite tenant commercial truth.

## PIC-05 — ERP Catalog Import / Export

Preserve the existing CEO-R1-018 requirement.

Import:

Official XLSX Template
→ Upload
→ Mapping
→ deterministic Validation
→ Preview
→ row errors
→ duplicate/conflict strategy
→ explicit safe batch commit.

Export:

Server-authoritative genuine XLSX.

No renamed CSV.

## PIC-06 — Smart System Coverage Expansion

Resume the existing deterministic Smart System engine.

Existing evidence-backed systems:

- Gypsum Board;
- CCTV;
- Access Control.

Candidate future packs must each use a bounded versioned deterministic rule set and require separately evidenced engineering rules.

No AI-authored engineering quantities.

## PIC-07 — Search / Scale / Performance Validation

Preserve UCL-5 synthetic scale evidence but do not misrepresent it as production database benchmarking.

Required before scale closure:

- real PostgreSQL query-plan/latency validation;
- realistic populated corpus;
- bounded retrieval;
- tenant isolation;
- lexical fallback;
- optional semantic provider behavior;
- cache invalidation policy for mutable commercial truth.

## PIC-08 — Live Product Acceptance

CEO hands-on review must cover at minimum:

- Product/Service list;
- search/filter/pagination;
- create/edit;
- AR/EN;
- localization/fallback;
- code/SKU/barcode identity;
- unit/tax/pricing;
- Active/Inactive;
- UCL search;
- UCL item review;
- explicit adoption;
- quotation selection;
- commercial snapshot;
- Smart System request;
- deterministic component derivation;
- clarification where engineering input is missing.

## PIC-09 — Closure

Required:

- current-code evidence;
- automated gates;
- tenant/security tests;
- population/governance evidence;
- real performance evidence where applicable;
- AR/EN acceptance;
- responsive acceptance;
- live commercial workflow evidence;
- CEO/CTO acceptance;
- preserved checkpoint.

Only then may the integrated Product Intelligence program become 🟢 CLOSED.

# 13. Current Product Intelligence Boundaries

The current program now explicitly includes governed UCL population and deterministic Smart System coverage expansion.

It does **not** authorize unrelated expansion into:

- product-image discovery as a separate visual-product program;
- variants redesign without evidence;
- unconstrained web crawling;
- unlicensed or legally ambiguous production data use;
- automatic Universal Library → Company Catalog mutation;
- AI-authored engineering quantities;
- AI-authored tenant prices/taxes/inventory;
- Payment repair;
- Drawing redesign;
- VOKA corporate branding;
- subscription/billing;
- production deployment.

Any architectural replacement of Catalog, UCL, ingestion, retrieval, acquisition, adoption, or Smart System foundations requires an explicit new CEO/CTO architecture decision supported by evidence that the existing architecture cannot satisfy the requirement.

# 14. Safety Rules

Before every implementation slice:

1. Verify branch.
2. Verify HEAD.
3. Verify working tree.
4. Read this ledger.
5. Read the relevant domain ledger.
6. Identify exact acceptance criteria.
7. Make the smallest bounded implementation.
8. Run relevant gates.
9. Perform live acceptance where applicable.
10. Update documentation.
11. Do not commit/push without CEO approval.

Never:

- force push;
- reset the database casually;
- destroy migrations;
- remove stashes/backups without approval;
- trust client tenant/company identifiers;
- bypass domain authority for AI convenience;
- silently change historical approved records.

---

# 15. Closure Contract

A future agent or CTO session must NOT infer CLOSED from:

- a commit message;
- a checked checkbox;
- an API route;
- a test suite alone;
- UI component existence;
- assistant memory.

A workstream becomes CLOSED only when supported by:

**Code Evidence ✅**

**Automated Gate ✅**

**Live Workflow Evidence ✅**

**CEO/CTO Acceptance ✅**

**Checkpoint ✅**

If live evidence contradicts code evidence, live evidence wins and the item remains RED/YELLOW until reconciled.

---

# 16. Resume Point

Authoritative product decision as of 2026-09-03:

**Complete the entire Product / Catalog / UCL / Smart Systems topic from the existing implementation lineage.**

Do not restart from Catalog foundation or UCL architecture.

Current execution sequence:

`PIC-00 Historical Reconciliation`
→ `PIC-01 Current-Code Integrity Audit`
→ `PIC-02 Governed Product Source Strategy`
→ `PIC-03 Governed Product Population`
→ `PIC-04 Catalog Adoption & Commercial Truth`
→ `PIC-05 ERP Import / Export`
→ `PIC-06 Smart System Coverage Expansion`
→ `PIC-07 Real Scale / Performance Validation`
→ `PIC-08 Live Product Acceptance`
→ `PIC-09 Closure`

Preserved architecture:

- Company Catalog = tenant-owned governed commercial truth;
- UCL = shared governed commercial/product knowledge;
- UCL acquisition/normalization/retrieval foundations already exist;
- explicit adoption controls movement into Company Catalog;
- ETIM taxonomy is already populated locally as classification evidence;
- AI may understand/propose;
- deterministic rules calculate;
- human approval governs consequential commercial truth.

Historical resume frontier:

**authoritative product population + system coverage expansion + integrated live acceptance**

—not architecture reconstruction.

Paused unless required for integration acceptance:

- Sales Assistant;
- Quotation Draft.

Known blocker retained for later unless CEO reactivates it:

- Payment E2E.

No next unrelated module is selected automatically.


## 2026-09-03 Product Intelligence Architecture Decision

OpenAI/Web research is the approved primary bootstrapping and broad global
discovery mechanism for UCL population.

AI output is discovery/structuring input, not canonical authority.

Governed population:

OpenAI/Web Research
-> Discover
-> Analyze
-> Structure
-> Research
-> Validate
-> Stage
-> Review
-> Publish to UCL.

Evidence, provenance, confidence, source/legal governance, normalization and
review remain mandatory.

Current canonical classification boundary:

`UniversalItemType`
= PRODUCT | SERVICE | SYSTEM | SOLUTION | SHIPPING | LABOR | DISCOUNT | CUSTOM

`CatalogItemType`
= PRODUCT | SERVICE | SHIPPING | LABOR | DISCOUNT | CUSTOM

SYSTEM/SOLUTION:

- are valid UCL discovery/publication/search records;
- are excluded from default Commercial Hybrid Retrieval;
- are not currently adoptable into Company Catalog;
- require separately approved conversion/adoption policy before becoming tenant commercial truth.

Smart System remains a separate deterministic engineering/calculation layer.

The Sales Assistant is a downstream consumer of governed library knowledge and
has no direct role in building the Universal Library.

Permanent scaling rule:

**Huge Library, Small Working Set.**

## UCL-CLOSE-05 — CLOSED / ACCEPTED — 2026-09-07

**Explicit Adoption / Commercial Truth:** CLOSED / ACCEPTED.

Accepted governed flow:

Universal Library → explicit tenant adoption → Company Catalog → tenant-owned commercial truth → quotation snapshot.

Evidence:
- `CatalogItem.salePrice` is nullable.
- `null` means price unknown / not set; explicit `0` remains a legitimate zero price.
- Adoption without a price persisted `null` and displayed `Price not set`.
- Explicit zero adoption displayed `0.000`, proving `null != 0`.
- Re-adoption did not overwrite existing tenant-owned Company Catalog commercial truth.
- `companyId` and `adoptedByUserId` remain server-derived.
- A catalog item with unresolved price produced `Price required` in quotation creation and blocked completion until a numeric price was supplied.
- Live quotation snapshot acceptance: quotation persisted at `KWD 180.000`; Company Catalog price was later changed to `222.222`; the existing quotation remained `KWD 180.000`.
- Platform Admin UCL console navigation was normalized to Overview / Batches / Hierarchy / Staging / Review / Published / Population.
- Published operator surface: `/dashboard/universal-library/published`.
- Tenant adoption surface: `/dashboard/products/universal-library`.

Review/publish regressions found and fixed during live acceptance:
1. `pg_advisory_xact_lock(...)` used through Prisma `$queryRaw` caused P2010 because PostgreSQL returns `void`; lock execution now uses `$executeRaw`.
2. Inactive nullable JSON attribute values used JavaScript `null`, which Prisma represented as JSON null rather than SQL NULL and violated `UniversalItemAttributeValue_exactly_one_value_check`; inactive JSON values now use `Prisma.DbNull`.

Live review/publish retest:
- Ingestion record: `cmtrhemke0001dst1ybsiabmd`
- Final status: `PUBLISHED`
- Review decision: `APPROVED`
- Actor user: `cmsaa0wym00000ct1nju00h2l`
- Canonical item: `cmtrmxbp400066wt19it84slc`
- Canonical name: `VOKA-UCL-REVIEW-RETEST-20260907 — Synthetic acceptance evidence`
- Live API: `POST /api/universal-library/review` → HTTP 200.
- Observed post-acceptance counts: review queue `34`, published items `2`. No unsupported before/after delta is claimed.

Migration:
- `20260907010000_catalog_nullable_sale_price`
- Applied successfully.
- `CatalogItem.salePrice` verified nullable `numeric(18,3)`.

**UCL-CLOSE-06 — E2E Batch Wizard is IMPLEMENTED and remains OPEN pending live CEO operator acceptance.**

Existing release gates remain unchanged, including:
- `LIVE-FAIL-001` Payment Registration — RED / BLOCKER.
- `AUTH-DIRECT-ROUTE-GATE` — OPEN for Phase 4C.

Do not claim UCL V1 fully closed until UCL-CLOSE-06 is accepted.
