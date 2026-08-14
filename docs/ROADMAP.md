# Roadmap

## Sprint 09A - Quotation API

Status: Completed and merged through PR #11 at `287ff8f`.

## Sprint 09B - Quotation Workspace

Status: Completed and merged through PR #12 at 73bb875.

Delivery order:

1. Sprint close/charter documentation.
2. Quotation list navigation and page.
3. Quotation details and lifecycle actions.
4. Create and edit-draft workflows.
5. UI/integration tests and GitHub Actions.

Acceptance criteria:

- Users can list, search, filter, and page tenant-owned quotations.
- Users can view quotation details and totals.
- Authorized users can execute valid lifecycle actions with explicit confirmation.
- Users can create quotations and edit drafts only.
- Arabic, English, and RTL are supported.
- Cross-company access remains indistinguishable from missing records.
- TypeScript, tests, Prisma validation, and production build pass.
- Pull requests run automated quality checks.

## Sprint 10 - Quotation Documents and Sharing

Status: Document, composer and delivery stages are delivered through Phase 3.

- Sprint 10A: Document Engine architecture, branded bilingual/RTL quotation PDF,
  safe QR content, authenticated download, browser print, and automated tests.
- Sprint 10B: Proposal composer, preview, email and human-approved WhatsApp
  delivery with a delivery audit trail.

Next.js 16 compatibility/security migration is a separate workstream and must not
be mixed into Sprint 10 implementation.

## Import / Export Center

- Status: Planned
- Priority: Medium
- Sequence: After Core Sales Engine completion

## Sprint 10B — Quotation Proposal Composer

Status: **Delivered and closed through PR #31 at `6ff9762` on 2026-08-14**

### Goal

Evolve the quotation document into a professional bilingual commercial proposal.

### First Delivery Slice

- Add quotation subject in Arabic and English.
- Add quotation brief in Arabic and English.
- Add structured `scopeType`.
- Add project name and customer attention fields where required.
- Add a dedicated commercial cover page.
- Move BOQ, totals and terms to following pages.
- Allow BOQ content to continue across additional pages. This remains deferred;
  the current renderer has a cover plus BOQ page, not general dynamic
  continuation pagination.
- Place the approval/signature block on the final page.
- Place the block on the right for Arabic and the left for English.

## Phase 1.4 Close - 2026-08-13

Branded proposal delivery was merged through PR #18 at `d5599b2`, including
English/Arabic stationery parity,
approval assets and verification, asynchronous localization resilience, approval
localization fencing, and Unicode bidi-aware Arabic PDF layout. PR #19 then
merged the safe transitive dependency patch at `23c2d2f`.

Delivered items that supersede the earlier first-slice plan include bilingual
subject and brief, structured scope type, commercial cover, BOQ/terms page,
approval identity and signature/stamp block, approval-time branding snapshot,
and human approval fencing.

Still deferred:

- WebP company-image compatibility; current validation supports PNG/JPEG and
  rejects WebP.
- Custom primary/accent branding; current delivery uses preset brand themes.
- General dynamic multi-page BOQ pagination.
- Next 16 security migration for remaining nested PostCSS/Sharp findings; this
  is a separate engineering workstream, not a product feature.

Phase 3 delivery then closed the remaining composer and delivery UX through:

1. PR #21 (`627d467`) - active-language UX and localization visibility.
2. PR #22 (`40314bc`) - edit-line catalog/custom parity.
3. PR #23 (`8a4cbdf`) - quotation validity UX.
4. PR #24 (`44b7464`) - proposal PDF preview.
5. PR #25 (`a878ca4`) - delivery foundation and audit trail.
6. PR #26 (`fe0a1d6`) - provider readiness.
7. PR #27 (`0c6c3a4`) - Resend email delivery.
8. PR #28 (`29cc4e1`) - Meta WhatsApp Cloud API delivery code.
9. PR #29 (`421b3d2`) - Email + WhatsApp delivery and failed-channel retry.
10. PR #30 (`97577fb`) - canonical tax and totals integrity.
11. PR #31 (`6ff9762`) - line descriptions, accessible reordering and final
    Create/Edit parity.

The delivered composer now provides a single-active-language workflow,
localization-state visibility, catalog/custom lines, localized descriptions,
stable reordering, validity, canonical discounts/tax/totals, preview, PDF and
approval behavior. Email, Both-channel and failed-channel retry are available.
The Meta provider code is complete; live Meta credentials, phone-number and
approved-template configuration remain deferred environment work.

The next product frontier is a read-only Phase 4/5 assessment covering
approval/downstream commercial-document lifecycle and canonical
customer/catalog reuse. This roadmap close does not authorize implementation.

Continuing guardrails:

- Preserve tenant isolation and role authorization.
- Require human review before final PDF generation.

### Planned Scope Types

- Supply only.
- Supply and installation.
- Installation only.
- Service.
- Maintenance.
- Consultation.
- Custom.

### Later Slices

1. Web-based proposal templates.
2. AI-assisted subject and brief generation.
3. Voice quotation capture and intent extraction.
4. AI-assisted scope and commercial terms.
5. Email and WhatsApp delivery. Delivered in Phase 3; live Meta account
   configuration remains deferred.
6. Certificate-based cryptographic PDF signatures.

### Out of Scope for the First Slice

- Full voice implementation.
- Autonomous AI approval.
- Autonomous document sending.
- WhatsApp integration.
- Email delivery.
- Sales orders.
- Invoices and payments.
- Advanced Import / Export Center.
- Unnecessary Prisma changes.

### Historical Entry Condition

Sprint 10A was merged into `main` through Pull Request #15.

Verified merge commit:

`9d6db831373d13b2ea7a6f269c1cc903f23617fb`

These entry conditions are retained as history and have been superseded by the
merged Phase 1.4 and Phase 3 implementation. Any Phase 4/5 slice requires a
fresh read-only assessment and CTO-approved acceptance criteria from current
`main`.

## Phase 4.1 - Approved Quotation to Sales Order Draft

Status: **Implemented and validated; merge metadata pending**

This bounded slice delivers the first downstream commercial snapshot:

- APPROVED-only conversion to exactly one DRAFT Sales Order.
- Deterministic `SO-{quotation.number}` numbering with company uniqueness.
- Database-enforced source idempotency and safe concurrent-race recovery.
- Atomic copying of persisted customer, localized proposal/line, commercial,
  tax, total, creator and source-approval snapshots.
- No live customer/catalog/Price List/TaxRate repricing or client commercial
  authority.
- Tenant-scoped conversion/list/detail APIs and localized read-only UI.
- Quotation cancellation conflict after a Sales Order exists.

Future slices require separate approval for Sales Order operations,
confirmation, cancellation, fulfillment, inventory, PDF, contracts, invoices
or payments. Approval-time PDF artifact/hash, reusable canonical catalog
localization and live Price List composer integration also remain future work.
Meta configuration and delivery-provider architecture remain outside Phase 4.1.
