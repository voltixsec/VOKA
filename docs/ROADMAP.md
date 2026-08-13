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

Status: Approved as two delivery stages on 2026-08-05.

- Sprint 10A: Document Engine architecture, branded bilingual/RTL quotation PDF,
  safe QR content, authenticated download, browser print, and automated tests.
- Sprint 10B: Email and human-approved WhatsApp integration foundation with a
  delivery audit trail.

Next.js 16 compatibility/security migration is a separate workstream and must not
be mixed into Sprint 10 implementation.

## Import / Export Center

- Status: Planned
- Priority: Medium
- Sequence: After Core Sales Engine completion

## Sprint 10B — Quotation Proposal Composer

Status: **Document foundation delivered through Phase 1.4 / UX finalization pending assessment**

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

The next product frontier is Proposal Composer UX finalization / Phase 3
assessment. No additional proposal feature is authorized by this documentation
realignment alone.

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
5. Email and WhatsApp delivery.
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
merged Phase 1.4 implementation. Any new UX slice requires a fresh assessment
and CTO-approved acceptance criteria from current `main`.
