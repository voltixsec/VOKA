# Focused live commercial correction

Date: 2026-09-02. Status: implemented locally, awaiting CTO review and live acceptance.

## Scope and policy authority

This implements the owner's **Focused Live Correction Pass** on the existing dirty
`feature/pre-staging-product-coherence` worktree, at HEAD
`a9fc82aa7869b0094b980f523e437df7983b8add`. The preceding
[governed-commercial coherence WIP](2026-09-02-governed-commercial-coherence-resume.md)
is preserved. This is not a roadmap reorder, release, or architectural redesign.

The current request supersedes the earlier permission to create a Draft without a
customer: **a customer name is required before creating a new Draft**. An existing
customer or proposed name is sufficient; product selection, generic identity,
market pricing and selling price are not Draft blockers. Approval/final-issue
requirements remain separate. Existing idempotent quotations remain reusable.

## Root causes and corrections

Code inspection and offline regressions identified these failure paths; they are
not represented as a captured trace of the owner's live provider response:

- Numeric options could select one product in every component group; an optional
  numeric prefix could interpret a measurement as a choice. Ambiguous positional
  choices now ask for the intended component and cannot fan out, even if a provider
  approval patch guesses a target.
- Semantic approval patches took precedence over explicitly named candidates.
  Exact named candidates now win. Selected candidates must belong to a current
  governed line; duplicate cross-component candidate IDs and multiple choices for
  the same component are rejected.
- Structural replacement could reuse another live line's ID/component key and
  then silently deduplicate it. Replacement now rejects those collisions.
- Selected-name fallbacks appended the old commercial name. They now replace
  the identity cleanly, preserving component ID, quantity and specifications.
  Brand/model projection deduplicates each part independently. An inconsistent
  selected-product component fact cannot project onto another component.

Canonical selection facts remain the authority for Workspace and quotation
projection; no parallel selection state or research architecture was introduced.

## Readiness, scope and terms

- Deterministic graph readiness, hydrated page readiness, signed handoff preparation
  and the quotation-creation use case enforce the customer requirement. New Drafts
  are not gated by pending products/prices. The UI labels pending commercial work
  as non-blocking and provides localized customer guidance.
- Existing Arabic/English explicit scope recognition remains in use. Continuation
  can recover an uncommitted explicit scope from prior user messages. Weaker AI
  inference cannot override explicit scope. Known-scope/source questions are
  suppressed at the governed response boundary; the provider prompt also states
  the same policy.
- Existing scope-change defaults and creation-time Company Settings lookup remain
  authoritative. Quotation legal text comes from the current scope template, not
  stale workspace/chat terms or rewritten model prose. No database/settings change
  was needed. Proposed customer handling continues without creating customer records.

## Verification

- **451 tests passed across 65 files**: runtime, selection, gypsum, preserved CCTV,
  Workspace/readiness, handoff routes, quotations/domain, research adapters,
  serialization and persistence mapping.
- New 14-case focused suite includes exact gypsum selection, wrong semantic target,
  numeric ambiguity, structural collisions, readiness and bilingual scope.
- The shared gypsum fixture runs the real ConversationRuntime/reducers with offline
  provider observations. Sheetrock Standard 12.5mm updates only GYPSUM_BOARDS;
  Sheetrock All Purpose Joint Compound updates only JOINT_COMPOUND. The actual
  handoff handler, quotation adapter, domain and serialization preserve separate
  rows, names, quantities/specifications and null selling prices.
- Repository-wide TypeScript checking, scoped ESLint for all changed/new TypeScript
  files, and `git diff --check` passed. Git emitted only line-ending conversion warnings.

## Files touched by this correction

Implementation:

- `src/application/conversation-runtime/product-selection.ts`
- `src/application/conversation-runtime/solution-graph.ts`
- `src/application/conversation-runtime/commercial-projection.ts`
- `src/application/conversation-runtime/governed-workspace.ts`
- `src/application/conversation-runtime/ConversationRuntime.ts`
- `src/application/conversation-runtime/quotation-handoff.ts`
- `src/infrastructure/ai/openai/OpenAIConversationBrain.ts`
- `app/api/ai/conversation-runtime/prepare-handoff/route.ts`
- `app/dashboard/sales-assistant/page.tsx`
- `components/sales-assistant/SolutionWorkspace.tsx`

Regression coverage:

- Runtime `FocusedLiveCorrection.test.ts` and `fixtures/gypsum.ts` (new).
- Runtime `CommercialHandoffQuotation.test.ts`, `CommercialRoutingCoherence.test.ts`,
  `GovernedFlexibleStrictBrain.test.ts`, `EngineeringToCommercialResolution.test.ts`.
- `app/api/ai/conversation-runtime/prepare-handoff/__tests__/route.test.ts`.
- `components/sales-assistant/__tests__/ConversationPresentation.test.tsx`.

Other dirty files belong to the preceding WIP and were not discarded.

## Review boundary

No schema migration, database mutation, paid provider call, model/API configuration
change, dependency change, commit, push, merge or deployment. Live interpretation,
real customer resolution and actual persisted quotation refresh still require CTO
acceptance. Build and repository-wide full tests were not requested for this small
pass; the test count above is the expanded focused validation set, not the full suite.
The working tree is intentionally left available for review; the task/session is
not declared closed.
