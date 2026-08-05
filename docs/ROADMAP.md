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
