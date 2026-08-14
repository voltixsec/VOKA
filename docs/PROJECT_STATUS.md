# Project Status

Current Product Frontier: Phase 4/5 read-only assessment

Status: Phase 3 is closed. Phase 4.1 Approved Quotation to Sales Order Draft is
closed and merged through PR #33 at `9a22302`.

Phase 4.1 starting baseline: `9062aa6` on `main` (2026-08-14)

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
- Codex Desktop development execution workflow: `APPROVED`

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
- Conversion copies the persisted approved quotation customer, localized
  content, ordered line, discount, historical tax and totals snapshots inside
  one Prisma transaction. It does not reload or reprice from mutable customer,
  catalog, Price List or TaxRate records and does not invoke localization/AI.
- Creator identity and source approval identity/date are stored as historical
  audit snapshots, with a nullable creator user reference for retention.
- A quotation with a downstream Sales Order can no longer be cancelled.
- Authenticated convert/list/detail APIs and localized, responsive Sales Order
  list/detail UI are available. The Sales Order is read-only after conversion.

Validated: 105 focused tests across 12 files, 501/501 full regression tests
across 77 files, TypeScript, Prisma format/validate/generate and 17-migration
status, lint, production build and diff checks.

Still deferred:

- Sales Order editing, confirmation, cancellation, fulfillment, inventory,
  warehouse, shipping and Sales Order PDF.
- Contracts, invoices and payments.
- Approval-time PDF binary/hash/manifest and cryptographic signatures.
- Canonical catalog-localization schema and live Price List composer use.
- Meta live configuration and provider changes; Meta was untouched.
