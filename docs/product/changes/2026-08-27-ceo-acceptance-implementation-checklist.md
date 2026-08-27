# CEO Acceptance Round 1 — Jules Implementation Checklist

Status: **READY FOR IMPLEMENTATION PLANNING; NO IMPLEMENTATION RECORDED HERE**

Authority: [CEO Acceptance Review Round 1](2026-08-27-ceo-acceptance-review-round-1.md)
Target branch: `feature/pre-staging-product-coherence`

This checklist groups only **NOW** findings into coherent, reviewable execution
workstreams. Jules must begin each workstream from verified GitHub truth and must
not reinterpret deferred items as implementation scope. Codex engineering review
follows each bounded delivery.

## Execution rules

- Preserve tenant isolation, approved-history immutability, exact provenance,
  server-authoritative calculations, and explicit human approval.
- Use workflow acceptance, not existence checks.
- Keep commits bounded by workstream and record affected authoritative docs.
- Do not implement any item classified DEFERRED in the review record.
- Resolve product/architecture ambiguity with the CEO/CTO; do not invent it.

## WS-A — Session/Auth stability

- **Finding:** CEO-R1-008
- **Priority:** BLOCKER
- [ ] Reproduce active-form expiry across the observed interval.
- [ ] Trace access/refresh expiry, cookies, middleware, API auth, and client retry behavior.
- [ ] Define and test a secure intentional session policy.
- [ ] Preserve unsaved form work across genuine reauthentication where practical.
- [ ] Validate active and genuine-expiry behavior end-to-end.
- **Acceptance gate:** Normal active Invoice work is not interrupted after 3–4 minutes; security is not weakened.

## WS-B — Global localization + typography cleanup

- **Findings:** CEO-R1-005, CEO-R1-006, CEO-R1-021, CEO-R1-024, CEO-R1-036
- **Priority:** HIGH
- **Implementation status:** COMPLETE IN CODE — focused authenticated sweep and responsive Signatories acceptance complete; residual data-backed visual acceptance remains.
- **Evidence:** `5adf5e9` (`fix(i18n): unify authenticated locale presentation`), `f4c631c` (`fix(i18n): close priority authenticated language leaks`), and `8f82ddd` (`fix(i18n): localize authenticated domain presentation`).
- [x] Apply one established Arabic/Latin typography source across authenticated pages.
- [x] Add shared user-visible status/document/provenance labels and apply them to priority surfaces.
- [x] Replace native file input leakage in Drawing and Authorized Signatories.
- [x] Remove completed inactive-language readiness clutter from the commercial detail surface while retaining actionable localization-failure/pending guidance and approval fencing.
- [x] Correct priority statement/summary terminology and authenticated status, provenance, origin, payment-method, document-type, and audit presentation labels.
- [x] Present Authorized Signatory identity entry only in the active language while preserving compatible AR/EN storage and existing-data fallback.
- [x] Replace developer-facing catalog fallback disclosure with truthful active-language user wording.
- [x] Verify Authorized Signatories in AR RTL / EN LTR at desktop and mobile widths, including controlled file inputs and overflow.
- [ ] Complete AR RTL / EN LTR desktop/mobile acceptance.
- **Residual manual acceptance:** Recheck data-backed Invoice detail/list, Catalog fallback records, Customer 360, Contracts, Quotations, Payments, and Commercial AI results in both languages once the local authenticated database/API fixture is available. The current browser session rendered the authenticated shell but its data APIs did not provide the required Invoice/Catalog records; automated UI regressions cover the fixed presentation paths.
- **Dependencies:** Supplies localization patterns to WS-E, WS-G, WS-K, WS-N, WS-O.
- **Acceptance gate:** Arabic and English each feel native and uncluttered across affected surfaces.

## WS-C — Notifications

- **Finding:** CEO-R1-009
- **Priority:** HIGH
- **Implementation status:** COMPLETE IN CODE — manual browser acceptance remains.
- **Evidence:** `ebf4a80` (`feat(notifications): add tenant-safe notification center`).
- [x] Define a small meaningful event set: successful Invoice issuance.
- [x] Add tenant-safe persistent notification records and authorization boundaries.
- [x] Implement unread count, list/popover, timestamp, description, and related-record link.
- [x] Implement mark-one and mark-all read with correct count transitions.
- [x] Verify tenant/user query boundaries, deterministic deduplication, and no fake seeded indicators.
- **Dependencies:** Event/audit sources; WS-M may emit payment lifecycle events.
- **Acceptance gate:** A real event produces a useful actionable notification whose read state persists.

## WS-D — Voice + Commercial AI conversational UX

- **Findings:** CEO-R1-002, CEO-R1-012, CEO-R1-013, CEO-R1-014
- **Priority:** HIGH
- [ ] Define one coherent voice capture contract for retained entry points.
- [ ] Tolerate normal pauses and provide clear listening/stop/finish state.
- [ ] Preserve editable transcript and prevent automatic commercial execution.
- [ ] Route all approved commercial intent types.
- [ ] Make Speak + Type + Attach natural before/alongside instruction.
- [ ] Implement reusable clarification questions and suggestion replies that continue automatically.
- **Dependencies:** WS-E uses this clarification loop.
- **Acceptance gate:** User can speak, pause, continue, clarify through a clicked option, review, and reach the correct governed workflow.

## WS-E — Drawing-to-commercial-quotation simplification

- **Findings:** CEO-R1-015, CEO-R1-016, CEO-R1-038
- **Priority:** BLOCKER
- [ ] Simplify the ordinary journey to Upload → Need → Analyze → Clarify → Review → Create quotation.
- [ ] Replace narrow/technical/native-browser wording with localized product language.
- [ ] Preserve truthful supported formats; do not claim unsupported CAD adapters.
- [ ] Investigate duplicate-looking sessions and simplify history/warning presentation.
- [ ] Connect supported quantities to governed system logic without invented engineering facts/prices.
- [ ] Ask for missing required inputs through WS-D clarification.
- [ ] Preserve provenance, confidence, uncertainty, and human review in screen/PDF/XLSX and quotation handoff.
- **Dependencies:** WS-D; governed system/catalog/pricing rules; WS-G localized product identity.
- **Acceptance gate:** A supported drawing request reaches a reviewable system/quotation without engineering-UI friction or fabricated facts.

## WS-F — Customer form lifecycle

- **Finding:** CEO-R1-019
- **Priority:** HIGH
- [ ] Reproduce unexpected Create submission, including Enter and Contact Picker paths.
- [ ] Make persistence require the explicit Create/Save action.
- [ ] Preserve entered state and provide clear success/navigation behavior.
- [ ] Add keyboard/form lifecycle regression coverage.
- **Acceptance gate:** Notes and other unfinished fields cannot be lost through surprise submission.

## WS-G — Product/service multilingual identity

- **Findings:** CEO-R1-005, CEO-R1-017
- **Priority:** HIGH
- **Implementation status:** COMPLETE IN CODE — migration deployment and manual acceptance remain.
- **Evidence:** `240ea99` (`feat(catalog): add extensible item localizations`).
- [x] Implement an additive scalable localization model without destructive legacy-column removal.
- [x] Separate canonical identity from extensible localized representations.
- [x] Define deterministic visible fallback and persistent human overrides.
- [x] Correct active-language product presentation without paired-language UI.
- [x] Preserve legacy AR/EN data and immutable historical document snapshots.
- **Dependencies:** Affects composers, documents, WS-E and WS-J; precedes broad data-model implementation.
- **Acceptance gate:** Product identity resolves correctly in the active language and can extend beyond Arabic/English without paired-field UX.

## WS-H — ERP Import/Export shared framework

- **Finding:** CEO-R1-018
- **Priority:** HIGH
- [ ] Define module eligibility and document explicit domain exceptions.
- [ ] Design official templates, structured exports, mapping, validation, preview, errors, duplicates, and commit boundaries.
- [ ] Implement tenant-safe, bounded/batched processing for the first approved collection slice.
- [ ] Prove realistic large-catalog workflow and no silent partial corruption.
- [ ] Reuse the framework for later eligible database-backed collections.
- **Dependencies:** WS-G decisions for multilingual catalog fields.
- **Acceptance gate:** A realistic catalog completes template → mapping → validation → preview → import safely.

## WS-I — Dashboard/module authoritative summaries

- **Findings:** CEO-R1-004, CEO-R1-022
- **Priority:** HIGH
- **Implementation status:** COMPLETE IN CODE — manual data reconciliation remains.
- **Evidence:** `b47ef67` (`fix(dashboard): reconcile authoritative module metrics`).
- [x] Encode authoritative definitions in one shared server snapshot and tests.
- [x] Reconcile tenant, status, deletion, and current-revision filters with modules.
- [x] Remove narrower independent Dashboard quotation/invoice semantics.
- [x] Keep invoice total and outstanding counts distinct.
- [x] Add reconciliation, tenant/filter, and currency-separated aggregation coverage.
- **Acceptance gate:** Dashboard and module totals reconcile for Customers, Products, Quotations, Sales Orders, Contracts, Invoices, and Payments.

## WS-J — Shared Commercial Document visual/output system

- **Findings:** CEO-R1-001, CEO-R1-003, CEO-R1-004, CEO-R1-006, CEO-R1-026, CEO-R1-027, CEO-R1-037
- **Priority:** HIGH
- [ ] Inventory canonical Quotation patterns and existing renderer differences.
- [ ] Define shared identity/header/footer/typography/spacing/table/totals/branding/signature primitives.
- [ ] Apply them incrementally to Sales Order, Contract, and Invoice without losing domain sections.
- [ ] Preserve server-authoritative screen/PDF/XLSX reconciliation and currency isolation.
- [ ] Preserve Contract payment schedule/history/provenance.
- **Dependencies:** WS-G localized content; WS-O signatory rules; WS-N company assets.
- **Acceptance gate:** Formal outputs clearly belong to one product and remain semantically/financially correct.

## WS-K — Sales Order coherence

- **Findings:** CEO-R1-023, CEO-R1-025
- **Priority:** HIGH
- [ ] Make Sales Order identity/title/subject primary on screen and output.
- [ ] Present source quotation as secondary exact provenance.
- [ ] Remove meaningless source values and verify number/family/revision.
- [ ] Preserve approved quotation immutability and downstream provenance.
- **Dependencies:** WS-J shared document system.
- **Acceptance gate:** No Sales Order is visually mistaken for a quotation; exact source remains clear.

## WS-L — Invoice source-selection + responsive composer

- **Findings:** CEO-R1-028, CEO-R1-029
- **Priority:** HIGH
- [ ] Redesign line editing to avoid awkward desktop horizontal discovery.
- [ ] Define intentional responsive/mobile line editing.
- [ ] Implement source-type/customer/eligible-source selection with useful reference metadata.
- [ ] Copy authoritative source/customer/items/prices/provenance server-side.
- [ ] Preserve Direct Invoice.
- **Dependencies:** WS-G and WS-J patterns; source eligibility rules.
- **Acceptance gate:** User can edit all important line fields and select an eligible source without internal-ID discovery or provenance loss.

## WS-M — Payment lifecycle

- **Finding:** CEO-R1-030
- **Priority:** BLOCKER
- [ ] Reproduce both failed Register paths and identify partial-state behavior.
- [ ] Enforce issued-invoice eligibility and governed outstanding/overpayment rules.
- [ ] Make record creation and invoice recalculation atomic/idempotent as required.
- [ ] Reconcile invoice history, Payments, Customer Statement, dashboard summaries, and audit events.
- [ ] Add notification integration only for a meaningful approved event.
- [ ] Prove tenant safety and cross-currency correctness.
- **Dependencies:** WS-C notifications, WS-I summaries.
- **Acceptance gate:** A valid payment completes end-to-end and every authoritative dependent view updates correctly.

## WS-N — Company Settings cleanup

- **Findings:** CEO-R1-031, CEO-R1-035
- **Priority:** HIGH
- [ ] Localize AR/EN settings and correct company-wide terminology.
- [ ] Review structured company/contact/legal master data with optional jurisdiction fields.
- [ ] Define reusable default terms by meaningful document/business type.
- [ ] Improve desktop/responsive composition.
- [ ] Separate company logo/letterhead/stamp from personal signatory authorization.
- **Dependencies:** WS-J document system, WS-O signatories.
- **Acceptance gate:** Settings clearly feed all commercial documents, use space well, and preserve the asset/authority distinction.

## WS-O — Authorized Signatories governance

- **Findings:** CEO-R1-005, CEO-R1-034, CEO-R1-035
- **Priority:** HIGH
- [ ] Replace mixed-language/raw-enum labels with localized product wording.
- [ ] Align signatory identity with scalable localization direction.
- [ ] Support clear allowed-document permissions and Active/Inactive retention.
- [ ] Review upload/draw/capture UX and label purpose accurately.
- [ ] Audit identity/permission/signature changes.
- [ ] Prove immutable approval snapshots after signatory changes.
- **Dependencies:** WS-G localization decision, WS-J document system.
- **Acceptance gate:** Authority is understandable now and historically immutable later.

## WS-P — Company Logo Studio

- **Finding:** CEO-R1-033
- **Priority:** HIGH
- [ ] Define customer-company upload and AI-create paths without touching VOKA corporate identity.
- [ ] Define prompt inputs, proposal generation, preview/refine/regenerate, and explicit approval.
- [ ] Define secure asset persistence, replacement, deletion, and historical document behavior.
- [ ] Implement only after provider/storage/approval boundaries are authorized.
- **Dependencies:** Company branding assets and external image-generation decision.
- **Acceptance gate:** A company can approve one generated proposal explicitly; no generated logo activates automatically.

## WS-Q — Full responsive/AR-EN acceptance sweep

- **Findings:** CEO-R1-010, CEO-R1-020, CEO-R1-021, CEO-R1-023, CEO-R1-024, CEO-R1-036, CEO-R1-040
- **Priority:** BLOCKER (closure gate)
- [ ] Recheck all affected public/authenticated routes in AR/EN desktop/mobile states.
- [ ] Preserve working search, user menu/logout, Customer 360, revision immutability, Contract stages, Direct Invoice, Payments, and Drawing.
- [ ] Validate loading/empty/error states, overflow, mixed language, console/hydration, and action links.
- [ ] Execute workflow acceptance for voice, drawing, payment, notification, import, and commercial documents.
- [ ] Run focused/full tests, TypeScript, Prisma gates when applicable, clean build, lint, and diff checks at final HEAD.
- **Dependencies:** All preceding NOW workstreams.
- **Acceptance gate:** Workflow evidence—not component existence—closes Round 1 corrections.

## Deferred — explicitly excluded from Jules correction scope

- **CEO-R1-007:** Final VOKA corporate logo/brand identity.
- **CEO-R1-011:** Advanced Account Manager/admin settings.
- **CEO-R1-032:** Live Email/WhatsApp activation and final guided integration UX.
- **CEO-R1-039:** Full UCL/System Intelligence population, Google Cloud production infrastructure, billing, payment gateway, staging, production, pilot, and deep CAD expansion.

## Suggested dependency order

1. WS-A and WS-F may proceed independently as urgent defect slices.
2. WS-B supplies shared language/typography conventions.
3. WS-G precedes multilingual catalog-dependent portions of WS-E, WS-H, and WS-J.
4. WS-D clarification behavior precedes the complete WS-E journey.
5. WS-C and WS-I should precede final WS-M dependent updates.
6. WS-J establishes primitives for WS-K and Contract/Invoice output alignment.
7. WS-N and WS-O settle brand/authority inputs used by WS-J.
8. WS-Q is the final closure sweep after all authorized NOW slices.
