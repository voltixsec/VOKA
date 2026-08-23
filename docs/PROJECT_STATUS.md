# Project Status

Current Product Frontier: **V1 Product Completion & Globalization**

Status: **IN PROGRESS / NOT RELEASE READY.** The Product Integrity regression
suite is an automated safety net only; it is not manual product acceptance and
does not establish release or real-user-pilot readiness.
Phase 7A Commercial Document Foundation & Phase 7B.1 Contract MVP implemented on the handoff branch.
Phase 6.1 Text AI Sales Assistant / Structured Draft is closed and merged through PR #42.
Phase 6.2 Voice Input Transport is **CLOSED / MERGED** through PR #44 at merge commit `0c94f521d07d4a2f78f4eb5d67c60e27ce686772` after green Quality #79.
Phase 6.3 AI Model Routing is **CLOSED / MERGED** through PR #46 at merge commit `8ad47179408e2753f1ece92aedb8d0e5ab0641d8` after green Quality #83.

Official pre-Phase-6.2 baseline:

`d19d2bd2e306a7db066532ff873e9af5ed3a8349`

Current authoritative main baseline:

`f881aefdcd0f7900271523fc3b278c0767ee1290`

Phase 5 was merged through PR #40 after independent CTO review and green
GitHub Quality CI.

## Gate 1 — Multilingual Localization V2 / OpenAI (Phase A)

Status: **Phase A Foundation Completed / Persistence Expansion (Phase B) Pending**

Delivered in Phase A:
- Provider-neutral `TranslationPort` evolution supporting extensible BCP-47 locale tags (`ar`, `en`, `fr`, etc.) with canonical validation and normalization (`isValidLocale`, `normalizeLocale`).
- Production `OpenAITranslationAdapter` (`src/infrastructure/translation/openai/OpenAITranslationAdapter.ts`) supporting OpenAI's Responses API with structured JSON schema output, configurable model routing (`gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna`), retry policy, and timeout controls.
- Commercial Protected Token Strategy (`ProtectedTokenValidator.ts`) guaranteeing zero corruption or mutation of SKUs, MPNs, GTINs, quantities, currency values (`KD 1,250.500`, `USD 250`), percentages, technical specs (`4MP`, `8TB`, `220V`), URLs, and email addresses.
- Factory routing update in `createTranslationPort.ts` for `VOKA_TRANSLATION_PROVIDER=openai` while retaining legacy Ollama, Gemini, and Google Cloud adapters.
- Commercial test corpus (`testCorpus.ts`), third-language proof for French (`MultilingualFrenchProof.test.ts`), and opt-in model benchmark harness (`scripts/benchmark-openai-models.ts`).
- Documentation checkpoint [ADR-012](architecture/ADR-012-MULTILINGUAL-LOCALIZATION-V2.md) defining the architecture, audit findings, protected token policy, and Phase B generic `LocalizedContent` persistence schema and migration strategy.

## Sprint 09A - Quotation API

Status: Completed

- Merged through PR #11 in merge commit `287ff8f`.
- Provides authenticated create, list, detail, draft update, send, approve,
  reject, and cancel quotation APIs.
- Enforces tenant isolation and tenant-owned reference validation.
- Sources customer snapshots from persisted tenant-owned customer data.
- Post-merge verification passed: TypeScript, Prisma validation, production
  build, and 45/45 tests across 16 test files.

## Sprint 09B - Quotation Workspace

Status: Completed and merged through PR #12 at 73bb875

Approved scope:

1. Refresh the official Sprint 09A close point and Sprint 09B charter.
2. Build a bilingual, RTL-ready quotation list with search, filters, pagination,
   and complete loading/empty/error states.
3. Build quotation details with role- and state-aware lifecycle actions.
4. Build quotation creation and draft editing over the canonical Quotation API.
5. Add UI/integration coverage and GitHub Actions quality checks.

Delivered:

- Bilingual/RTL list, detail, lifecycle, creation, and draft-edit workflows.
- Unsaved-change confirmation, line units, discounts, notes, and terms.
- Persisted-ID redirect after creation and safe optional catalog filters.
- Focused UI and repository regression coverage.
- Pull-request quality workflow for typecheck, tests, Prisma validation, and build.

Out of scope:

- PDF/document generation, email, WhatsApp, Sales Order, Invoice, Payments,
  full Voice/AI execution, Import/Export Center, and unnecessary Prisma changes.

Architecture:

- Clean Architecture
- DDD
- Prisma
- PostgreSQL
- Canonical quotation implementation under `src/`; do not duplicate it under
  `features/`.

## Architecture Decisions

- AI First: `APPROVED`
- Advanced Import / Export Center: `APPROVED` as an optional product capability
- Development execution workflow: `CTO + local Terminal + Jules`; Codex is not part of the active workflow unless explicitly reintroduced by the CEO.

The Advanced Import / Export Center remains `PLANNED` and is sequenced after the
Core Sales Engine.

## Sprint 10A - Quotation Documents

Status: Approved by the project owner on 2026-08-05.

The approved scope is defined in
[Document Engine Blueprint](blueprints/03_DOCUMENT_ENGINE.md): bilingual/RTL
quotation PDF, available company branding, safe QR content, authenticated
download, browser print, and focused automated coverage. Persistent extended
company branding requires a separate schema/migration decision.

## Approved Next Product Direction — Quotation Proposal Composer

Status: **Delivered and closed through Phase 3 on 2026-08-14**

Proposed Sprint:

**Sprint 10B — Quotation Proposal Composer**

Objective:

Transform the bilingual quotation PDF into a structured commercial proposal consisting of a cover page followed by one or more BOQ and terms pages.

Approved first slice:

- Bilingual quotation subject.
- Bilingual commercial brief.
- Structured scope type.
- Project and attention details.
- Commercial cover page.
- Multi-page quotation document flow.
- Final-page electronic approval/signature block.
- Arabic and English layout positioning.
- Human approval before final document generation.

Originally deferred from the first slice:

- Voice capture.
- AI intent extraction.
- AI-generated scope and terms.
- Certificate-based cryptographic PDF signing.
- Email and WhatsApp delivery. Production email delivery and the Meta WhatsApp
  code path were subsequently delivered in Phase 3; live Meta account
  configuration remains deferred.

Important:

Sprint 10A was merged into `main` through Pull Request #15.

Verified merge commit:

`9d6db831373d13b2ea7a6f269c1cc903f23617fb`

The Phase 1.4 merge superseded the earlier pending-documentation state and
delivered the proposal document foundation. Phase 3 subsequently completed the
approved composer, preview, tax-integrity and delivery UX slices listed below.

## Phase 1.4 - Branded Proposal Delivery

Status: Closed and merged through PR #18 at `d5599b2` on 2026-08-13.

Delivered:

- English and Arabic branded two-page proposals with uploaded letterhead safe areas.
- Draft-versus-approved document behavior, approval identity, signature, stamp,
  immutable branding snapshot, and official public verification QR.
- Public verification API/page with legacy approved/no-token compatibility.
- Asynchronous quotation creation that does not wait for localization.
- Approval protection requiring completed bilingual localization; pending or
  failed localization returns a safe conflict without freezing a snapshot.
- Unicode bidi-aware Arabic PDF run layout preserving Arabic sentence order,
  whitespace, Western numbers, percentages, currencies, document IDs, and
  embedded English phrases.

Validated: Prisma schema/client/status, TypeScript, 251 tests across 47 files,
diff checks, rendered English/Arabic PDF visual QA, and CI Quality.

## Safe Dependency Hardening

Status: Closed and merged through PR #19 at `23c2d2f` on 2026-08-13.

- Updated transitive `nanoid` from 3.3.16 to 3.3.18.
- Updated dev-only transitive `js-yaml` from 4.3.0 to 4.3.1.
- Changed `package-lock.json` only.
- Remaining Next 15 nested PostCSS and Sharp findings are tracked for a planned
  Next 16 security migration. That migration is a separate engineering
  workstream, not the next product feature.

## Phase 3 - Proposal Composer UX

Status: Closed and merged through PR #31 at `6ff9762` on 2026-08-14.

Delivered:

- A single-active-language Create/Edit composer that preserves inactive
  localized values and exposes localization state safely.
- Catalog and custom line workflows, localized line descriptions, stable line
  identity, contiguous positions, accessible reordering and final-line safety.
- Canonical server-owned tax percentages and totals with explicit historical
  snapshot preservation and intentional refresh to active current rates.
- Proposal preview, deterministic PDF/approval behavior and localized line
  descriptions in quotation detail and BOQ output.
- Email, Both-channel and retry-failed-channel UX with a delivery audit trail.
- Resend email delivery and a complete Meta WhatsApp provider code path. Meta
  live-account credentials/template configuration remain an environment task.

Validated at the final feature close: Prisma validation and migration status,
TypeScript, production build, 444/444 tests across 68 files, diff checks and CI
Quality.

Still deferred:

- Sales Order editing/confirmation/cancellation/fulfillment, contracts,
  invoices and payments.
- Voice capture and AI-assisted proposal composition.
- Live Meta account/template configuration.
- WebP branding compatibility, arbitrary custom HEX branding and general
  dynamic multi-page BOQ pagination.
- Certificate-based cryptographic PDF signatures.
- The planned Next 16 security migration.

The next recommended product action is a read-only Phase 4/5 assessment of
approval/downstream document lifecycle and canonical customer/catalog reuse.
That assessment must produce bounded CTO-reviewable acceptance criteria before
any implementation begins.

## Phase 4.1 - Approved Quotation to Sales Order Draft

Status: Closed and merged through PR #33 at `9a22302`.

Delivered:

- An APPROVED quotation can create exactly one tenant-owned Sales Order in
  DRAFT status with deterministic number `SO-{quotation.number}`.
- Database uniqueness enforces the source one-to-one relationship and
  company-scoped order number.
- Conversion and cancellation acquire the same tenant-scoped active quotation
  row lock before checking Sales Order state.
- Conversion copies the persisted approved quotation customer, localized
  content, ordered line, discount, historical tax and totals snapshots inside
  one Prisma transaction.
- Creator identity and source approval identity/date are stored as historical
  audit snapshots.
- A quotation with a downstream Sales Order can no longer be cancelled.
- Authenticated convert/list/detail APIs and localized, responsive Sales Order
  list/detail UI are available.

## Phase 4.2 - Sales Order Confirmation & Cancellation

Status: Closed and merged through PR #38.

Delivered:

- DRAFT → CONFIRMED.
- DRAFT → CANCELLED.
- CONFIRMED → CANCELLED.
- Durable confirmation/cancellation actor and timestamp snapshots.
- Required cancellation reason.
- Tenant-scoped locking and expected-status compare-and-set behavior.
- Authenticated lifecycle APIs and bilingual operational UX.
- Historical commercial snapshots remain immutable.

## Phase 4.3 - Sales Order Operational Workspace

Status: Closed and merged through PR #39.

Delivered:

- bilingual Sales Order PDF generation;
- immutable document branding inherited from the approved quotation;
- persisted-brand-first document behavior;
- accurate creation/confirmation/cancellation audit history;
- multi-page PDF pagination with repeated table headers;
- tenant-safe internal operational activity notes.

## Phase 5 - Canonical Catalog Integration

Status: **Closed and merged through PR #40**.

Official resulting baseline:

`55ef31e4fba7b38d0225aeb1296c7f1712fea38c`

Delivered:

- tenant-safe Product and Service management while keeping their business
  semantics distinct;
- reusable Arabic/English catalog names and descriptions;
- tenant/shared Units with bilingual values;
- company-scoped Unit uniqueness plus a PostgreSQL partial unique index for
  shared Units;
- deterministic tenant-owned Unit preference with shared Unit fallback;
- bounded catalog search and pagination;
- Products/Services management UI;
- quotation Create/Edit catalog parity;
- canonical bilingual value reuse to avoid unnecessary repeated localization;
- active company Price List draft-time pricing when explicitly selected;
- Catalog sale-price fallback when no Price List item exists;
- valid zero Price List prices preserved as zero;
- historical quotation and Sales Order snapshot preservation after mutable
  master-data changes;
- seed hardening for shared system Units.

## Phase 6.1 — Text AI Sales Assistant / Structured Commercial Draft

Status: **Merged through PR #42 / Quality CI passed**.

Delivered natural-language sales request extraction (Arabic & English) into structured commercial intent, candidate customer/catalog matching, server-owned pricing/tax/totals authority, human approval boundary, and interactive bilingual UI workspace.

## Phase 6.2 — Voice Input Transport

Status: **CLOSED / MERGED** through PR #44.

Delivered voice input transport for browser speech recognition in Arabic and English into the Sales Assistant prompt field with strict privacy invariants.

## Phase 6.3 — AI Model Routing

Status: **CLOSED / MERGED** through PR #46.

Delivered cloud-primary plus local-fallback routing for AI Sales Assistant and Translation.

## Phase 6.4 — Product Integrity & Stabilization

Status: **CLOSED / MERGED** through PR #54.

Delivered false-completion prevention, Customer master-data code allocator, delivery configuration readiness UX, and dense quotation composer UI.

## V1 Product Completion & Globalization

Current mandatory completion gates:

1. Multilingual Localization V2 / OpenAI (Phase A Foundation Completed; Phase B Pending).
2. Manual UI Product Acceptance.
3. Voice End-to-End Acceptance.
4. Universal Commercial Library Population.
5. Smart System Coverage Expansion.
