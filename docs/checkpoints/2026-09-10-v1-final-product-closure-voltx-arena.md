# VOKA V1 Final Product Closure — Voltx Arena

Date: 2026-09-10 (UTC)

## Execution identity

- Execution branch: `arena/01a08c94-voka` (Arena session branch; the requested alternate branch name was not used because the execution environment fixes this session to its tracked branch)
- Base commit: `f31b12fbb11339aa65698044c03e76189434f7fe`
- Implementation commit: `bb7cf6619c8fd0c338fce970eb4add7378a2d2cf`
- Final checkpoint commit: the final branch HEAD containing this checkpoint and the resume pointer; recorded in the session close response

## Major findings

1. The governed Sales Assistant and quotation handoff still treated customer identity as a draft-opening blocker, despite the intended V1 behavior that a quotation DRAFT can be opened before customer and attention are known. The domain already supported nullable customer snapshots, but the readiness projection, handoff route, service, and direct quotation API were inconsistent.
2. Candidate fact governance had pending and committed paths, but explicit rejection was not represented and researched candidate facts could not be promoted by explicit approval. This made the visible conversation state less truthful and allowed stale pending proposals to remain unresolved.
3. Drawing Takeoff had confirmed quantities and a quotation link field but no safe confirmed-takeoff → quotation draft path. The takeoff UI also sent only the currently displayed line during save, which could discard other reviewed lines.
4. The quotation line combobox declared `role="combobox"` without a controlled listbox relationship, creating an accessibility warning and incomplete keyboard/screen-reader semantics.

## Implemented changes

### Sales Assistant and governed workspace

- Customer and attention are now non-blocking for quotation draft readiness. Final quotation validation still requires customer identity, resolved quantity, pricing, and product readiness before send/approval.
- Signed handoff preparation no longer rejects a customer-free quotation draft.
- Commercial handoff creation now creates a customer-free DRAFT and preserves best-effort customer resolution when a name was mentioned.
- Explicit rejection of the latest pending candidate proposal group is recorded as `REJECTED` with `USER_REJECTED`; older confirmed facts are not erased.
- `RESEARCHED` candidate facts can now be promoted only through an explicit approval utterance, matching the existing AI-inferred approval policy.
- Governed notes and company scope terms continue to flow from the workspace/default profile into the quotation handoff.

### Quotation

- Direct quotation POST accepts `customerId: null` and `customer: null` for a real reviewable DRAFT while retaining tenant-safe customer validation when a customer is selected.
- New quotation composer no longer disables draft creation solely because no customer is selected and labels customer as optional for a draft.
- Existing drafts can explicitly clear their customer association while remaining DRAFT; finalization remains guarded by `QuotationFinalizationValidator`.
- Quotation line combobox now exposes `aria-controls`, `aria-expanded`, `aria-haspopup`, a listbox, option roles, selection state, and active descendant semantics.

### Drawing Takeoff → Quotation

- Added tenant-scoped `POST /api/drawing-takeoffs/[sessionId]/quotation`.
- Only `CONFIRMED` sessions whose lines are explicitly confirmed and have quantities can convert.
- The route creates a reviewable DRAFT with a hidden family idempotency key, links the takeoff session to the quotation, preserves source filename/provenance in notes and line metadata, and leaves all prices explicitly `null` / `PENDING`.
- Customer is optional at conversion; an optional customer id is resolved through the active company before persistence.
- Company terms and currency are loaded through the existing scoped settings path.
- The takeoff UI can open the quotation draft and now preserves all session lines when editing one line; line selection allows a reviewer to work through multi-line sessions without silently deleting the other lines.

## Testing

Focused affected suites passed after the final UI/readiness expectation updates:

- 9 affected files passed; 81 tests passed (Sales Assistant presentation, quotation composer, quotation API, handoff, runtime routing/correction/approval, and Takeoff → quotation).
- The earlier broader affected run also passed 27 files / 194 tests, with 47 existing skipped tests; the final focused run rechecked the files changed after that run.
- Quotation combobox accessibility suite: 1 passed.
- Takeoff → quotation route suite: 2 passed.

`git diff --check`: PASS.

Full `npm test` was also attempted. It reached 325 passed files / 2,165 passed tests, 7 skipped files / 49 skipped tests. The remaining 15 failed files are existing Prisma-generated-client import failures in UCL, invoice, sales-order, and commercial-retrieval suites; the four failed test cases are the same missing `lib/generated/prisma/client` boundary. The stale customer-required presentation expectation was corrected and passed in the final focused run.

## Typecheck/build environment

- `npm ci --ignore-scripts`: PASS.
- `npx prisma generate`: environment blocked. Prisma config requires `DATABASE_URL` and `SHADOW_DATABASE_URL`; with safe placeholder values the Prisma engine download was blocked by the sandbox TLS/network path.
- `npm run typecheck`: environment blocked by the absent generated Prisma client (`lib/generated/prisma/client`) and the resulting baseline implicit-any cascade. No typecheck error was reported from the changed application/UI files after the focused code pass.
- `npm run build`: environment blocked by the absent generated Prisma client and sandbox TLS failures fetching Cairo / IBM Plex Sans Arabic from Google Fonts. HOME certification remains authoritative for the pre-existing baseline.
- `npm run lint`: existing baseline failure in `app/dashboard/products/__tests__/page-localization.test.tsx` (`@typescript-eslint/no-throw-literal` is not defined by the installed plugin), plus pre-existing hook-dependency warnings. No new lint warning was emitted for the changed implementation paths.

## Schema/data governance

- Database data: UNTOUCHED.
- Database schema: UNCHANGED; no migration added.
- Data Factory/UCL production generation: UNTOUCHED; Data Factory remains PAUSED.

## Product status at checkpoint

- Sales Assistant: FIXED for draft handoff truthfulness, candidate approval/rejection, and governed commercial transfer.
- Quotation: FIXED for customer-optional DRAFT workflow and combobox accessibility; finalization gates remain intentionally strict.
- Commercial flow: PARTIAL/FIXED. Sales Assistant → Quotation and Takeoff → Quotation are improved; existing quotation-derived Sales Order → Invoice → Payment surfaces were not rewritten.
- Drawing → Quotation: IMPLEMENTED for confirmed manual/reviewed takeoff lines; no OCR/vision infrastructure was added.
- Sales Order: PASS for the current V1 quotation-derived scope; independent order creation remains deferred because it is not required to close this bounded sprint.
- Customers: PASS; customer selection/binding remains available in the quotation editor.
- Catalog/UCL: PASS for this slice; no production UCL content was fabricated.
- Accessibility: FIXED for the identified quotation combobox warning.
- AR/EN: FIXED in changed surfaces; draft labels, statuses, source notes, and readiness language remain localized without exposing raw internal IDs to users.

## Remaining true V1 blockers

1. Full live acceptance still requires the HOME-certified database/Prisma environment and real company settings/customer/catalog data; this sandbox cannot reproduce those credentials or download the Prisma engine.
2. Drawing extraction remains intentionally review/manual because no extraction provider was present; confirmed takeoff handoff is safe, but automated OCR is not part of this closure.
3. A customer-free draft opens in the quotation editor by design; the user must bind a customer before approval/send. That is an explicit readiness gate, not an incomplete handoff.

## Next recommended slice

Run a live HOME acceptance pass for the newly connected confirmed-takeoff → quotation journey, including customer binding, scoped terms, price completion, quotation approval, Sales Order conversion, invoice source selection, and payment recording. Do not restart Data Factory or add schema work unless live evidence identifies a concrete blocker.
