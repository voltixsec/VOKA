# VOKA — UCL-CLOSE-06 Batch Wizard Implementation

Date baseline: 2026-09-08

Branch:

`arena/01a08189-voka`

This is an implementation checkpoint, not local validation and not CEO acceptance.

## Closure State

- UCL-CLOSE-01 — CLOSED
- UCL-CLOSE-02 — CLOSED
- UCL-CLOSE-03 — CLOSED
- UCL-CLOSE-04 — CLOSED / ACCEPTED
- UCL-CLOSE-05 — CLOSED / ACCEPTED
- **UCL-CLOSE-06 — IMPLEMENTED / PENDING LOCAL VALIDATION / PENDING CEO ACCEPTANCE**
- UCL V1 — NOT CLOSED

UCL V1 must not be declared fully closed until UCL-CLOSE-06 is accepted.

## Operator Journey

Surface:

`/dashboard/universal-library/batches`

Steps:

File → Upload → Batch → Process → Staging → Hierarchy → Products → Review → Publish → Status / History

APIs:

- `GET /api/universal-library/bulk-import/ui/journey`
- `POST /api/universal-library/bulk-import/ui/process`

Both require platform admin (`OWNER`/`ADMIN` through `withPlatformAdminAuth`),
require `VOKA_UCL_BULK_IMPORT_SECRET` server-side, and do not return that secret
to the browser.

## Proven Behavior

- Upload/staging never publishes (`publishedCount` remains 0).
- Process maps bulk envelopes, normalizes, resolves identity conservatively, and
  lands `NEEDS_REVIEW`.
- Hard failures are isolated; other records in the same pass continue.
- The same process pass does not replay records it just failed.
- A later process pass retries `FAILED` records and resumes remaining `RECEIVED`
  records without replaying review-ready rows.
- Invalid JSONL lines are counted at staging (`invalidRecords`) and do not block
  valid siblings.
- Failed/missing chunks remain visible as `retryChunkIndexes`; Resume opens
  upload and requires re-selecting the original file.
- Process remaining loads source/batch/namespace into the wizard without a file.

## Known Limit

History Resume does not bypass file re-selection. The original JSONL is still
required to replay only failed/missing chunks. Selected batch identity persists
in localStorage across refresh/reopen so Process remaining and journey counts
restore without re-entering keys.

## Automated Evidence

Focused CLOSE-06 suite:

- 10 files / 26 tests PASS

Broader UCL + operator UI in this sandbox:

- 53 files / 303 tests PASS
- 9 files did not load: `lib/generated/prisma` is gitignored and
  `prisma generate` could not download engines in this environment.

No live CEO Batches journey was executed (`DATABASE_URL` absent).

## Remaining Release Gates

Still OPEN / unchanged:

- `UCL-CLOSE-06` local typecheck / Prisma validate / production build
- `UCL-CLOSE-06` live CEO operator acceptance
- `LIVE-FAIL-001 — Payment Registration End-to-End` — RED / BLOCKER
- `AUTH-DIRECT-ROUTE-GATE` — OPEN for Phase 4C

Data Factory remains **PAUSED** at:

System008 — IP Video / `SEC-SYS008-B004 — Hikvision IP fixed/network cameras`

## Git / Release Boundary

- No merge performed.
- No tag created.
- CLOSE-04 synthetic DB acceptance records must be preserved.
- Do not rebuild UCL-1 through UCL-6 foundations.
