# CTO Journal


Architecture decisions are recorded here.

## 2026-08-04

- Adopted AI First as an approved architecture decision.
- Approved the Advanced Import / Export Center as an optional capability for advanced users.
- Confirmed that the Import / Export Center is planned and has not been implemented.
- Adopted Codex Desktop as the official development execution agent after a successful GitHub workflow test.
- Added the permanent Context Pack in commit `9b197cc` as the repository-backed
  operational memory shared between workstations.
- Verified the laptop workspace at `C:\Dev\VOKA` against GitHub using
  fetch/switch/pull with fast-forward-only synchronization.
- Enforced tenant isolation for quotation lookup, update, and delete in commit
  `e49f67b`.
- Added tenant-owned reference validation for quotation creation in commit
  `a81cb50`.
- Kept Sprint 09A open pending approved API acceptance criteria and completion of
  the remaining HTTP surface and route-level tests.
- Confirmed GitHub and repository documentation as durable cross-workstation
  memory; Codex conversation state is not a synchronization mechanism.
- Reverified TypeScript, Prisma schema, production build, and 33 tests across 12
  test files at `a81cb50`.
- Approved and implemented the remaining Sprint 09A quotation API slice.
- Added tenant-scoped list/detail, draft update, and lifecycle HTTP workflows.
- Required persisted tenant-owned customer data as the customer snapshot source.
- Verified TypeScript, Prisma validation, production build, and 45 tests across
  16 test files at code commit `fdbafbb`.
- Marked Sprint 09A implementation ready for pull-request review; final close
  remains pending publish, merge, post-merge verification, and owner approval.
- Merged Sprint 09A through PR #11 at merge commit `287ff8f`, reran TypeScript,
  Prisma validation, all 45 tests, and the production build, then recorded the
  project owner's explicit close.
- Approved Sprint 09B - Quotation Workspace, with list, detail, lifecycle,
  create/edit-draft, bilingual/RTL, UI tests, and GitHub Actions in scope.
- Kept PDF, external sharing, downstream sales documents, full Voice/AI, and
  Import/Export outside Sprint 09B.
- Selected `src/` quotation and `/api/quotations` as the canonical implementation;
  Sprint 09B must not add a duplicate quotation domain under `features/`.

- Completed the Sprint 09B implementation locally: bilingual quotation workspace,
  lifecycle/create/edit flows, persisted-ID redirect, catalog regression fix,
  UI coverage, and pull-request quality automation; publication and merge remain pending.

- Merged Sprint 09B through PR #12 at 73bb875; GitHub Actions and post-merge
  TypeScript, Prisma, 49 tests, and production build all passed.

- Merged the Sprint 09B close documentation through PR #13 at 1af1b1c and
  set the next decision point to owner approval of the Sprint 10 charter.

## 2026-08-05

- The project owner approved Sprint 10 as two stages: Sprint 10A for quotation
  documents and Sprint 10B for human-approved external sharing.
- Approved a Clean Architecture boundary in which application contracts expose
  document snapshots and infrastructure owns PDF, font, QR, and delivery tools.
- Kept Next.js 16 migration outside Sprint 10 as a separate compatibility and
  security workstream.
- Confirmed that persistent logo/contact/legal branding is not present in the
  current Company model and requires a separate schema/migration decision.

## 2026-08-06 — Quotation Proposal Composer Approved

### CEO Proposal

The CEO approved evolving the quotation document from a single pricing sheet into a structured commercial proposal.

The reference format separates:

1. A commercial cover page.
2. One or more BOQ and terms pages.

### Product Decision

Approved Epic:

**Quotation Proposal Composer — Cover, Brief, Voice and Signature**

The quotation document shall support:

- A commercial cover page.
- Quotation subject.
- Project name.
- Customer and attention details.
- A concise bilingual brief.
- A structured scope type.
- Scope of work.
- Exclusions.
- Commercial terms.
- BOQ and totals on following pages.
- A visible approval/signature block on the final page.
- Right-aligned signature placement for Arabic documents.
- Left-aligned signature placement for English documents.
- Human approval before final document generation or sending.

### Supported Scope Types

Initial planned values:

- `SUPPLY_ONLY`
- `SUPPLY_AND_INSTALLATION`
- `INSTALLATION_ONLY`
- `SERVICE`
- `MAINTENANCE`
- `CONSULTATION`
- `CUSTOM`

Examples:

- Supply of CCTV equipment.
- Supply and installation of CCTV systems.
- Installation of customer-supplied equipment.
- CCTV maintenance services.

### Document Pagination Decision

The document is not technically limited to exactly two pages.

The approved rule is:

- One commercial cover page.
- One or more detail pages for BOQ, totals, scope and terms.
- The approval/signature block appears on the final page only.

### AI and Voice Decision

Voice and AI are part of the approved product direction, but not the first implementation slice.

Future flow:

`Voice or Web Input → AI Extraction → Quotation Proposal Draft → Human Review → Document Snapshot → PDF Renderer`

AI may propose the subject, brief, scope and commercial terms, but it shall not finalize or send the quotation without explicit human approval.

### Signature Decision

Phase one will provide a visible electronic approval block containing:

- Approver name.
- Job title.
- Approval date and time.
- Company identity.
- Optional private company stamp/signature asset.
- Safe verification reference or QR.

A certificate-based cryptographic PDF signature is a later capability and must not be confused with a visible signature image.

### Architecture Decision

The PDF renderer remains presentation infrastructure only.

It must not:

- Interpret voice.
- Generate business terms.
- Make AI decisions.
- Approve a quotation.
- Store authorization logic.

Subject, brief, scope and approval data must reach the renderer through an application-owned document snapshot.

### Delivery Decision

Sprint 10A remains unchanged after its approved commit.

The proposed next sprint is:

**Sprint 10B — Quotation Proposal Composer**

First implementation slice:

- Subject.
- Brief.
- Scope Type.
- Commercial Cover Page.
- Final-page Signature Block.

Voice and AI extraction are deferred to a later slice.

## 2026-08-13 - Phase 1.4 Branded Proposal Delivery Close

Completed the English and Arabic branded proposal milestone on
`feature/branded-proposal-delivery`.

Technical decisions verified:

- PDF generation remains read-only presentation infrastructure.
- Approved document branding and verification identity remain immutable.
- Approval requires `localizationStatus=COMPLETED`; `PENDING` and retryable
  `FAILED` states return conflict without approval mutation or token generation.
- Quotation creation remains asynchronous and does not wait for Ollama.
- Arabic PDF mixed-direction layout uses Unicode Bidirectional Algorithm run
  resolution (`bidi-js`) with explicit visual run placement, while Arabic runs
  remain logical for Cairo shaping and numeric/Latin runs remain LTR.

Close validation: Prisma schema valid, 15 migrations applied, Prisma Client
generated, TypeScript passed, 251/251 tests passed, diff checks passed, and
rendered Arabic/English PDF QA completed.

First next task: CTO review the staged Phase 1.4 change set and merge the feature
branch if approved. No new PDF, localization, or verification scope is implied.

## 2026-08-16 — Phase 5 Canonical Catalog Integration formally closed

- PR #40 merged after CTO semantic/security review.
- Official main baseline:
  `55ef31e4fba7b38d0225aeb1296c7f1712fea38c`.
- Final implementation preserved zero-price semantics, tenant-safe Unit access,
  tenant/shared uniqueness and deterministic tenant-first Unit lookup.
- Historical quotation and Sales Order snapshots remain immutable against
  mutable master-data changes.
- Final regression state: 95 files / 635 tests passing plus green Quality CI.
- Phase 5 recovery worktrees and temporary patches were removed after formal
  closure.
- Next approved frontier: Phase 6.1 — Text AI Sales Assistant / Structured Draft.
  Voice remains deferred until the structured drafting contract is stable.