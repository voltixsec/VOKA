# VOKA Requirement + Evidence + Attachment Foundation — 2026-09-10

## Status

Recovery completed on the Arena-fixed execution branch `arena/01a08c94-voka` as a bounded continuation of the post-audit foundation sprint. No Supplier, SupplierCandidate, sourcing event, RFQ, PO, messaging, scraping, or Data Factory work was added.

The requested certification SHA `e46857f` is available remotely as `origin/v1-live-certification` after fetch, but this checkout remained on the Arena-mandated branch and was not reset or switched because it contained pre-existing user work. The checkout HEAD at start was `7b00c857a39d4d0d8bd6d8fbe4434b2595ba5287` and the working tree was already dirty.

## Source Artifact

Added the tenant-scoped `SourceArtifact` foundation and additive migration:

- `SourceArtifact` stores company ownership, server-generated id, original filename, MIME type, byte size, SHA-256, artifact kind, storage reference, source context, runtime correlation, processing state, extracted text/pages, and actor.
- `LocalSourceArtifactStorage` writes bytes to `.voka-storage/source-artifacts` (ignored from Git) through a stable storage reference. `VOKA_ARTIFACT_STORAGE_DIR` is the replacement seam for an object-storage adapter in production.
- `POST /api/source-artifacts` accepts multipart bytes, validates PDF/PNG/JPG/JPEG/WebP, hashes server-side, stores the bytes, extracts PDF text, creates page citations, and returns only a tenant-owned artifact projection.
- `GET /api/source-artifacts/[artifactId]` resolves only within the authenticated company and returns not-found for a cross-tenant id.
- Client-generated filename/size/last-modified ids are no longer sent as authority by the active Sales Assistant path.

## PDF Content Extraction

`PdfTextExtractor` is a bounded machine-readable PDF path. It reads PDF bytes, handles uncompressed text streams and common Flate-compressed streams, associates content streams with `/Type /Page` objects when the PDF exposes that structure, preserves page records, and never claims OCR or visual interpretation. Every retained PDF has a `SOURCE_ARTIFACT_TEXT` citation with page number, provenance, verification state, and supported claim summary.

Images are retained as real artifacts and report `STORED_PENDING_VISION`. No fabricated OCR or vision result is emitted.

## Evidence / Citation

Added `Citation` and `RequirementCitation` models. Citation fields keep source type, artifact or URL, title, page/sheet/section/line locator, publisher, observed timestamp, provenance, verification state, confidence, and supported claim summary separate. Inspection observations expose citations and artifact ids. Quotation handoff notes carry source claim/page references when a governed handoff contains them.

## Normalized Requirement

Added the smallest shared `Requirement` abstraction, not a Project/Tender/Supplier aggregate. It carries company scope, stable key/revision, source context, parent reference, system/component/material/service identity, description, quantity/unit, technical requirement, quantity status, review state, locality, provenance, correction trace, and citation links.

Sales runtime turns persist governed system/component requirements through `PrismaNormalizedRequirementRepository`. BOQ inspection conservatively creates review-required candidates only; it does not approve quantities and does not run supplier research. Future quotation and procurement projections can consume the stable Requirement without making QuotationLine the engineering source of truth.

## Inspection Tools

The three declared tools now have truthful execution boundaries:

- `ATTACHMENT_INSPECTION`: retrieves a real tenant-owned artifact and reads machine-readable PDF text, or reports pending vision for an image.
- `BOQ_INSPECTION`: reads extracted PDF text, detects only conservative BOQ-like lines, creates review-required Requirement candidates, and retains page citations.
- `DRAWING_INSPECTION`: retains artifact evidence and explicitly returns `DRAWING_VISUAL_ANALYSIS_NOT_AVAILABLE` until real visual analysis exists.

Missing artifacts, including fake metadata ids, return an unavailable result; no inspection claim is made.

## State Authority / Vehicle Elevator

The active Sales Assistant path uploads bytes before invoking the conversation runtime and passes the server artifact id. The runtime treats governed `confirmedFacts` and `workspace` as authority; the workspace is synchronized from those facts in the same successful turn. Direct Arabic handling now normalizes the CEO scenario:

`أريد نظام مصعد سيارات واحد لستة طوابق`

→ Vehicle Elevator, quantity 1, stops/floors 6.

Iterative quantity/floor correction and reconciliation retain those values. The vehicle-elevator graph intentionally has no invented BOM: `SYSTEM KNOWN`, `REQUIREMENTS PARTIAL`, and `Engineering components` remains a final-review blocker. Legacy provisional state is not consulted by the active runtime path.

## Composer / Takeoff / Quotation

Composer now accepts picker, drag/drop, and clipboard file/image paste for PDF/PNG/JPG/WebP, validates size/type, exposes upload/inspection state, and shows honest errors. The first attachment is uploaded as bytes through the shared intake path before the runtime turn; the existing visual family remains unchanged.

Drawing Takeoff now uses the same ingestion service and links its session to `SourceArtifact`, while retaining manual review and explicit confirmation. It remains non-visual and does not extract quantities automatically.

Quotation remains a commercial draft projection. Existing approval and finalization semantics were not changed. Confirmed Takeoff conversion remains intact. Requirement and citation provenance is available through governed component keys and source notes; no quotation redesign was introduced.

## Tests / Validation

Focused tests pass:

- PDF byte/text extraction and invalid-PDF rejection: 2 tests
- conservative BOQ candidate parsing with page citation and review-required quantities: 1 test
- multipart source-artifact tenant binding: 1 test
- Composer drop/paste/type validation: 2 tests
- Vehicle Elevator quantity/floor, correction, workspace, reconciliation, and no-invented-BOM regression: 3 tests
- Source-artifact policy, exact-byte local storage, PDF re-read/hash verification, cross-tenant rejection, and tool routing: 13 tests
- Existing ConversationRuntime, commercial handoff, StateSyncApproval, and tool-registry regressions remain green in the affected run

The broader affected validation recorded 44 files / 271 tests passed. The latest focused rerun of source-artifact, attachment, and conversation-runtime paths passed 22 files / 145 tests, including the real-byte ingestion regression. Targeted ESLint passes for the changed foundation/runtime/UI files, and `git diff --check` passes.

Full Vitest reached 334 passing files / 2,185 passing tests, 15 files failing / 4 tests failing, and 7 skipped files / 49 skipped tests. The failures are environment-related Prisma-client import failures because the generated client is absent; no foundation test failed. `npx prisma generate` loads the Prisma config with supplied local placeholder URLs but cannot download the Prisma engine because the sandbox network disconnects. `npm run typecheck` reports the same missing-generated-client cascade (169 diagnostics; no diagnostics in the changed foundation files after filtering). `npm run build` is blocked by the same absent generated client plus Google Fonts `ECONNRESET` for Cairo and IBM Plex Arabic. The existing repository also retains unrelated dirty work from before this sprint.

## Schema / Migration

Migration: `prisma/migrations/20260910150000_requirement_evidence_attachment_foundation/migration.sql`.

It is additive only: five enums, SourceArtifact, Citation, Requirement, RequirementCitation, and the nullable DrawingTakeoffSession → SourceArtifact link plus indexes and foreign keys. No reset, seed, destructive migration, Supplier, RFQ, PO, or procurement table was added. The current dirty worktree also contains pre-existing Universal Library sector edits and migrations from an earlier product slice; they were inspected and preserved, but are not part of this foundation migration or its implementation scope. Apply only through the normal deployment migration process after generated-client and database validation in the target environment.

## Remaining Gaps

1. Local filesystem storage is the current adapter; production should provide an object-storage implementation behind the same storage port.
2. XLSX/DOCX are intentionally not supported in this sprint.
3. OCR, image vision, drawing geometry, automatic quantity extraction, and full tender parsing are unavailable.
4. The composer queues one attachment per turn; a multi-artifact runtime contract is not yet needed safely.
5. Requirement review/correction UI and a first-class persisted requirement-to-quotation-line foreign key remain future bounded slices.
6. Prisma generate, database migration deployment, full typecheck, and production build need to run in an environment with the generated client and Prisma engine available.

## Exact Next Slice

Validate this additive migration and generated client in the target database, then add a small human Requirement review surface for BOQ candidates and explicit correction/confirmation persistence. Keep visual drawing intelligence, Supplier Intelligence, RFQ/PO, outbound communication, scraping, and Data Factory paused.

STOP HERE; do not start the next phase in this checkpoint.
