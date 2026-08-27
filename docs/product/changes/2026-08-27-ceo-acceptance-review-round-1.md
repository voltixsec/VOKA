# CEO Acceptance Review — Round 1

Status: **AUTHORITATIVE CEO REVIEW RECORD**

Review date: 2026-08-27

Recorded from branch: `feature/pre-staging-product-coherence`
Starting HEAD: `a05e74dfb0aeb222ad1ee7468af07db8c9fe6953`

This document records the CEO's hands-on V1 product review. It is product and
acceptance authority for the next correction round; it is not implementation
evidence. The implementation sequence is maintained in
[the Round 1 implementation checklist](2026-08-27-ceo-acceptance-implementation-checklist.md).

## Classification

- **CEO confirmed defect**: behavior observed directly during the review.
- **CEO UX correction**: an observed experience that must change.
- **CEO product decision**: product direction approved by the CEO.
- **Engineering requirement**: a constraint the implementation must satisfy.
- **Confirmed-working behavior**: reviewed behavior that must not be disturbed.
- **Deferred work**: explicitly excluded from the upcoming correction block.
- **Acceptance criterion**: observable evidence required to close the finding.

## Governing acceptance principles

### CEO-R1-001 — One commercial operating system

- **Classification:** CEO product decision
- **Area:** Global product experience
- **Observed behavior:** Some modules and formal outputs still feel independently designed.
- **Required behavior:** VOKA must feel like one commercial operating system, with coherent navigation, terminology, workflows, documents, and state transitions.
- **Why it matters:** Fragmentation weakens trust and makes connected commercial work feel like unrelated tools.
- **Acceptance criteria:** Cross-module journeys use coherent interaction and visual patterns while retaining domain-specific semantics.
- **Priority / Scope:** HIGH / NOW
- **Dependencies:** CEO-R1-003, CEO-R1-025, CEO-R1-026.

### CEO-R1-002 — Intelligence and authority boundary

- **Classification:** CEO product decision; engineering requirement
- **Area:** AI, voice, drawing, and commercial execution
- **Observed behavior:** The review reconfirmed that AI-assisted paths can propose commercial work but require a consistent authority boundary.
- **Required behavior:** `AI understands. Rules calculate. Human approves.` AI proposals never become consequential commercial actions without governed validation and human review.
- **Why it matters:** Commercial truth and accountability cannot be delegated to generative output.
- **Acceptance criteria:** AI and voice flows remain proposal-oriented; authoritative calculations and approvals stay server/rule/human controlled.
- **Priority / Scope:** BLOCKER / NOW
- **Dependencies:** All AI, drawing, pricing, and document workstreams.

### CEO-R1-003 — Quotation is the Golden Commercial UX reference

- **Classification:** CEO product decision
- **Area:** Quotation, Contract, Invoice, Sales Order
- **Observed behavior:** Commercial document workflows use related but inconsistent composer and document patterns.
- **Required behavior:** These document workflows share the established quotation composer/document patterns where domain-appropriate, without erasing their distinct identities.
- **Why it matters:** Users should learn one commercial language rather than four unrelated interfaces.
- **Acceptance criteria:** Shared patterns are evident for identity, source, lines, totals, terms, review, and outputs; module-specific fields remain correct.
- **Priority / Scope:** HIGH / NOW
- **Dependencies:** CEO-R1-026.

### CEO-R1-004 — Authoritative values and currency isolation

- **Classification:** Engineering requirement
- **Area:** Screen, PDF, Excel, dashboard, reports
- **Observed behavior:** The review identified reconciliation and aggregate consistency as mandatory across commercial surfaces and outputs.
- **Required behavior:** Screen/PDF/XLSX use the same server-authoritative numbers. Unlike currencies are never combined and no implicit FX is introduced.
- **Why it matters:** Conflicting or mixed totals destroy financial trust.
- **Acceptance criteria:** Every affected output reconciles for the same tenant/filter/snapshot; aggregates are currency-separated.
- **Priority / Scope:** BLOCKER / NOW
- **Dependencies:** CEO-R1-022, CEO-R1-037.

### CEO-R1-005 — Multilingual architecture and active-language UX

- **Classification:** CEO product decision; engineering requirement
- **Area:** Global localization
- **Observed behavior:** V1 begins with Arabic and English, and some screens expose both languages or leak the inactive language.
- **Required behavior:** Arabic and English are first-release languages, but architecture remains multi-language. The selected language controls the experience; screens do not advertise that both language versions exist.
- **Why it matters:** Paired-language UX does not scale and makes the active interface feel unfinished.
- **Acceptance criteria:** AR is genuinely Arabic/RTL, EN genuinely English/LTR, inactive-language readiness messages are absent, and localization design can extend beyond two languages.
- **Priority / Scope:** HIGH / NOW
- **Dependencies:** CEO-R1-017, CEO-R1-024, CEO-R1-034, CEO-R1-036.

### CEO-R1-006 — Consistent Arabic typography

- **Classification:** CEO UX correction; CEO product decision
- **Area:** Global design system
- **Observed behavior:** Arabic typography varies by page.
- **Required behavior:** Apply the strong Arabic typography appearance approved during review consistently across VOKA.
- **Why it matters:** Typography is a primary signal of product quality and Arabic-first credibility.
- **Acceptance criteria:** Public, authenticated, form, and formal-output surfaces use the established Arabic typography consistently, subject to renderer support.
- **Priority / Scope:** HIGH / NOW
- **Dependencies:** CEO-R1-026, CEO-R1-036.

### CEO-R1-007 — Temporary VOKA logo remains

- **Classification:** CEO product decision; deferred work
- **Area:** Corporate brand
- **Required behavior:** Do not redesign the temporary VOKA logo during the correction round. Final identity will later propagate across app, login, public content, documents, email, and other brand assets.
- **Why it matters:** Current effort belongs on product correction, not a soon-to-be-replaced identity.
- **Acceptance criteria:** No correction workstream spends scope on VOKA corporate-logo redesign.
- **Priority / Scope:** LOW / DEFERRED
- **Dependencies:** Final branding phase.

## Authentication and workspace controls

### CEO-R1-008 — Active sessions expire during form work

- **Classification:** CEO confirmed defect
- **Area:** Authentication/session refresh; Invoice form
- **Observed behavior:** After approximately 3–4 minutes of active form work, an Invoice workflow returned “Authentication is required” and disrupted partially entered work.
- **Required behavior:** Active users retain a valid session under a secure, intentional policy. Genuine reauthentication should preserve unsaved work where practical.
- **Why it matters:** Short, unexpected expiry causes data loss and makes core workflows unreliable.
- **Acceptance criteria:** A user can work beyond the observed interval without auth failure; refresh/middleware/API behavior is consistent; expiry is secure and intentional; reauthentication does not unnecessarily destroy drafts.
- **Priority / Scope:** BLOCKER / NOW
- **Dependencies:** Token expiry, refresh cookies, middleware, API auth, client retry/state preservation.

### CEO-R1-009 — Notification center is decorative

- **Classification:** CEO confirmed defect; CEO product decision
- **Area:** Global header notifications
- **Observed behavior:** The bell/dot has no real notification-center behavior.
- **Required behavior:** Tenant-safe notification records with unread count, read state, list/popover, timestamp, concise event description, related-record link, mark-one-read, and mark-all-read. Only meaningful commercial/attention events generate notifications.
- **Why it matters:** A decorative indicator creates false expectations and cannot support operational attention.
- **Acceptance criteria:** A meaningful event creates an actionable unread notification; counts increment/decrement correctly; read actions persist; no fake or cross-tenant records exist.
- **Priority / Scope:** HIGH / NOW
- **Dependencies:** Event sources and tenant authorization.

### CEO-R1-010 — Search and user menu work

- **Classification:** Confirmed-working behavior
- **Area:** Global header
- **Observed behavior:** Search control works; user menu opens; logout is visible and works.
- **Required behavior:** Preserve these controls and avoid unnecessary reimplementation.
- **Why it matters:** Confirmed-working controls should not consume correction effort or regress during adjacent header work.
- **Acceptance criteria:** Regression coverage and final acceptance confirm search, menu, and logout remain functional.
- **Priority / Scope:** MEDIUM / NOW
- **Dependencies:** Header changes for notifications and responsive/localization cleanup.

### CEO-R1-011 — Advanced account administration

- **Classification:** Deferred work
- **Area:** Account administration
- **Required behavior:** Review Advanced Account Manager/admin settings later with integration and account-administration scope.
- **Acceptance criteria:** Upcoming correction work does not invent this feature.
- **Priority / Scope:** LOW / DEFERRED
- **Dependencies:** Future account-administration decision.

## Voice and Commercial AI

### CEO-R1-012 — Voice finalizes on natural pauses

- **Classification:** CEO confirmed defect
- **Area:** Both supported voice entry points
- **Observed behavior:** A short pause for breath/thought finalizes a partial Arabic request.
- **Required behavior:** Tolerate normal pauses, accumulate coherent speech, show clear listening/recording state, provide explicit finish/stop where useful, avoid ambiguous duplicate controls, keep transcript editable, and never auto-execute raw speech.
- **Why it matters:** Premature finalization makes natural conversational input unusable.
- **Acceptance criteria:** A user can speak, pause, continue, stop intentionally, edit the transcript, and submit for governed review consistently from retained entry points.
- **Priority / Scope:** HIGH / NOW
- **Dependencies:** Browser speech transport and shared voice interaction contract.

### CEO-R1-013 — Universal Commercial AI Assistant

- **Classification:** CEO product decision
- **Area:** Commercial AI entry
- **Observed behavior:** Product framing can imply quotation-only assistance.
- **Required behavior:** Understand and route quotation, invoice, contract, sales order, payment, and drawing-to-quotation intent. Support Speak + Type + Attach, with attachment naturally available before/alongside the instruction.
- **Why it matters:** VOKA is a commercial operating system, not a quotation chatbot.
- **Acceptance criteria:** Each supported intent reaches the correct governed workflow without automatic consequential execution; ambiguous intent requests clarification.
- **Priority / Scope:** HIGH / NOW
- **Dependencies:** CEO-R1-014, CEO-R1-015, domain routes.

### CEO-R1-014 — Conversational clarification loop

- **Classification:** CEO product decision; CEO UX correction
- **Area:** Commercial AI Assistant
- **Observed behavior:** Suggested answers do not become real conversational replies; users may need to copy/paste and resubmit.
- **Required behavior:** VOKA asks a concise question, may offer sensible options, treats a clicked option as the user's reply/context, continues automatically, and repeats only when necessary until a reviewable result exists.
- **Why it matters:** Clarification is central to reliable AI-assisted commercial work.
- **Acceptance criteria:** Clicking a suggestion visibly enters the conversation, advances reasoning without manual resubmission, and preserves a reviewable audit/context trail.
- **Priority / Scope:** HIGH / NOW
- **Dependencies:** Conversation state and CEO-R1-013.

## Drawing and system generation

### CEO-R1-015 — Drawing must lead toward a governed commercial system

- **Classification:** CEO product decision; engineering requirement
- **Area:** Drawing → system → quotation
- **Observed behavior:** Current takeoff can stop at detected quantities.
- **Required behavior:** The near-term journey is upload → requested system → governed quantity/component identification → commercial-system recommendation/build → uncertainty review → quotation preparation. Applicable cameras, recording, switching/PoE, storage, cabling, accessories, and services may be proposed only when supported by data/rules. Missing engineering facts trigger clarification, never fabrication.
- **Why it matters:** The business value is a reviewable commercial solution, not an isolated count or CAD replacement.
- **Acceptance criteria:** A supported example progresses toward a complete reviewable system/quotation; missing inputs remain explicit and block invented facts.
- **Priority / Scope:** BLOCKER / NOW
- **Dependencies:** CEO-R1-002, CEO-R1-014, system rules/catalog/pricing availability.

### CEO-R1-016 — Simplify ordinary Drawing UX

- **Classification:** CEO confirmed defect; CEO UX correction
- **Area:** `/dashboard/takeoff` and common commercial entry
- **Observed behavior:** The page is narrowly “CCTV / Low Voltage Takeoff,” says PDF-only, leaks native English file-picker text in Arabic, exposes enums such as `REVIEW_REQUIRED`, uses “Register drawing,” and has verbose/possibly duplicate recent sessions with dominant technical warnings.
- **Required behavior:** Present Upload → Tell VOKA what is needed → Analyze → Clarify → Review → Create quotation. Use localized product labels and truthful supported-format claims; simplify history; investigate duplicates; move long warnings into result/review context.
- **Why it matters:** Ordinary commercial users should not face engineering-tool friction.
- **Acceptance criteria:** AR/EN user-facing labels are localized; no raw status enums/native picker leakage; primary action is Analyze/Start analysis; history is concise and duplicate behavior is understood/corrected; unsupported formats are not claimed.
- **Priority / Scope:** HIGH / NOW
- **Dependencies:** CEO-R1-014, CEO-R1-015, actual adapter support.

## Master data and bulk operations

### CEO-R1-017 — Product/service multilingual identity

- **Classification:** CEO product decision; CEO confirmed defect
- **Area:** Products & Services and reusable localized content
- **Observed behavior:** UI permanently exposes Arabic Name + English Name, and English mode displayed an untranslated Arabic product name.
- **Required behavior:** One canonical product/service identity with extensible localized representations. Generated translations may be manually overridden and persisted. Do not blindly remove legitimate document snapshots or language overrides.
- **Why it matters:** Hard-coded language pairs cannot support VOKA's multi-language direction.
- **Acceptance criteria:** Active language resolves a valid localized presentation; manual override persists; missing localization has a governed visible state/fallback; architecture can add languages without new fixed columns in the UX concept.
- **Priority / Scope:** HIGH / NOW
- **Dependencies:** Localization architecture decision; composers/documents; CEO-R1-005.

### CEO-R1-018 — ERP-style import/export framework

- **Classification:** CEO product decision; engineering requirement
- **Area:** Database-backed collection modules
- **Observed behavior:** Large collections cannot be safely migrated through a shared ERP workflow.
- **Required behavior:** Appropriate modules support structured XLSX export and a governed import journey: official template, upload, column mapping, required/optional fields, validation, preview, row errors, explicit duplicates/conflicts, safe batch commit, and tenant isolation. Domain-specific exceptions must be documented; immutable historical transactions must not be forced into unsafe import.
- **Why it matters:** Large catalogs with tens of thousands of records cannot be entered one-by-one.
- **Acceptance criteria:** A realistic large catalog completes template → mapping → validation → preview → import without silent partial corruption; exports are server-authoritative genuine XLSX.
- **Priority / Scope:** HIGH / NOW
- **Dependencies:** Shared import architecture, job/batch boundaries, CEO-R1-017.

### CEO-R1-019 — Customer form submitted unexpectedly

- **Classification:** CEO confirmed defect
- **Area:** Customer Create/Edit
- **Observed behavior:** Customer creation saved/redirected before Notes entry was complete; the CEO had to reopen Edit.
- **Required behavior:** No surprise submission from Enter/unrelated controls; Create/Save is explicit; entered state is preserved; success behavior is clear.
- **Why it matters:** Premature submit loses data and user trust.
- **Acceptance criteria:** Keyboard and contact-picker flows cannot submit accidentally; only explicit submit persists; unfinished values remain until deliberate completion/navigation.
- **Priority / Scope:** HIGH / NOW
- **Dependencies:** Form/event lifecycle and Contact Picker interactions.

## Customer, dashboard, and quotation

### CEO-R1-020 — Customer 360 direction approved

- **Classification:** Confirmed-working behavior; CEO product decision
- **Area:** Customer 360
- **Observed behavior:** The connected Customer 360 direction was manually reviewed and approved.
- **Required behavior:** Preserve the connected view across quotations, sales orders, contracts, invoices/receivables, payments, and relevant activity. Aggregates remain server-authoritative and currency-separated.
- **Why it matters:** It is the approved customer-level commercial context and must remain trustworthy through correction work.
- **Acceptance criteria:** Existing Customer 360 behavior remains intact throughout correction work and tenant/currency tests pass.
- **Priority / Scope:** HIGH / NOW
- **Dependencies:** CEO-R1-004.

### CEO-R1-021 — Statement terminology and Arabic presentation

- **Classification:** CEO UX correction; engineering requirement
- **Area:** Customer Statement, summaries, formal outputs
- **Observed behavior:** Mixed English remnants appear in Arabic contexts; generic quotation collections risk accounting terminology.
- **Required behavior:** “Customer Statement” remains accounting-specific. Generic quotation collections are Summary/Overview. Arabic screens and outputs use proper Arabic labels.
- **Why it matters:** Incorrect accounting terminology and mixed-language formal output misstate business meaning and reduce trust.
- **Acceptance criteria:** Accounting and non-accounting surfaces use correct terminology; AR formal output contains no avoidable English UI labels.
- **Priority / Scope:** MEDIUM / NOW
- **Dependencies:** CEO-R1-036.

### CEO-R1-022 — Dashboard counts do not reconcile

- **Classification:** CEO confirmed defect
- **Area:** Dashboard and module summaries
- **Observed behavior:** Quotation list contained significantly more records while Dashboard showed only 3.
- **Required behavior:** Counters use the same tenant scope, authoritative business definitions, and explicit status/current-revision rules as their module. No hard-coded/sample/stale independent metrics.
- **Why it matters:** The command center cannot misrepresent operational truth.
- **Acceptance criteria:** Customers, Products, Quotations, Sales Orders, Contracts, Invoices, and Payments reconcile with their modules for documented definitions and refresh correctly after lifecycle changes.
- **Priority / Scope:** HIGH / NOW
- **Dependencies:** Shared summary definitions and cache/refresh behavior.

### CEO-R1-023 — Quotation revision governance works

- **Classification:** Confirmed-working behavior
- **Area:** Quotation revisions
- **Observed behavior:** Revisioning was manually exercised successfully.
- **Required behavior:** Preserve approved immutability, family/revision numbering, historical read-only state, clear current revision, and downstream exact provenance.
- **Why it matters:** Approved commercial history and downstream source lineage must remain auditable.
- **Acceptance criteria:** Regression tests and manual acceptance demonstrate these invariants after UI corrections.
- **Priority / Scope:** BLOCKER / NOW
- **Dependencies:** Quotation, Sales Order, Invoice/source changes.

### CEO-R1-024 — Quotation detail/revision language cleanup

- **Classification:** CEO UX correction
- **Area:** Quotation detail/revisions
- **Observed behavior:** “Arabic and English versions are ready” and technical states such as `COMPLETED` distract from business identity; historical read-only explanation needs clarity.
- **Required behavior:** Active language controls display; use product-facing states; make subject/title and business meaning primary; clearly explain historical read-only revisions.
- **Why it matters:** Technical and redundant messaging obscures the document's business identity and revision state.
- **Acceptance criteria:** No inactive-language readiness clutter or avoidable raw technical status; current vs historical revision is immediately understandable.
- **Priority / Scope:** MEDIUM / NOW
- **Dependencies:** CEO-R1-005, CEO-R1-023.

## Commercial documents and lifecycle

### CEO-R1-025 — Sales Order semantic coherence

- **Classification:** CEO confirmed defect; CEO UX correction
- **Area:** Sales Order screen and outputs
- **Observed behavior:** Sales Order still visually carries quotation identity/concepts, including meaningless source values such as quotation “0.”
- **Required behavior:** Sales Order is the primary document; quotation is secondary source/provenance with correct number/family/revision. Shared visual patterns must not mislabel document identity.
- **Why it matters:** Confusing current identity with source provenance makes official commercial records ambiguous.
- **Acceptance criteria:** Title/subject/output identify Sales Order; exact source reference is secondary and correct; no meaningless source placeholders.
- **Priority / Scope:** HIGH / NOW
- **Dependencies:** CEO-R1-023, CEO-R1-026.

### CEO-R1-026 — Shared Commercial Document design system

- **Classification:** CEO product decision; engineering requirement
- **Area:** Quotation, Sales Order, Contract, Invoice, formal outputs
- **Observed behavior:** Repeated but inconsistent report/document layouts look independently invented.
- **Required behavior:** Establish shared company identity, header/footer, typography, spacing hierarchy, tables, totals, branding, signature/stamp, and print/PDF philosophy. Only domain-specific titles/fields/sections vary. Screen, PDF, and official delivery carry the same conceptual identity.
- **Why it matters:** Formal documents are a core trust surface for VOKA and its customers.
- **Acceptance criteria:** Side-by-side outputs clearly belong to one system, preserve domain semantics, and reconcile with authoritative screen data.
- **Priority / Scope:** HIGH / NOW
- **Dependencies:** CEO-R1-003, CEO-R1-006, CEO-R1-034, branding assets.

### CEO-R1-027 — Contract output coherence

- **Classification:** CEO UX correction; confirmed-working behavior
- **Area:** Contract Create/Edit/Detail/PDF/XLSX
- **Observed behavior:** Lifecycle, line items, payment stages, terms, notes, PDF and Excel exist; formal styling is independently implemented.
- **Required behavior:** Preserve lifecycle, payment schedule, history, provenance, and language quality while aligning formal output with CEO-R1-026.
- **Why it matters:** Contract-specific obligations must remain intact while the product presents one coherent official document family.
- **Acceptance criteria:** Contract behavior remains intact and its formal output uses the shared document identity without losing contract-specific content.
- **Priority / Scope:** HIGH / NOW
- **Dependencies:** CEO-R1-026.

### CEO-R1-028 — Invoice composer requires horizontal discovery

- **Classification:** CEO confirmed defect
- **Area:** Invoice item entry; commercial composers
- **Observed behavior:** User must move a horizontal scrollbar to discover/edit important item columns.
- **Required behavior:** Important item, description, unit, quantity, price, and total fields are understandable without awkward desktop horizontal hunting; layouts condense/stack intentionally on smaller screens.
- **Why it matters:** Hidden commercial inputs invite errors and slow normal work.
- **Acceptance criteria:** Desktop and practical mobile workflows expose/edit all important line fields intentionally with no accidental page overflow.
- **Priority / Scope:** HIGH / NOW
- **Dependencies:** Shared composer/layout patterns.

### CEO-R1-029 — Governed Invoice source selection

- **Classification:** CEO UX correction; engineering requirement
- **Area:** Invoice Create/Edit
- **Observed behavior:** Selecting an approved source requires ambiguous/manual discovery.
- **Required behavior:** Choose source type and customer, list eligible sources with number, revision where relevant, date, value/currency, and status, then select one. Server copies authoritative customer/items/prices/source references. Direct Invoice remains valid.
- **Why it matters:** Source selection must preserve provenance without forcing users to know internal IDs.
- **Acceptance criteria:** Only eligible tenant/customer sources appear; selection hydrates authoritative data and exact provenance; direct flow still supports customer/items.
- **Priority / Scope:** HIGH / NOW
- **Dependencies:** Quotation/Contract/Sales Order eligibility rules and CEO-R1-023.

### CEO-R1-030 — Payment registration fails end-to-end

- **Classification:** CEO confirmed defect
- **Area:** Invoice payment action and Payments module
- **Observed behavior:** Register action did not successfully complete, even though selected invoice and entered amount/reference later appeared.
- **Required behavior:** Issued invoice → valid payment not exceeding governed outstanding → review → immutable record → server recalculation → invoice history → Payments register → Customer Statement → summaries → audit event (and meaningful notification where applicable). No overpayment without an explicit credit/advance workflow.
- **Why it matters:** Collection is a core commercial lifecycle, not a cosmetic form.
- **Acceptance criteria:** The full lifecycle succeeds atomically/idempotently as designed and every dependent authoritative view reconciles; failures are actionable and do not partially corrupt state.
- **Priority / Scope:** BLOCKER / NOW
- **Dependencies:** Invoice/payment domain, CEO-R1-004, CEO-R1-009, CEO-R1-022.

## Settings, brand, and authorization

### CEO-R1-031 — Company Settings correction

- **Classification:** CEO confirmed defect; CEO product decision
- **Area:** Company & Brand Settings
- **Observed behavior:** Arabic page leaks English labels; heading is quotation-specific; desktop wastes horizontal space; master data and default terms are too narrow.
- **Required behavior:** Localize all product labels; frame settings as company identity/master data feeding all commercial documents. Support appropriate optional structured identity/contact/legal fields. Evolve defaults by document/business type with document-local overrides. Improve responsive desktop composition without density.
- **Why it matters:** Company master data is shared commercial infrastructure, not quotation-only configuration.
- **Acceptance criteria:** AR/EN settings are coherent; company data is reusable across documents; optional jurisdiction fields are not forced at minimal onboarding; defaults are no longer quotation-only; desktop layout uses space effectively.
- **Priority / Scope:** HIGH / NOW
- **Dependencies:** Master-data model review, CEO-R1-026, CEO-R1-036.

### CEO-R1-032 — Live Email/WhatsApp activation remains deferred

- **Classification:** Deferred work; CEO UX correction
- **Area:** Integration Settings
- **Observed behavior:** Normal business users can see developer-oriented Access Token, Phone ID, Graph API, API key/provider concepts.
- **Required behavior:** Do not activate or fake providers now. Future UX shows simple status/guided setup with advanced provider configuration appropriately protected; code foundation may remain.
- **Acceptance criteria:** Upcoming correction block does not activate providers or claim connection; technical configuration is not expanded as normal-user UX.
- **Priority / Scope:** MEDIUM / DEFERRED
- **Dependencies:** Final integration workstream.

### CEO-R1-033 — Company Logo Studio

- **Classification:** CEO product decision
- **Area:** Customer-company branding
- **Observed behavior:** Settings currently support company logo upload but do not provide the requested governed AI creation path.
- **Required behavior:** Offer upload-existing and AI-create paths. AI flow captures company name/activity/style/optional colors, generates alternatives, supports preview/refine/regenerate, and requires explicit human approval before becoming the company asset. Allow replace/delete. This is not VOKA corporate-logo redesign.
- **Why it matters:** Company customers need governed brand creation as well as upload.
- **Acceptance criteria:** Multiple proposals can be reviewed; none becomes active without explicit approval; asset replacement/deletion is controlled and document-history rules are respected.
- **Priority / Scope:** HIGH / NOW
- **Dependencies:** Image provider/product approval, asset storage, company branding snapshots.

### CEO-R1-034 — Authorized Signatories localization and governance

- **Classification:** CEO confirmed defect; CEO product decision
- **Area:** Authorized Signatories
- **Observed behavior:** Mixed language labels, fixed “Name/Title in English,” native picker leakage, and raw document enums are shown.
- **Required behavior:** Use scalable localized identity, localized document-type labels, clear “This signatory may approve/sign” wording, signature upload/draw (and clearly purposed capture if supported), Active/Inactive retention, permission/signature audit, and immutable approval snapshots.
- **Why it matters:** Personal authority must be clear, durable, and historically trustworthy.
- **Acceptance criteria:** AR/EN UI has no avoidable leakage/raw enums; inactive signatories remain historical; approved documents retain exact identity/title/signature reference/timestamp/authorization context after later changes.
- **Priority / Scope:** HIGH / NOW
- **Dependencies:** CEO-R1-005, CEO-R1-026, audit model.

### CEO-R1-035 — Separate company assets from personal authorization

- **Classification:** CEO product decision; engineering requirement
- **Area:** Branding/signatures
- **Observed behavior:** Current settings expose overlapping company-signature and authorized-signatory concepts.
- **Required behavior:** Company assets are logo, letterhead, and stamp/seal. Personal authorization is signatory name, title, signature, and allowed document types. A generic “company signature” must not undermine signatory governance.
- **Why it matters:** Corporate presentation assets and personal approval authority have different governance and historical meaning.
- **Acceptance criteria:** Settings and document approval clearly separate these concepts; historical snapshots preserve the applicable company and personal assets.
- **Priority / Scope:** HIGH / NOW
- **Dependencies:** CEO-R1-026, CEO-R1-034.

## Localization and exports

### CEO-R1-036 — Formal language quality

- **Classification:** CEO confirmed defect; engineering requirement
- **Area:** Navigation, forms, states, helpers, screens, documents
- **Observed behavior:** Arabic mode repeatedly exposes English UI text and raw enums.
- **Required behavior:** AR navigation/labels/states/buttons/helpers/formal outputs are properly Arabic and RTL; EN is properly English/LTR. Genuine technical identifiers may remain but must not replace user-facing localization. Do not show both languages merely to prove translations exist.
- **Why it matters:** Mixed-language and direction defects make formal and operational experiences feel unfinished and can obscure meaning.
- **Acceptance criteria:** Full AR/EN responsive sweep finds no avoidable mixed-language UI, raw business enums, or direction defects.
- **Priority / Scope:** HIGH / NOW
- **Dependencies:** All UI workstreams; CEO-R1-005.

### CEO-R1-037 — Commercial export role and authority

- **Classification:** Confirmed-working direction; engineering requirement
- **Area:** Screen/PDF/XLSX
- **Observed behavior:** Existing modules expose these formats, and the CEO reconfirmed their distinct product roles and shared authority requirement.
- **Required behavior:** Screen supports operation; PDF is fixed official presentation/delivery; Excel is editable analysis/downstream work. Both use authoritative server data, reconcile with screen, and XLSX is genuine—not renamed CSV.
- **Why it matters:** Users rely on each format for a different task while expecting identical commercial truth.
- **Acceptance criteria:** Export action, content type, structure, source snapshot, amounts/currencies, and reconciliation tests pass for supported modules.
- **Priority / Scope:** HIGH / NOW
- **Dependencies:** CEO-R1-004, CEO-R1-026.

### CEO-R1-038 — Drawing/Takeoff export semantics

- **Classification:** Confirmed-working direction; engineering requirement
- **Area:** Takeoff/BOQ PDF and XLSX
- **Observed behavior:** Takeoff/BOQ outputs require formal PDF and editable Excel semantics without hiding analysis uncertainty.
- **Required behavior:** PDF is formal/reviewable; XLSX is structured editable quantities/BOQ. Provenance, confidence, uncertainty, and human-review state remain visible. A quotation created from Takeoff still requires human review.
- **Why it matters:** Export must support downstream work without presenting uncertain machine analysis as approved engineering fact.
- **Acceptance criteria:** Exported quantities are genuine numeric cells where resolved, uncertainty is not masked, and no output implies engineering approval or fabricated pricing.
- **Priority / Scope:** HIGH / NOW
- **Dependencies:** CEO-R1-015, CEO-R1-016.

## Explicit exclusions and acceptance philosophy

### CEO-R1-039 — Deferred major workstreams

- **Classification:** Deferred work
- **Area:** Program scope
- **Required behavior:** Exclude full UCL population, full System Intelligence Library population, live WhatsApp, live Email, Google Cloud production infrastructure, subscription/billing, payment gateway, staging, production, pilot, final VOKA brand identity, Advanced Account Manager, and deep CAD/engineering expansion.
- **Acceptance criteria:** None appears as a Jules acceptance item for the upcoming correction round unless separately authorized.
- **Priority / Scope:** LOW / DEFERRED
- **Dependencies:** Future explicit CEO authorization.

### CEO-R1-040 — Workflow-based acceptance

- **Classification:** CEO product decision; engineering requirement
- **Area:** All correction workstreams
- **Observed behavior:** The review found that controls or partial API behavior can exist while the end-to-end user outcome still fails.
- **Required behavior:** Judge complete user outcomes, not component existence. Voice must tolerate pause/continue/review; payment must update all authoritative dependents; notifications must be actionable; drawing must reach clarification/review/quotation; import must complete template/mapping/validation/preview/import safely.
- **Why it matters:** A rendered control or responding API does not establish usable product behavior.
- **Acceptance criteria:** Each workstream supplies end-to-end workflow evidence plus proportionate domain/API/UI/security tests and AR/EN responsive acceptance.
- **Priority / Scope:** BLOCKER / NOW
- **Dependencies:** Every NOW workstream.

## Do-not-disturb summary

The upcoming correction round must preserve the temporary VOKA logo, approved
theme/color concept, working search and user menu/logout, Customer 360 direction,
quotation revision immutability, Contract payment stages, valid Direct Invoice
workflow, optional quotation-first lifecycle, first-class Payments, and
first-class Drawing with a simpler common commercial journey.

## Finding totals

- Total findings: **40**
- NOW: **36**
- DEFERRED: **4**
