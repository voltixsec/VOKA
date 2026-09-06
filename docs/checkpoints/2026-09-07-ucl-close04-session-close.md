# UCL-CLOSE-04 session closure — 2026-09-07

Branch: `feature/pre-staging-product-coherence`.
Pre-session remote baseline: `50fb05ab46a8f80278a00f880fa6cddca4a66956`.
The commit containing this checkpoint records the bounded closure. The CEO
authorized commit and push to this branch, not merge to main, tagging, destructive
database operations or deletion of acceptance records.

Canonical status remains in the
[Master Product Acceptance Ledger](../product/MASTER_PRODUCT_ACCEPTANCE_LEDGER.md).
No additional master ledger was created. This closure supersedes the earlier
request to create a separate release master ledger.

## Accepted closure status

| Slice | Decision | Evidence |
| --- | --- | --- |
| UCL-CLOSE-01 — Global Metrics Truth | 🟢 CLOSED | Live global total 3336 = 3248 Product Models + 40 Items + 48 Services; loaded/current page 50; matching/global/page concepts separated |
| UCL-CLOSE-02 — Staged vs Published Clarity | 🟢 CLOSED | Population UI: MODE Governed Staging; PUBLICATION Review Required; staged candidates and Evidence before publication |
| UCL-CLOSE-03 — Platform Admin Boundary | 🟢 CLOSED | Fail-closed platform allowlist, separate from CompanyRole; same company admin denied without allowlisting and allowed with it |
| UCL-CLOSE-04 — Review → Approve/Reject → Publish | 🟢 CLOSED / ACCEPTED | Explicit review of persisted staging, authenticated server actor, successful live approve/reject decisions |
| UCL-CLOSE-05 — Explicit Adoption / Commercial Truth | 🟡 OPEN — NEXT | Prove explicit adoption into tenant-owned Company Catalog and quotation snapshots |
| UCL-CLOSE-06 — End-to-End Batch Wizard | 🟡 OPEN | Complete operator journey including error, retry, resume and partial/failure behavior |

The live evidence below is the CEO's supplied final acceptance decision, not a
claim that the closing agent repeated browser or database mutation steps.

## Implementation captured

- `StagedProductsGlobalTotals` counts global commercial staging, excluding
  PUBLISHED / REJECTED / FAILED; filtered matching and loaded page counts are distinct.
- `VOKA_PLATFORM_ADMIN_USER_IDS` and `VOKA_PLATFORM_ADMIN_EMAILS` govern a
  fail-closed platform allowlist independently of CompanyRole.
  `withPlatformAdminAuth` protects operator APIs and the Universal Library layout
  gates the operator dashboard. Published read/adoption routes remain tenant scoped.
- `ProcessIngestionBatch` sends valid normalized records to NEEDS_REVIEW.
  Malformed/normalization failures use FAILED, not REJECTED. Processing no longer
  auto-publishes. REJECTED is an explicit reviewer outcome.
- `ReviewIngestionRecord` and the Review API accept APPROVE / REJECT. Reviewer
  identity comes from authenticated server context, not client fields.
- Publication derives from persisted staged state. Transactional state guards
  require NEEDS_REVIEW for both decisions and block double decisions.
- Review decisions append history with actor, decision, optional note and time;
  the application does not update/delete earlier review events.
- Evidence before publication exposes source, source type, verification, trust,
  canonical/source links, attribution/fetched metadata when present, publication
  target, normalized candidate and raw source payload.

## Migrations

Required migration files captured in this closure:

1. `20260906210230_ucl_review_governance` — review decision enum APPROVED/REJECTED
   and `UniversalIngestionReviewEvent` with ingestionRecordId, decision,
   actorUserId, note and createdAt.
2. `20260907003000_ucl_review_transition_guard` — governed review transitions.
3. `20260907004500_ucl_rejected_review_only_guard` — remove automated entries to REJECTED.

Historical `20260827133027` was restored exactly; the CEO's supplied prior DB
verification reports its checksum matched the already-applied migration.
The closing validation confirms all 45 repository migrations are applied and
the database is up to date. No migration deployment/reset was performed by the
closing agent.

Final transition policy includes PROCESSING → NEEDS_REVIEW / FAILED,
NEEDS_REVIEW → PUBLISHED / REJECTED, and PUBLISHED → NEEDS_REVIEW. It disallows
RECEIVED, NORMALIZED, MATCHED and PROCESSING → REJECTED. The normal entry to
REJECTED is explicit review from NEEDS_REVIEW. Other retry/reprocessing
transitions remain as specified in the final SQL migration.

## Live evidence and retained synthetic records

Platform access was denied for the same company administrator without the
platform allowlist and allowed with `VOKA_PLATFORM_ADMIN_EMAILS=admin@voka.local`.
A logged-in non-platform company administrator visiting
`/dashboard/universal-library/review` was redirected to `/dashboard`.

| Synthetic external record ID | Final status | matchedItemId | Latest decision | Latest actorUserId |
| --- | --- | --- | --- | --- |
| VOKA-UCL-CLOSE04-LIVE-APPROVE-20260907 | PUBLISHED | cmtqc2k8k0003i8t1z4etlzwh | APPROVED | cmsaa0wym00000ct1nju00h2l |
| VOKA-UCL-CLOSE04-LIVE-REJECT-20260907 | REJECTED | null | REJECTED | cmsaa0wym00000ct1nju00h2l |

Authenticated user: `cmsaa0wym00000ct1nju00h2l`, `admin@voka.local`.
These final decisions prove server-derived authenticated actor identity. Preserve
both synthetic records as bounded acceptance/audit evidence; do not delete them.

A separate manual browser-console 403 call against
`/api/universal-library/review` was **NOT executed** in the final live pass.
Review API denial is covered by passing route tests; the shared platform guard
was previously live-proven during CLOSE-03 and Review UI redirection was live-proven.

## Validation evidence

Supplied pre-closure evidence: focused governance 4 files / 17 tests PASS;
review evidence/operator tests 5 files / 13 tests PASS.

Fresh closing-agent validation:

- `npx vitest run --passWithNoTests universal-library lib/auth`: PASS,
  57 files / 426 tests, zero failures.
- `npm run typecheck`: PASS, zero errors.
- `npx prisma validate`: PASS.
- `npx prisma migrate status`: PASS, 45 repository migrations, database up to date.
- `npm run build`: PASS, including compilation, type/lint checks, static page
  generation, optimization and build traces. Existing nonblocking React hook /
  ARIA warnings remained; none was suppressed.
- `git diff --check`: PASS, no errors; configured CRLF conversion notices only.

Known nonblocking Vitest warnings: future native Vite config-loader compatibility
and nested `vi.unmock("process.env")` hoisting. The latter is P2/nonblocking
unless tied to a concrete functional failure. No warning was suppressed.

## Scope, scratch cleanup and exact resume

Only intended UCL closure code, tests, migrations and canonical documentation
belong in this commit. Environment files, secrets, database dumps, generated
logs and acceptance scratch scripts are excluded. The two inspected untracked
scratch helpers were `scripts/_local_patch_ucl_review_evidence.js` and
`scripts/_local_ucl_close04_live_acceptance.ts.txt`; only these untracked helpers
were removed after retaining the acceptance evidence above. Their earlier synthetic actor
placeholder is not the final authenticated actor recorded above.

Next exact work: **UCL-CLOSE-05 — Explicit Adoption / Commercial Truth**.
Do not start it as part of this session closure.

Data Factory remains **PAUSED**. Exact future resume remains:
**System008 — IP Video / SEC-SYS008-B004 — Hikvision IP fixed/network cameras**.

**LIVE-FAIL-001 / CEO-R1-030 — Payment Registration remains RED/BLOCKER.**
**AUTH-DIRECT-ROUTE-GATE remains OPEN for Phase 4C.**
Closing these four UCL slices does not close the remaining release gates or UCL as a whole.
