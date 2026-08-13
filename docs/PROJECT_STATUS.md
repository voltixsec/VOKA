# Project Status

Current Product Frontier: Proposal Composer UX finalization / Phase 3 assessment

Status: Phase 1.4 and its safe dependency-hardening follow-up are merged and
closed. No next implementation slice has started.

Verified baseline: `23c2d2f` on `main` (2026-08-13)

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

Status: **Document foundation delivered / UX finalization pending assessment**

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

Deferred:

- Voice capture.
- AI intent extraction.
- AI-generated scope and terms.
- Certificate-based cryptographic PDF signing.
- Email and WhatsApp delivery.

Important:

Sprint 10A was merged into `main` through Pull Request #15.

Verified merge commit:

`9d6db831373d13b2ea7a6f269c1cc903f23617fb`

The Phase 1.4 merge superseded the earlier pending-documentation state and
delivered the proposal document foundation. The next product decision is a
Proposal Composer UX gap assessment and bounded acceptance criteria; no next
feature implementation has started.

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
