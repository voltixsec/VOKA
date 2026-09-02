# Quotation Draft-only correction

Date: 2026-09-02. Status: local implementation available for CTO review; live acceptance pending.

## Boundary

Owner-approved correction limited to the quotation Draft/edit experience and immediate
handoff/localization mapping. Branch remains `feature/pre-staging-product-coherence`;
HEAD remains `a9fc82aa7869b0094b980f523e437df7983b8add`. The preceding dirty
[commercial correction](2026-09-02-focused-live-commercial-correction.md) is preserved.
No Sales Assistant or Workspace behavior was changed in this pass.

## Findings and changes

### Arabic labels and units

Six Draft labels used `العرص` instead of `العرض`; all six are corrected without
changing terminology/layout. The editor now reuses `commercialUnitLabel` for Arabic
display: Sheet → لوح, LM → متر طولي, Pcs → قطعة, Pair → زوج, KG → كجم, m² → م².
English retains the stored English unit. Display conversion never replaces the value
in editor state or its save payload.

Quotation serialization previously selected a localized unit into `unitName`, or
returned null for an incomplete field in a completed localization snapshot. Draft
responses now return the canonical stored unit in `unitName`, retaining the separate
localized fields. Issued-document serialization behavior is unchanged.

### Commercial identity

The handoff adapter previously trusted its flattened commercial-lines copy, even
when its governed Workspace/selection facts were newer. It now projects the current
governed commercial lines, reapplies existing approved selection facts by stable
component identity, and uses the existing commercial projector. An authoritative
empty BOM cannot resurrect stale flattened lines. Legacy handoffs without a Workspace
retain their existing flat-line path.

The regression deliberately supplies a malformed generic flattened name and newer
USG Knauf Sheetrock Standard 12.5mm selection facts. Arabic descriptive names are
preserved when supplied; brand/model spelling is retained, not semantically translated.
Board and compound remain separate, with original quantities, units, specifications,
lineage, and null pending prices. No additional translation or guessed identity is
introduced. Already-persisted malformed records are not bulk-repaired by this pass.

### Terms authority

The editor loaded saved quotation terms and never refreshed the current scope's
Company Settings template. Creation also parsed/normalized legal text alongside
commercial defaults and supplied only one language to quotation localization.

- Draft editing/reload fetches current company templates with `cache: no-store`,
  selects the exact scope, and replaces rather than merges terms on scope change.
- Asynchronous results from superseded scope requests are ignored.
- Scoped legal text is read-only in this editor. Both configured languages are
  carried on save. Failed template loading clears stale display and provides retry;
  saving waits for successful template loading. An absent exact-scope/language
  template stays empty, never falls back to a different scope or old legal text.
- Handoff defaults preserve the actual configured legal strings, including internal
  whitespace, separately from parsed commercial fields. Both configured languages
  reach the Draft DTO unchanged.
- Scoped terms are excluded from AI quotation translation. Scope is passed through
  existing creation/update/repair/job snapshots, and editing one configured language
  no longer invalidates the other supplied company-template language. Other
  quotation-field translation behavior is retained.

No database template, query tenancy boundary, model configuration, or legal text was
changed by the agent.

### Notes

Unclassified `commercial.notes` no longer flows into Draft Notes. Governed site
requirements, responsibilities, exclusions, and project notes retain their existing
typed projection. Research observations and exploratory conversation do not fill an
empty Notes field. Empty governed project conditions yield empty Notes.

## Verification

- Final expanded offline run: **435 tests passed across 57 files**.
- Includes handoff, serialization/API, Draft editor, commercial runtime, quotation
  application/domain/localization, and exact-tenant/scope template source tests.
- Repository-wide `tsc --noEmit --pretty false`: passed.
- ESLint for all changed/new TypeScript files: passed; final touched files rechecked.
- `git diff --check`: checked at final handoff.
- One existing suite, `MultilingualQuotationPersistenceProof.test.ts`, failed during
  import because `DATABASE_URL` is not configured. It was excluded from the successful
  offline run. Its assertions were not modified, no database was configured, and
  the other quotation localization tests passed.

New tests cover Arabic/English units and unchanged save values; selected identity;
separate gypsum/compound rows; pending prices; current scope templates; scope change;
settings failure/retry; missing exact template; legal-language independence; no AI
legal generation; empty/exploratory/governed Notes; and unchanged customer, project,
attention, scope and quotation numbering.

## Files changed in this pass

Implementation:

- `app/dashboard/quotations/[quotationId]/edit/page.tsx`
- `app/api/quotations/serialize-quotation.ts`
- `src/application/conversation-runtime/quotation-handoff.ts`
- `src/infrastructure/ai/PrismaCommercialHandoffQuotationPort.ts`
- `src/application/quotation/services/QuotationLocalizationAnalyzer.ts`
- `src/application/quotation/services/QuotationLocalizationRepairService.ts`
- `src/application/quotation/services/invalidateQuotationTargetFields.ts`
- `src/application/quotation/use-cases/CreateQuotationUseCase.ts`
- `src/application/quotation/use-cases/UpdateQuotationUseCase.ts`
- `src/infrastructure/translation/quotation/QuotationLocalizationJobRunner.ts`

Tests:

- `app/dashboard/quotations/[quotationId]/edit/__tests__/page.test.tsx`
- `src/application/conversation-runtime/__tests__/QuotationDraftCorrection.test.ts` (new)
- `src/infrastructure/ai/__tests__/QuotationDraftScopeTerms.test.ts` (new)

Documentation: this report and the resume-point link. All other existing dirty files
are preserved from previous passes.

## Remaining acceptance

Live company-template contents, real database persistence/reload and the owner's
screenshots have not been exercised against a live session in this task. The existing
multilingual-suite import issue remains a validation limitation. Build and full
repository-wide tests were not requested; the count above is the expanded focused run.

No schema migration, DB mutation, commit, push, deployment, unrelated page redesign,
or destructive Git operation. The working tree is intentionally available for CTO
review; no session closure is asserted.
