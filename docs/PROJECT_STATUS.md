# Project Status

Current Product Frontier: **Phase 7 — Commercial Documents & Receivables**

Status: Phase 7A Commercial Document Foundation & Phase 7B.1 Contract MVP implemented on the handoff branch; CTO review fixes are locally green but uncommitted and unmerged.
Phase 6.1 Text AI Sales Assistant / Structured Draft is closed and merged through PR #42.
Phase 6.2 Voice Input Transport is **CLOSED / MERGED** through PR #44 at merge commit `0c94f521d07d4a2f78f4eb5d67c60e27ce686772` after green Quality #79.
Phase 6.3 AI Model Routing is **CLOSED / MERGED** through PR #46 at merge commit `8ad47179408e2753f1ece92aedb8d0e5ab0641d8` after green Quality #83.

Official pre-Phase-6.2 baseline:

`d19d2bd2e306a7db066532ff873e9af5ed3a8349`

Current canonical main baseline after Phase 6.4D merge:

`20c83d9c034189cbf40f907840fdaa81847c100b`

Phase 5 was merged through PR #40 after independent CTO review and green
GitHub Quality CI.
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

Merged delivery sequence:

- PR #21 (`627d467`): active-language composer and localization visibility.
- PR #22 (`40314bc`): draft-edit catalog/custom line parity.
- PR #23 (`8a4cbdf`): quotation validity UX.
- PR #24 (`44b7464`): authenticated proposal PDF preview.
- PR #25 (`a878ca4`): quotation delivery foundation and audit trail.
- PR #26 (`fe0a1d6`): provider-readiness boundaries and configuration state.
- PR #27 (`0c6c3a4`): Resend email delivery.
- PR #28 (`29cc4e1`): Meta WhatsApp Cloud API delivery code path.
- PR #29 (`421b3d2`): combined Email + WhatsApp delivery and failed-channel retry.
- PR #30 (`97577fb`): canonical quotation tax and totals integrity.
- PR #31 (`6ff9762`): localized line descriptions, line reordering and final
  Create/Edit composer parity.

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
  company-scoped order number. Repeated and concurrent conversions return the
  existing order without exposing a raw database conflict.
- Conversion and cancellation acquire the same tenant-scoped active quotation
  row lock before checking Sales Order state, so whichever operation commits
  first determines the other operation's stable lifecycle result.
- Conversion copies the persisted approved quotation customer, localized
  content, ordered line, discount, historical tax and totals snapshots inside
  one Prisma transaction. It does not reload or reprice from mutable customer,
  catalog, Price List or TaxRate records and does not invoke localization/AI.
- Creator identity and source approval identity/date are stored as historical
  audit snapshots, with a nullable creator user reference for retention.
- A quotation with a downstream Sales Order can no longer be cancelled, and
  cancellation updates lifecycle fields without rewriting quotation lines or
  commercial snapshots.
- Authenticated convert/list/detail APIs and localized, responsive Sales Order
  list/detail UI are available. The Sales Order is read-only after conversion.

Validated: 105 focused tests across 12 files, 501/501 full regression tests
across 77 files, TypeScript, Prisma format/validate/generate and 17-migration
status, lint, production build and diff checks.

P0 conversion/cancellation serialization correction validation: 69 focused
tests across 7 files and 518/518 full regression tests across 78 files, with
TypeScript, Prisma, lint, production build and diff checks passing.

Still deferred:

- Sales Order editing, confirmation, cancellation, fulfillment, inventory,
  warehouse, shipping and Sales Order PDF.
- Contracts, invoices and payments.
- Approval-time PDF binary/hash/manifest and cryptographic signatures.
- Canonical catalog-localization schema and live Price List composer use.
- Meta live configuration and provider changes; Meta was untouched.

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
- tenant-safe internal operational activity notes;
- lifecycle API request hardening;
- tenant-safe read/write boundaries.

Final Phase 4.3 validation reached 609/609 tests across 90 files.

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

Existing Customer snapshot reuse and server-owned tax/totals authority were
preserved.

Final Phase 5 validation:

- Prisma format / validate / generate: PASS
- TypeScript: PASS
- focused tests: 27/27 PASS
- full suite: 95 files / 635 tests PASS
- lint: PASS
- production build: PASS
- git diff check: PASS
- GitHub Quality CI: PASS

## Phase 6.1 — Text AI Sales Assistant / Structured Commercial Draft

Status: **Merged through PR #42 / Quality CI passed**.

Delivered:

- Natural-language sales request extraction (Arabic & English) into structured commercial intent;
- Infrastructure Ollama AI provider (`OllamaSalesAssistantAdapter`) with application-facing abstraction (`AISalesAssistantPort`);
- Untrusted AI output validation (`validateExtractedSalesIntent`) with deterministic heuristic parser fallback (`AISalesAssistantExtractor`);
- Candidate Customer matching against active tenant customers with strict ambiguity protection (`MATCHED`, `AMBIGUOUS`, `MISSING`);
- Active tenant Catalog item resolution with strict ambiguity protection;
- Canonical pricing via `PricingService` with zero PriceList price preservation and fallback rules;
- Non-authoritative `requestedPrice` capture for intent tracking;
- Server-owned tax rate and totals calculation reusing `QuotationCalculator`;
- Human approval boundary: draft generation performs NO automatic persistence and NEVER creates Customer or Quotation records automatically;
- "Apply to Quotation" populates the existing quotation Create composer via temporary client transfer for explicit human editing and normal Save;
- Authenticated `POST /api/ai/sales-assistant/draft` route with tenant scoping and role authorization (`OWNER`, `ADMIN`, `SALES`);
- Interactive bilingual UI workspace (`/dashboard/sales-assistant`) supporting Arabic RTL and English LTR;
- Comprehensive unit, API route, and UI test coverage.

## Phase 6.2 — Voice Input Transport

Status: **CLOSED / MERGED** through PR #44.

Delivered:

- Speech-recognition browser transport abstraction (`BrowserSpeechRecognizer`) and custom React hook (`useVoiceInput`) under `src/infrastructure/voice/browser/`;
- Natural voice capture in Arabic (`ar-KW`) and English (`en-US`) directly into the existing Phase 6.1 Sales Assistant prompt field (`/dashboard/sales-assistant`);
- Smart prompt appending/merging behavior preserving user-entered text;
- Complete voice UX states: `IDLE`, `LISTENING`, `PROCESSING`, `READY`, `UNAVAILABLE`, `PERMISSION_DENIED`, `ERROR`;
- Strict privacy invariants: ZERO audio persistence, no audio files, no backend audio uploads, no audio schema additions, no transcript logging;
- Full accessibility: keyboard-accessible microphone controls, ARIA live regions for screen readers, bilingual labels, no color-only state indication;
- Invariant enforcement: voice ONLY acts as an input transport for prompt text; speech completion NEVER triggers automatic proposal generation, customer creation, or quotation persistence;
- Preserved Clean Architecture and Phase 6.1 pipeline authority: `POST /api/ai/sales-assistant/draft` and downstream quotation composer remain unchanged;
- Full test suite: 103 test files / 665 tests PASS, TypeScript PASS, lint PASS, production build PASS, diff check PASS. Zero database schema or dependency changes.


## Phase 6.3 — AI Model Routing

Status: **CLOSED / MERGED** through PR #46 at `8ad47179408e2753f1ece92aedb8d0e5ab0641d8` after green Quality #83.

Delivered:

- Cloud-primary plus local-fallback routing for AI Sales Assistant and Translation / Localization.
- Primary interactive AI candidate: `minimax-m3:cloud`.
- Local fallback candidate: `qwen3:1.7b`.
- Sales AI and Translation model configuration are independently configurable.
- Cloud requests omit `format: "json"`, forced `num_ctx`, and low `num_predict` ceilings.
- Local Ollama models retain compatible structured JSON options.
- Fallback covers network failure, timeout, HTTP failure, empty output, invalid JSON, `done_reason=length`, semantically invalid Sales output, and invalid Translation key sets.
- `validateExtractedSalesIntent` remains authoritative.
- AI remains non-canonical for tenant ownership, Customer/Catalog identity, pricing, tax, totals, approval, Sales Order, branding, history and persistence.
- No Prisma schema, migration, dependency or paid-provider changes were introduced.

Final validation:

- focused tests: 42/42 PASS
- full suite: 106 files / 708 tests PASS
- TypeScript: PASS
- lint: PASS
- production build: PASS
- diff check: PASS
- GitHub Quality #83: PASS

Core invariant:

AI PROPOSES. SERVER VALIDATES. HUMAN SAVES.

Phase 6.4 subsequently closed. The approved Phase 7 architecture is recorded in
[ADR-010: Commercial Document Lifecycle](ADR-010-COMMERCIAL-DOCUMENT-LIFECYCLE.md).
Phase 7 implementation has not begun.

## Phase 6.4 — Product Integrity & Stabilization

Status: **CLOSED / MERGED**

The stabilization sequence is closed on canonical `main` at
`20c83d9c034189cbf40f907840fdaa81847c100b` through PR #54.

### Phase 6.4A — Localization Integrity

Status: **CLOSED / MERGED** through PR #48.

Canonical merge commit:

`32823da495d7564c810b1479bb0133b11741e905`

Delivered:

- false `COMPLETED` quotation localization prevention;
- validation of required translated targets before localization completion;
- genuine requested-locale serialization for completed localization;
- no opposite/source-language line-item fallback masking broken completed localization;
- bounded, tenant-safe repair for broken editable DRAFT quotations;
- read-only quotation GET integrity detection without AI/provider side effects;
- explicit `POST /api/quotations/[quotationId]/localize` mutation boundary for controlled re-localization;
- APPROVED quotation immutability preserved;
- Customer bilingual master-data intentionally deferred to Phase 6.4B;
- Phase 6.3 MiniMax Cloud primary + Qwen local fallback routing preserved.

Validation:

- focused Phase 6.4A tests: 8/8 PASS;
- Phase 6.3 routing tests: 22/22 PASS;
- full regression: 107 files / 716 tests PASS;
- TypeScript PASS;
- lint PASS with only 4 pre-existing warnings;
- production build PASS;
- diff check PASS;
- GitHub Quality PASS.

No Prisma schema changes, migrations, or dependency changes.

### Phase 6.4B — Customer Master Data

Status: **CLOSED / MERGED** through PR #50, with bilingual Customer UX
completion through PR #51 at
`fceba986768d09a69cb1c74fd7c90d62f2c53feb`.

Delivered boundary:

- server-generated tenant-safe Customer code;
- bilingual Customer naming architecture;
- preserved Customer authority and historical quotation/SalesOrder snapshots;
- no automatic Customer creation from AI.

### Phase 6.4C — Delivery Configuration & UX

Status: **CLOSED / MERGED** through PR #52 at
`a95dd42d32fed7022f006d1f4489c8715261dea9`.

Delivered configuration-readiness representation, provider visibility and
delivery UX without falsely enabling unavailable channels.

### Phase 6.4D — Dense Quotation Composer UX

Status: **CLOSED / MERGED** through PR #54 at
`20c83d9c034189cbf40f907840fdaa81847c100b`.

Delivered the dense quotation composer UX with desktop-oriented continuous
rows, keyboard-friendly entry and RTL/LTR parity.

Phase 6.4 is formally closed. Phase 7A Commercial Document Foundation and Phase
7B.1 Contract MVP have been implemented according to
[ADR-010](ADR-010-COMMERCIAL-DOCUMENT-LIFECYCLE.md), but are not yet closed or
merged. The current CTO review worktree contains uncommitted blocker fixes and
focused verification; see [the resume point](context/08_RESUME_POINT.md).
- Commercial document kinds & provenance foundation delivered;
- Contract domain aggregate, persistence, use cases & APIs delivered (DRAFT-first, direct contract support).

<!-- ADR-011-UCL-PROJECT-STATUS -->

## Universal Commercial Library Architecture & UCL-3 Ingestion Pipeline

Status: **UCL-2 MERGED TO MAIN at `3834be9ff1a94bbe501fe69dd8ef4d7257e4efae`; UCL-3 IMPLEMENTED in PR #62 / CTO REVIEW VERIFIED LOCALLY / PENDING MERGE.**

ADR-011 establishes VOKA's shared Universal Commercial Library while
preserving the existing Company Catalog as tenant-owned operational master data.

UCL-1 Foundation delivered:
- Global commercial identity model (`UniversalCatalogItem`);
- Hierarchical commercial taxonomy model (`UniversalCategory`);
- Source & provenance models (`UniversalSource`, `UniversalItemProvenance`);
- Explicit tenant adoption boundary (`UniversalItemAdoption`, `AdoptUniversalItem`);
- Server-side technology-independent bounded retrieval (`IUniversalLibraryRepository`, `PrismaUniversalLibraryRepository`, max page size limit 50, cursor pagination);
- Authenticated API endpoints under `app/api/universal-library/`;
- Database migration `20260821000000_ucl_1_foundation`.

UCL-2 Commercial Identity Enrichment delivered:
- Universal manufacturers (`UniversalManufacturer`), brands (`UniversalBrand`), and product families (`UniversalProductFamily`);
- Model number and variant hierarchy (`parentId`, `modelNumber`, `variantName`, `variants`);
- Multilingual aliases (`UniversalItemAlias`);
- Exact typed external identifiers (`UniversalItemIdentifier`: GTIN, EAN, UPC, MPN, MODEL_NO) with normalized exact lookup (`LookupByUniversalIdentifier`);
- Structured attribute definitions (`UniversalAttributeDefinition`) and typed attribute values (`UniversalItemAttributeValue`);
- API endpoints for `/api/universal-library/manufacturers`, `/api/universal-library/brands`, and `/api/universal-library/identifiers/lookup`;
- Database migration `20260821120000_ucl_2_identity_enrichment`.

UCL-3 ingestion machinery delivered in PR #62:
- raw source staging, deterministic hashing and source-scoped idempotency;
- conservative normalization and identity resolution;
- bounded atomic batch processing and transactional publication;
- OWNER/ADMIN-only administrative APIs;
- migration `20260821180000_ucl_3_ingestion_normalization`.

UCL-4 Hybrid Commercial Retrieval delivered:
- Technology-independent hybrid retrieval domain contract (`CommercialCandidate`);
- Deterministic lexical ranking engine (`CommercialRankingService`);
- Automatic adoption collapse into tenant `CatalogItem` candidates;
- Authenticated `GET /api/commercial-retrieval` API endpoint;
- Compact AI candidate projection (`toAICandidateProjection`);
- Bounded oversampling and hard limit enforcement (default 20, max 50).

NO EXTERNAL DATASETS OR PRODUCTION SEED DATA INGESTED. NO VECTOR/EMBEDDING SEARCH IMPLEMENTED. UCL-5 NOT STARTED. IMPLEMENTATION PENDING CTO MERGE.
