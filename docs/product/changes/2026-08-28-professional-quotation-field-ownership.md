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
