# Slice 2 — Professional quotation field ownership

Owner-authorized, unmerged feature work on `feature/pre-staging-product-coherence`,
starting from clean local/remote `71ca822df016ad5e32701cecf6612793fa68700f`.
This builds on [field-aware completion and the commercial boundary](2026-08-28-field-aware-conversational-completion.md).

## Contract

The existing Sales Assistant / Smart System / tenant resolver remains canonical.
Customer identity (matched ID, ambiguous candidates or proposed clean name) is
retained across targeted clarification and re-resolved within the tenant. Explicit
labelled corrections target their own field, even while another question is active.
Bare replies still answer that question. No automatic customer/document creation.

The shared customer picker now renders the current canonical selection, including
an ID/name received after mount. Local search text no longer hides an AI handoff.
Arabic definite company names such as `الشركة الوطنية` are supported by the
existing conservative fallback; structured extraction remains primary.

Validity recognizes Arabic/Persian digits, `خمستاشر يوم`, `خمسة عشر يوم`,
`أسبوعين` and `شهر`. The last means one calendar month, clamped at month end,
not an invented fixed 30 days. Ambiguous alternatives/approximation stay unresolved.
The canonical expiry is an ISO calendar date. A known validity base/issue date
anchors calculation; otherwise the initial company-local analysis date is retained
through subsequent turns. This does not change the quotation issue-date schema.

Customer, project, attention and validity are not destinations for generated prose.
Professional subject/brief are projected from canonical sellable lines and structured
scope/system identity, never the transcript, customer name or provider's free-text
brief. CCTV camera count comes from the offered camera line. No new engineering,
commissioning, warranty or legal promise is inferred beyond the offered scope.

Notes default blank. Explicit labelled user notes are carried separately, including
follow-up notes. Terms use the existing approved company template, trusted customer
payment default and explicit user commercial clauses/field answers. Provider-only
terms without user evidence are discarded. Validity is included as its canonical
date; explicit overrides replace the corresponding default clause.

Known commercial labels/phrases are localized. Untranslated cross-locale prose is
withheld with an internal review warning; unresolved important fields still ask.
This bounded policy is not a general legal-text translation engine. Notes/Terms
are never fallback sinks for AI prose. Engineering formulas, assumptions, catalog
diagnostics, confidence and estimate notices remain in internal review UI.

Quotation handoff no longer appends the estimate notice to Notes. It preserves the
canonical terms (including intentional blank terms) rather than reapplying defaults
behind the user's back. Unknown AI prices remain null/blank; unresolved row/aggregate
totals are not shown as free, and saving is blocked until a human supplies a price.
An explicitly entered zero remains distinct from an unknown price. The save payload
still contains commercial rows only, without engineering requirements/provenance.

SmartSystem formulas, BOM conversion, catalog/pricing architecture, Voice V2,
drawing, schema, dependencies, main and deployment are unchanged. The preserved
manual-experiment stash is not imported or removed.

## Acceptance

Focused regression coverage includes numeric/written validity, calendar edge cases,
ambiguous validity, resolved/proposed/ambiguous customer carry across four turns,
real quotation-form hydration, correct project/attention/expiry mapping, AR/EN
professional text, trusted defaults, explicit Notes, no provider-invented terms,
internal-only notices/formulas, unknown-price save blocking and explicit zero.

Manual CEO checks remain necessary: repeat the 123-camera conversation using voice
and text, verify customer/project/contact/date in the form, inspect professional
AR/EN title/brief and approved terms, enter reviewed prices, then inspect the saved
quotation/PDF for no internal banner or engineering diagnostics. Real microphone,
provider and tenant-data acceptance is not established by mocked automated tests.

Validation (2026-08-28): 195 focused tests passed in 25 files. The full suite passed
1,442 tests with two existing skips (223 files passed / one skipped). Typecheck,
production build, Prisma schema validation and `git diff --check` passed. Full
suite, standalone typecheck and production build each ran once at final validation.
Existing build lint warnings and caught localization database warnings remain;
the full suite used a non-production dummy database URL. No schema/dependency or
generated-client changes were needed. The manual acceptance checks above remain
pending; automated results are not a release/deployment approval.

## Slice 2.1 — Professional quotation UX cleanup

Starts from clean local/remote `70d813cef0272b06bb1edaa783038ad6182b5d48` on the
same feature branch. No Commercial Brain, SmartSystemBuilder, pricing, drawing,
schema, merge or deployment change.

- **Default terms:** the explicit replacement action refreshes the existing
  authenticated company-template endpoint and replaces the whole textarea with
  the exact selected scope/locale template. It does not merge, translate or invent
  clauses. It marks the form dirty and prevents submission during loading. Missing
  defaults/network failures keep the current text with a localized message. Late
  responses for another scope/locale are ignored. The button is no longer nested
  inside the textarea's label; each control has its own accessible name.
- **Attention:** a bounded application normalizer removes only leading greetings,
  conversational addressing and attention wrappers; clean names/titles stay intact.
  Canonical attention and persisted targeted answers carry the cleaned value.
  Framing without a name remains incomplete. Original conversation text is retained.
- **Terms formatting:** stored/approved text remains unchanged. Separate, clearly
  labelled clauses get numbered presentation in the composer preview, quotation
  detail and PDF. Existing numbering, bullets, continuation text and free-form legal
  paragraphs keep their exact text and whitespace. No automatic sentence splitting
  or clause renumbering. PDF terms height can grow within the existing cover's safe
  space; this is not an unlimited legal-appendix/pagination redesign.
- **Units:** the existing review labels now have one shared display helper used by
  the composer, internal engineering review and PDF. Unit/Package/Roll/Set/Point
  display as وحدة/حزمة/بكرة/طقم/نقطة in Arabic. English and technical tokens remain
  intact. Legacy PCS placeholders no longer hide actual catalog unit labels.
  Display does not rewrite canonical unit codes in the save payload.

Regression coverage includes exact custom/empty-term replacement, fresh templates,
scope switching, failed/missing defaults, clean attention across the 180-camera
conversation, unchanged legal text, AR/EN units and unchanged submitted codes.
The PDF skill's visual workflow was used to inspect all four pages of generated
AR/EN 180-camera samples: five complete numbered clauses, clean attention, localized
units, no clipping/overlap in those fixtures, and no internal engineering notice in
customer-facing fields. Scratch artifacts are not part of the feature commit.

Manual CEO retest remains: repeat the real 180-camera voice/text flow, check customer,
project, clean attention, validity, subject/brief and blank-or-explicit Notes; replace
terms after changing scope, verify exact approved wording, Arabic units and unknown
price blocking; review the actual tenant PDF, especially long approved templates.
Unrecognized conversational wrappers still need human review. Safe formatting does
not reinterpret unstructured legal text, and existing fixed-page limits remain.

Slice 2.1 final validation (2026-08-28): 273 focused tests passed in 31 files.
The single full-suite run recorded 1,481 passed, two existing skips and one 5-second
timeout in the unchanged quotation API test `updates a draft quotation inside the
active company`. Its entire file then passed 10/10 in an isolated rerun without
code changes or timeout relaxation. The full run is not claimed as wholly green;
it was not repeated, following the owner's one-full-suite limit. Standalone
typecheck, production build, Prisma validation and diff checks passed. Existing
build lint warnings and caught localization database warnings remain. The full
suite and targeted API rerun used a dummy non-production database URL. No schema,
dependency or generated-client changes were needed. Live CEO acceptance remains
pending; this checkpoint is not a release/deployment approval.

## Slice 2.2 — Payment percentages and validity

Narrow owner-authorized correction from feature HEAD
`840668bfaa9444dcde07835dbe36247e78366c3e` (after Slice 3).

- Actual user payment wording takes precedence over abbreviated/paraphrased
  provider extraction. A deterministic application formatter preserves numeric
  percentages and stage order: `70% دفعة مقدمة، و30% عند التسليم` / `70% advance,
  30% upon delivery`. Arabic/Persian digits and percent glyphs normalize to numeric
  percentages; no amount or missing stage is invented.
- Complete two-/three-stage schedules and explicit 100% advance resolve directly.
  Invalid totals, missing milestones and malformed splits carry an internal
  `paymentTermsReview` diagnostic, remain in the payment clarification field and
  cannot make the draft ready. Supplied amounts stay unchanged. An explicitly
  supplied “balance” remains balance wording, never a guessed numeric percentage.
- Only known milestone phrases are translated. Additional same-language
  qualifications are preserved; unknown cross-language contractual wording needs
  clarification. No percentage is added to cash/non-percentage terms.
- This validation concerns explicit user payment schedules; approved company/
  customer defaults and the exact default-Terms replacement flow are unchanged.
  An invalid explicit answer never silently falls back to those defaults.
- `أسبوع من تاريخ العرض` / `أسبوع` resolve to seven days; two weeks, 15 days,
  Egyptian `خمستاشر يوم` and `ثلاثين يوم` resolve directly. The existing precise
  calendar-month policy is retained and extended to `شهرين` (two calendar months),
  with end-of-month clamping. Unknown anchors/ambiguous durations remain pending.
- Existing field targeting writes these answers into canonical payment/expiry;
  a resolved expiry is persisted as an absolute date against the known issue/base
  date. Later replies do not re-ask or shift it. The actual AR/EN quotation composer
  receives those canonical values without any form implementation change.

SmartSystemBuilder, Engineering → Commercial BOM, pricing and drawing are unchanged.
Regression coverage retains customer/project/attention, professional Subject/Brief,
clean Notes, trusted Terms, unknown-price save blocking and human review. No schema,
dependency, main, merge or deployment changes.

Manual CEO retest:

1. Answer active validity with `أسبوع من تاريخ العرض`; check expiry = issue date +
   seven days and that validity is not asked again. Repeat with two weeks, 15 days
   and one/two calendar months.
2. Answer payment with 70/30, 50/50 and 30/40/30 milestone schedules in AR and EN;
   confirm numeric percentages, concise wording and the next real missing field.
3. Supply 70/20 or an incomplete stage; confirm review/clarification without any
   silent adjustment. Correct the schedule and verify the review diagnostic clears.
4. Open the quotation for human review; verify exact payment/expiry carryover,
   unchanged customer/BOM/Notes/default-Terms replacement and unknown-price blocking.

Slice 2.2 validation: 305 focused tests passed across 29 files, including the
existing Slice 1/2/3 regressions. Standalone typecheck passed; an earlier result
handle expired during a status interruption, so typecheck was rerun for a
confirmed exit result. Prisma schema validation and `git diff --check` passed.
The single full-suite run passed: 1,556 tests, two existing skips (230 passed files,
one skipped). Known caught best-effort localization/database warnings remain.
The single production build passed, including its type/lint checks; only existing
hook-dependency and combobox ARIA warnings remain. No production code changed
after these gates. Live CEO/browser acceptance remains pending.
