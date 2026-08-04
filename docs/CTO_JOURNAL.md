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
