# UCL-CLOSE-06 engineering-ready checkpoint

Date: 2026-09-08

Status: **IMPLEMENTED / ENGINEERING VALIDATED / PENDING CEO LIVE UI ACCEPTANCE**.
UCL-CLOSE-06 is not CLOSED or ACCEPTED; UCL V1 is not closed.

## Integration

- Official branch: feature/pre-staging-product-coherence.
- Verified clean pre-task HEAD: d0cd29eddda611e6670b5434827b5c6ee8d6cb99.
- Arena candidate: a1812786a79fd723184b11f2d643e3d8749d156d.
- Candidate commits: 7aac371 then a1812786, cherry-picked with --no-commit.
- Narrow corrections were applied before the single engineering commit.
- No merge, tag, PR, harvesting, database reset, or prior evidence deletion.

## Defects and corrections

1. Actual PostgreSQL rejected RECEIVED -> PROCESSING (P0001). The transition
   trigger now permits processing claims from RECEIVED/FAILED and incomplete
   NEEDS_REVIEW only. Review-ready and rejected rows cannot re-enter processing.
2. The existing status-data check then rejected processing with an absent
   normalized payload (23514). PROCESSING now represents a leased normalization
   attempt; normalized/matched/published payload and terminal guards remain.
3. Claims/counts consistently handle SQL NULL and JSON null. Expired processing
   claims are recoverable after 15 minutes; active claims remain excluded.
4. Missing upload chunks and active/incomplete processing are shown truthfully;
   terminal-only batches no longer report outstanding review.
5. Upload completion refreshes the selected journey; switching identity remounts
   it to prevent prior-batch state leakage. Refresh errors are surfaced safely,
   and unavailable localStorage does not crash the active session.
6. Invalid process limits return 400; unexpected process/journey errors remain
   generic client-side and are logged server-side.

## Database changes and evidence

Applied only to the existing local development DB, after verifying each was the
only pending migration:

- 20260908160000_ucl_wizard_processing_claims
- 20260908161500_ucl_wizard_processing_payload

These do not delete data or reset/recreate the database. The second replaces a
check constraint atomically while preserving all non-processing requirements.
Other environments require these migrations before using the new processor.

Synthetic batch: VOKA-UCL-CLOSE06-ENGINEERING-20260908.
Namespace: VOKA_SYNTHETIC_ENGINEERING.
Source: cmtsv5zyy0000pot1bbma3ncc.
Durable run: cmtsv601d0001pot1szsak76u (COMPLETED upload, four accepted rows).
The fixture contains neutral engineering descriptions, no real commercial claims.

- Actual application runner created four durable RECEIVED records.
- Bounded first process: 1 review-ready, 1 failed, 2 pending; progress 25%.
- Resume: 3 review-ready, 1 intentionally invalid identifier row failed; 75%.
- Retry touched only the failed row. Successful row ids/retry counts stayed
  unchanged. The batch retained four unique ingestion rows.
- Canonical count was unchanged throughout. No process publication or adoption.
- Journey/status was reread through repository queries after each invocation.
- Retained failed row: cmtsv60510003pot1ef1m2stf; intentionally invalid identifier
  type NOT_A_TYPE, safe synthetic failure evidence, not a product defect.
- PostgreSQL regression uses rollback-only fixtures to prove received/failed/null
  review claims, expired claim recovery, active lease exclusion, no ready/terminal
  replay, and DB rejection of direct publication and rejected-row processing.
- Existing review/API and E2E tests preserve explicit approve/reject and actor gates.

## Fresh engineering gates

- npx prisma generate: PASS (Prisma 7.9.1).
- npx prisma validate: PASS.
- npx vitest run --passWithNoTests universal-library: **68 files / 484 tests PASS**,
  with UCL_CLOSE06_DB_TESTS=1 to enable the rollback-only DB contract.
- npm run typecheck: PASS.
- npm run build: PASS, exit 0.
- git diff --check: PASS.
- Existing Vite configuration / vi.unmock deprecation warnings remain non-failing.
- No dependency changes, generated Prisma output, secrets, telemetry/plugin files,
  or temporary debugging files are included.

## Exact CEO live UI acceptance still required

On Batches, use a small neutral JSONL fixture and walk File -> Upload -> Batch ->
Process -> Staging -> Hierarchy -> Products -> Review -> Publish -> Status/History.
Verify visible partial/failure counts, retry failed work, resume after interruption,
no replay of completed work, selected-batch persistence on refresh/reopen, and an
explicit authenticated review decision before publication. Confirm durable status
and history after returning to the batch. Engineering DB/tests are not CEO UI acceptance.

Original file re-selection remains required for missing/failed upload chunks;
file bytes are not persisted in browser storage. Interrupted processing leases
become recoverable after 15 minutes. The normal UCL suite skips the DB contract
unless explicitly enabled against a local development DB.

Data Factory remains **PAUSED** at System008 / SEC-SYS008-B004.
LIVE-FAIL-001 remains **RED / BLOCKER**. AUTH-DIRECT-ROUTE-GATE remains **OPEN**.
No next product phase starts until CEO acceptance. No merge or tag.

## Files changed

- app/api/universal-library/bulk-import/ui/journey/__tests__/route.test.ts
- app/api/universal-library/bulk-import/ui/journey/route.ts
- app/api/universal-library/bulk-import/ui/process/__tests__/route.test.ts
- app/api/universal-library/bulk-import/ui/process/route.ts
- components/universal-library/UniversalLibraryBatchWizard.tsx
- components/universal-library/UniversalLibraryBatchesConsole.tsx
- components/universal-library/UniversalLibraryBulkImportExecutionControl.tsx
- components/universal-library/__tests__/BatchWizardUploadRefresh.test.tsx
- components/universal-library/__tests__/UniversalLibraryBatchWizard.test.tsx
- components/universal-library/__tests__/batchWizardSelection.test.ts
- components/universal-library/batchWizardSelection.ts
- docs/CTO_JOURNAL.md
- docs/checkpoints/2026-09-08-ucl-close06-engineering-ready.md
- docs/context/08_RESUME_POINT.md
- docs/product/MASTER_PRODUCT_ACCEPTANCE_LEDGER.md
- features/universal-library/__tests__/UclClose06E2EBatchWizard.test.ts
- features/universal-library/__tests__/UclControlPlaneBoundary.test.ts
- features/universal-library/application/bulk-import/GetBatchWizardJourney.ts
- features/universal-library/application/bulk-import/ProcessBulkImportWizardBatch.ts
- features/universal-library/application/bulk-import/__tests__/GetBatchWizardJourney.test.ts
- features/universal-library/application/bulk-import/__tests__/ProcessBulkImportWizardBatch.test.ts
- features/universal-library/application/bulk-import/__tests__/batchWizardTestSupport.ts
- features/universal-library/application/bulk-import/index.ts
- features/universal-library/application/index.ts
- features/universal-library/domain/bulk-import/BatchWizardContract.ts
- features/universal-library/domain/bulk-import/__tests__/BatchWizardContract.test.ts
- features/universal-library/domain/bulk-import/__tests__/mapBulkEnvelopeToRawPayload.test.ts
- features/universal-library/domain/bulk-import/mapBulkEnvelopeToRawPayload.ts
- features/universal-library/domain/index.ts
- features/universal-library/domain/repositories/UniversalLibraryRepository.ts
- features/universal-library/infrastructure/prisma/PrismaUniversalLibraryRepository.ts
- features/universal-library/infrastructure/prisma/__tests__/UclClose06Database.test.ts
- prisma/migrations/20260908160000_ucl_wizard_processing_claims/migration.sql
- prisma/migrations/20260908161500_ucl_wizard_processing_payload/migration.sql
