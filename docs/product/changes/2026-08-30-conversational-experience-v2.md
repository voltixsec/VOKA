# Conversational Experience V2

Status: **implemented on `feature/pre-staging-product-coherence`; manual CEO visual/workflow acceptance remains required**

## Product behavior

The Sales Assistant now presents one calm, conversation-first workspace. Assistant turns render as readable response blocks, user turns remain compact, and the synchronized commercial summary stays visually secondary. The sticky composer keeps text, voice and attachment entry on the existing canonical conversation path; it adds an auto-growing textarea, keyboard submission, responsive controls and a single collapsed request-options disclosure.

Immediately after submission, the UI renders the pending user turn and a localized activity message. Research requests progress to a research-specific message while ordinary turns progress through information checking and response preparation. These stages are presentation state only and are never included in the API request or transactional draft.

## Governed understanding

`projectStructuredResult` is the common projection used by response grounding, system-understanding feedback, committed fact chips and the lower summary. The system-understanding projection uses trusted Smart System requirements when available and validated provisional categories otherwise. It translates only recognized human-facing component categories and does not expose provider labels, internal keys or proprietary BOM detail.

User-facing language distinguishes governed system knowledge, research-supported provisional understanding and safety-critical incomplete engineering without displaying internal enum names. FM-200 remains conceptual until enclosure dimensions, drawings and trusted engineering inputs are supplied; agent quantity, cylinders and nozzle design are never inferred.

Inline chips are limited to five summary facts whose reducer-ledger status is confirmed or verified. Legacy drafts without source-ledger provenance remain visible in the summary but are provisional and cannot produce confirmation chips.

## Provider and research boundary

The semantic decision is reused as the commercial extraction input. The former second provider call for natural response prose has been replaced with a deterministic post-commit bilingual projection, leaving one provider request for a normal semantic turn. An uncached research turn adds one research request. Instrumentation records the request-scoped call total and breakdown in development only.

Research remains bounded to one web-search tool call, four displayed sources, 1,000 output tokens and a 16-second default timeout. The existing normalized one-hour in-memory cache and retained request-scoped provisional model prevent repeated broad research for the same permitted system/jurisdiction context. Cache-hit instrumentation proves no external provider request occurs.

Provider streaming is technically available but is not implemented in this slice. The current route returns the canonical draft after validation and reducer commitment; streaming partial presentation text through that route risks confusing presentation with authority. A later isolated two-phase/SSE presentation channel may stream only after the committed state exists. Partial streamed text must never build transactional state.

## Validation evidence

- Focused Sales Assistant, canonical conversation, agentic research, OpenAI adapter, API and UI boundary: 37 files / 372 tests passed.
- Full repository attempt without database configuration: 238 files / 1,654 tests passed, 1 file skipped and 4 database-import suites blocked because `DATABASE_URL` is absent. No database connection was attempted.
- The changed V2 TypeScript boundary is clean. Repository-wide typecheck remains blocked by the pre-existing stale generated Prisma client and missing installed `exceljs` dependency.
- Production build reaches compilation and is blocked by the same missing `exceljs` module outside this slice.
- Real provider-network after-timing is unavailable because this workstation has no configured Sales AI key/model. Permanent tests prove one provider call for a normal semantic turn, two for an uncached research turn, and a deterministic natural-response projection under 20 ms in the test boundary.
- In-app browser screenshot inspection was attempted twice and is environment-blocked by the local Windows browser-runtime sandbox startup failure. Automated RTL/LTR, hydration, responsive composition, activity, reduced-motion and accessibility regressions pass; manual visual acceptance is still open.

No schema, migration, generated Prisma output, dependency, environment, production data, merge or deployment change belongs to this slice. Human approval remains mandatory.
