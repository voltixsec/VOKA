# Roadmap

## Sprint 09A - Quotation API

Status: Completed and merged through PR #11 at `287ff8f`.

## Sprint 09B - Quotation Workspace

Status: Implementation Complete - Ready for Review

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

Status: Proposed; requires owner approval after Sprint 09B.

Candidate scope: branded bilingual PDF, QR code, download/print, email, and a
human-approved WhatsApp integration foundation.

## Import / Export Center

- Status: Planned
- Priority: Medium
- Sequence: After Core Sales Engine completion
