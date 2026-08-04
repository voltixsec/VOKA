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
