# Slice 1 — Field-aware conversational completion

Date: 2026-08-28. Feature branch: `feature/pre-staging-product-coherence`.
Verified starting local/remote checkpoint: `9b2b7fae9f2f37e71eaa23718ec69f55dfc55745`.
This feature checkpoint is unmerged and is not release, deployment or CEO acceptance.

## Canonical path

Voice V2 / text / chip → explicit field answer → `CompleteCommercialConversation`
→ existing `AISalesAssistantService` / extractor / SmartSystem / resolver
→ canonical proposal → existing form requirements + professional decisions
→ one active question or human-review handoff.

The API only validates transport/authentication and delegates the application use
case. Tenant identity always comes from authenticated company context. There are
no commercial/customer persistence calls in the completion loop. Catalog IDs,
tax, prices and engineering formulas are not copied from browser state as trusted
facts: existing tenant resolution and calculation run again on every turn.

## Field contract and precedence

The working draft carries typed answers, explicit nullable-field decisions,
question target, answer source, original intelligence text, full turn history,
attachment metadata and the canonical proposal. Bare project and attention
answers are assigned directly, not concatenated into extraction prose. Customer
chips carry a selected identity; it is revalidated in the existing tenant lookup.
Numeric system answers use the existing SmartSystem input path, without changing
the builder, BOM, assumptions or pricing architecture.
Template-declared inputs also support existing access-control door/direction/cable
and gypsum area questions. The adapter passes primitive answers only for names
declared by the current server template; template validation still owns bounds
and formulas. Access-direction chips use localized labels, never raw enums.

Explicit user values precede customer defaults, which precede company defaults.
Existing trusted system rules and safe derived subject/brief/scope remain in the
canonical intelligence path. The completion layer asks only after these sources
have run. Extracted/answered fields survive later provider omissions; targeted
replies retain editable non-system line intent, not authoritative financials.

The existing quotation/contract DTOs and form fields remain authoritative. The
completion policy requests project and attention decisions for those forms,
quotation validity, payment terms, and delivery/warranty terms where relevant.
Project, attention, validity, delivery and warranty can explicitly be N/A because
the underlying fields are nullable; this is a professional review decision, not
a new mandatory database column. Payment, customer, commercial lines, quantities
and material system inputs cannot be waived with an N/A action. Invoice fields
stay distinct. Existing Sales Order source and Drawing handoff rules are unchanged.
Delivery/warranty map into the existing terms field; no parallel document schema
is introduced. Quotation handoff includes expiry; contract handoff includes project
and attention. Existing human save/approval validation remains in force.

Customer payment days and company/customer currency defaults are reused. There
is no dedicated company-validity setting in this repository. Explicit labelled
validity clauses in existing company quotation terms are accepted; otherwise the
engine asks, rather than inventing a policy. Validity accepts an ISO date or a
numeric day duration (including Arabic digits), resolved in company timezone.
Invalid/ambiguous validity text remains unresolved. Explicit duration answers are
persisted as dates, avoiding re-anchoring on later turns. Company payment, delivery
and warranty clauses are used only when clearly labelled; overridden clauses are
not concatenated with conflicting policies.

## State and UI

Completion version 1 upgrades previous drafts on analysis. Readiness and the next
question are derived together from unresolved fields. Presentation projects
COMPOSING / ANALYZING / RECALCULATING / FIELD_ANSWER_PENDING / NEEDS_INFO /
DRAFT_READY_FOR_REVIEW; internal names are not displayed as UI labels.
Voice capture/transcript state does not participate in draft readiness.
`requiresHumanReview=true` and `executed=false` remain invariant.

One localized primary question is shown immediately below the compact composer;
remaining fields are collapsed. The active question remains visible while editing
or recording an answer. N/A chips are actual targeted replies and re-evaluate
immediately. Repeating Understand on unchanged text reanalyzes the request, not
the active field. Understand preserves visible text. New Request clears the
conversation and invalidates late responses. No microphone action submits a draft.

## Persistence and limitations

Persistence remains the existing browser-session draft storage, not a durable
cross-device/server conversation. Attachment metadata survives; original file
bytes must still be available for the existing drawing handoff. No migration or
new storage service was added. Free-form natural-language dates and unlabelled
company policy interpretation are deliberately not guessed. Tenant-authored
names and technical terms remain data, while controls/questions are localized.
Proposed unregistered customers retain the existing quotation review boundary;
actual document persistence still requires the existing explicit customer flow.

## Acceptance

Focused tests cover the 130-camera Arabic system scenario, ambiguous customer
selection, direct voice/text/chip project replies, attention, validity/default
precedence, explicit N/A, quantity targeting, next-question transitions,
reanalysis retention, distinct form requirements, Voice V2 separation, no automatic
execution, UI locale/compact composition, and quotation field hydration. Existing
SmartSystem, Voice V2 and Arabic customer-discovery regressions are included.

Manual CEO checks still required: real microphone/transcription; the national
customer ambiguity example against real tenant data; project → attention →
remaining terms in both locales/mobile; final populated form review; New Request;
and no document/customer creation until the existing explicit human action.

Final corrected-tree validation: 176 focused tests passed in 25 files; full suite
1,403 passed / 2 existing skips (221 files passed / 1 skipped). Typecheck,
production build (61 static pages), Prisma schema validation and diff whitespace
checks passed. Existing build lint warnings and mocked-test localization database
warnings remain. A late non-CCTV field-adapter correction required refreshing
the full/type/build checks after the first successful pass; these figures are
from the corrected implementation, not the earlier run. No schema/dependency
changes, merge or deployment. The named manual-experiment stash remains intact.

## Engineering → commercial boundary follow-up

The owner's boundary clarification exposed an existing leak: the CCTV storage
capacity requirement was being resolved/copied as a commercial line in TB. The
engineering template itself remains unchanged. A narrow application adapter now
projects its components into commercial lines before catalog resolution, while
`smartSystem.requirements` retains the original engineering quantities, units,
formulas and provenance for internal review. The assistant and quotation form
read that internal projection only in their expandable engineering details;
the quotation editor and save payload consume commercial lines only.

Storage capacity is not an HDD quantity. There is no confirmed drive-capacity,
RAID or recorder-bay decision in the current canonical inputs. Until the dedicated
commercial-BOM slice supplies those decisions, storage is a truthful provisional
custom **Surveillance storage supply package**, quantity one package, no catalog
ID, and human review required. It is not a claim of one disk or an invented 18 TB
SKU. Its price remains unresolved and is excluded from automatic budget-price
estimation; a complete total is not asserted while that price is unknown. Stale
catalog selections cannot turn the capacity requirement into an incorrectly
quantified disk. Manual SKU selection/design and pricing remain necessary in
the existing human-review form; automated disk allocation is explicitly deferred.

Cable remains the existing deterministic number of 305 m rolls, with a commercial
305 m roll label in both locales; it is not presented as estimated required meters.
No unsupported shielding specification is introduced. The 130-camera example
retains 337 TB internally and 13 rolls commercially. Re-analysis recreates the
commercial projection instead of replaying old raw requirement phrases from
conversation state. No engineering formulas, template BOM, schema, customer
creation, commercial execution, merge or deployment changes are included.

Boundary regression coverage includes both locales, provisional scope/no fabricated
IDs, no automatic storage-package pricing, unchanged engineering calculations,
stale-context re-analysis, the Voice/Text/Chip completion loop, separate internal
review, and the real quotation form's commercial-only save payload.

Boundary follow-up validation: 171 focused tests passed in 22 files; full suite
1,411 passed / 2 existing skips (222 files passed / 1 skipped). Typecheck,
production build, Prisma validation and diff checks passed. Full suite/build ran
once at final validation for this follow-up. Existing lint and mocked-localization
database warnings remain. Manual CEO acceptance should verify the storage package,
internal TB/formulas, cable rolls and repeated clarification in AR/EN, then confirm
actual drive design and pricing explicitly before using the quotation externally.
