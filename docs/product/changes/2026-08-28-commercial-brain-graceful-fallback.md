# Commercial Brain and graceful fallback

Approved product direction: the catalog is a trusted source, not a prerequisite
for a reviewable commercial draft. This extends the
[universal entry architecture](2026-08-27-universal-commercial-intelligence-entry.md)
without changing the product roadmap or quotation revision rules.

## One intelligence pipeline

Editable voice/text context and explicit field replies enter the existing
AISalesAssistantService. Its existing provider port now supports OpenAI Responses
structured understanding. Provider output passes strict JSON schema generation
and application validation. No document-write or catalog-write tools are exposed.
The extractor fuses that understanding with server-owned Smart System rules;
the resolver then applies tenant customer/catalog/pricing data. The conversational
engine evaluates missing fields against the canonical proposal, not generic lines.

OpenAI configuration: `VOKA_AI_PROVIDER=openai`, `VOKA_SALES_AI_MODEL`,
`OPENAI_API_KEY`, optional `OPENAI_BASE_URL`. No model or credential is embedded.
Responses use `store: false`, a bounded timeout, and strict structured outputs.
Unavailable/refused/invalid responses fall back to deterministic/heuristic
understanding. Legacy Ollama configuration remains supported.
See [official structured-output guidance](https://developers.openai.com/api/docs/guides/structured-outputs).

## Facts and engineering

Evidence-backed facts accompany the proposal. Explicit camera counts survive
catalog absence. CCTV template 1.2 supports 1–1024 cameras using multiple NVRs
when needed; existing storage, PoE and cable formulas remain authoritative.
86 cameras require two 64-channel recorder capacity allowances, not a new request
for camera count. Factory, area and requested coverage remain contextual facts.
Coverage is a request, never a guarantee inferred from area/camera count.

Default storage/bitrate/cable assumptions and calculated quantities are preliminary.
Site topology, bandwidth, disk bays, PoE budgets, cabinet sizing and actual coverage
need engineering review. Invalid material inputs remain questions. Unsupported or
safety-sensitive systems must not be presented as certified designs; this slice
does not introduce new engineering templates or fabricate jurisdiction/code facts.

## Resolution and estimates

Clear tenant catalog matches win; ambiguous matches require an explicit choice.
Unmatched items become custom lines with null catalog IDs and review flags.
They are not saved to catalog master data. A future explicit promotion command
must revalidate tenant membership, search duplicates, show likely matches, and
require confirmation; no automatic promotion is implemented here.

Pricing order implemented: existing customer/company price-list resolver, tenant
catalog price, then optional unverified AI budget estimate. Catalog prices are
not reused under a different currency; there is no implicit FX. History, supplier
and live regional web-pricing integrations are not implemented. AI estimation is
only requested for unresolved, non-ambiguous lines with known geography, in the
draft currency. It cannot overwrite internal prices. Null/invalid estimates stay
unpriced; they are never asserted to be verified prices. No fake web references.

Provenance distinguishes user input, company/customer defaults, catalog matches,
rule calculations, AI estimates and unresolved confirmation. AI prices carry
region, LOW confidence, an explicit non-live reference and `verified: false`.
An unavailable price is visibly unresolved and requires human pricing in the form.

## Professional completion and clarification

Subject/brief are generated from the understood request/lines; scope is derived
when known. Currency uses explicit instruction, then customer preference, then
company default. Payment terms use explicit instruction, customer terms, or the
existing scope-specific company template; potentially conflicting policies are
not concatenated. Attention and notes remain optional.

Required inputs include customer, usable lines, unknown line quantities, ambiguous
catalog choices and missing material system inputs. Optional terms/scope fields
do not block a reviewable draft. Prices may remain unresolved for human review;
this is not approval readiness. Sales Order and Drawing keep their existing
source-document/attachment review boundaries.

Missing-field buttons target supported answers directly. Customer/catalog choices
carry canonical IDs and are revalidated against tenant search results on every
analysis. Camera/storage/bitrate/cable answers enter deterministic parameters
directly; they are not merely appended text. Voice, text and chip replies preserve
the same working context. The textarea remains editable and Understand is explicit.

`TRANSCRIPT_READY` is blue informational text, not commercial readiness.
`NEEDS_CLARIFICATION` and `READY_FOR_REVIEW` are mutually exclusive server results.
New Request invalidates in-flight analysis and transcription and clears persisted
context. No automatic save, approval, send, customer creation or catalog creation.

## Permanent review notice

Arabic: تنبيه: الأسعار والتقديرات والحسابات الهندسية المعروضة تقريبية ما لم يتم تحديدها كمعلومات مؤكدة من بيانات الشركة أو مصدر موثوق. يلزم مراجعتها قبل الاعتماد.

English: Prices, estimates, and engineering calculations are approximate unless
marked as verified company data or a trusted source. Review is required before approval.

The notice appears in the assistant and quotation review form and is copied into
quotation notes for the existing human save flow. Per-line sources remain visible
in the assistant; no schema migration or quotation snapshot mutation is introduced.

## Acceptance

Automated regressions cover the 86-camera factory case, empty catalog custom lines,
deterministic priority, estimates, tenant-safe selections, defaults, provider failure,
Responses format, existing Voice V2 and late-result cancellation. CEO manual checks:
Arabic factory request with unknown/known customer; empty and populated catalogs;
ambiguous customer/catalog choices; voice pause/stop/edit; New Request during analysis
and transcription; visible estimate notice and editable canonical quotation handoff.

Limitations: live OpenAI account/model access and microphone behavior require manual
validation. No live market search, supplier/history pricing, permanent catalog learning
UI, or certified engineering expansion is included. The experiment stash remains intact.

Validation: 101 focused tests passed; full suite 1,318 passed / 2 skipped;
TypeScript, Prisma validation, production build and `git diff --check` passed.
Build lint warnings remain, including a quotation-handoff locale-effect dependency.

## Manual acceptance correction

Customer extraction now constrains `customerMention` to the named entity, including
a legal prefix such as `شركة`. The acceptance request
`عايز أعمل عرض سعر توريد وتركيب 36 كاميرا مراقبة شركة الأفق`
must search for `شركة الأفق`, not the commercial sentence. A sentence-shaped
provider result triggers one focused entity-only Responses correction through the
same provider port. A conservative fallback is used only if that result is unusable.
The resolver rejects request-shaped mentions and resolves a single tenant match;
multiple candidates retain explicit selection, and no customer is auto-created.
Generic conversational fields cannot resurrect a rejected customer mention.
This follows the official guidance on [handling structured-output mistakes](https://developers.openai.com/api/docs/guides/structured-outputs#handling-mistakes).

Both the assistant and quotation review expose the original server-provided
engineering quantities, units, formulas and assumptions in collapsed details.
Storage is capacity in TB, not a manufactured disk count; PoE formulas state the
two reserved uplink ports. The single-cabinet allowance is explicitly estimated,
with size/layout confirmation outstanding. If commercial and calculation units
differ, the UI flags that difference instead of inventing a conversion. Missing
legacy explanations are labeled as unavailable. No quantities, pricing, Voice V2,
Drawing behavior, quotation revision rules, or estimate-notice copy changed.

Acceptance-fix validation: 102 focused tests passed; full suite 1,329 passed /
2 skipped. Typecheck, production build, Prisma validation and whitespace checks
passed. Existing lint warnings remain. Live CEO retesting is still required.

## Compact composer and locale-pure presentation

The commercial assistant now renders controls, editable textarea and the current
result in that DOM order inside one composition with an 8px gap. The extra
controls card and its padding are removed; mobile selectors have stable half-row
widths, labels above the fields and 44px touch targets. The header is shorter.
The unused legacy proposal panel is removed; the canonical conversational result
remains the only review surface.

Document/build options, system status, transcription state, errors, sample
prompts and suggestion/customer-chip replies use the active Arabic/English
locale. Internal enums remain unchanged. Transcript readiness is presented as
“النص جاهز للفهم” / “Transcript ready”, separate from
“المسودة جاهزة للمراجعة” / “Draft ready for review”.
User-entered text, customer identities and technical tokens are not rewritten.
Existing Create/Create-and-edit form controls already select localized labels.

Existing deterministic templates carry an Arabic explanation alongside the
original English explanation, using the same numerical evidence. Both names and
explanations survive extraction/resolution; the UI selects the requested locale.
Legacy explanations unavailable in that locale receive an explicit localized
notice, never an invented translation. Quantities, formulas, pricing, readiness,
tenant resolution and the permanent estimate notice are unchanged.

Regression coverage includes both locales across all voice states, accessible
labels/options/placeholders, errors, samples, chips, required/optional fields,
expanded engineering details, numerical explanation parity and responsive
composition guards. An isolated visual fixture at
`scripts/qa/commercial-assistant-preview` renders the real component with static
responses and no database/AI/authentication access. Browser checks verified 8px
control/input/result gaps and no horizontal overflow at desktop and narrow mobile
widths in both directions. The fixture does not mount Next.js font loading;
production Cairo loading and live microphone/customer scenarios remain manual
CEO checks. No schema migration, provider, deployment or merge is included.

Final validation: 115 focused tests passed; full suite 1,362 passed / 2 skipped.
Typecheck, production build, Prisma validation and whitespace checks passed.
Build reports only existing lint warnings outside this slice.
