# VOKA — Roadmap to V1 Completion

This document is the continuation plan after Sprint 10B.

---

# Phase 1 — Finish localization lifecycle

Status: **Delivered through Phase 1.4 / PR #18 (`d5599b2`)**

Changed-field invalidation, localization states, retry/recovery and provider
abstraction are implemented. Quotation creation remains independent from AI
latency, and approval is fenced until required localization completes.

## 1. Changed-fields-only localization

Delivered: target invalidation clears and retranslates only changed target
fields.

Example:

Arabic item name changes:
`كاميرا هيكفيجن`

Only:

`itemNameEn`

should be cleared/retranslated.

Do not retranslate:

- unchanged quotation lines
- terms
- notes
- project
- attention
- brief
- customer name

Acceptance target:

one changed text field → one AI item.

---

## 2. Localization status

Delivered localization states:

- PENDING
- COMPLETED
- FAILED

Delivered lifecycle metadata includes requested/completed timestamps, source
generation/signature and failure state; provider-specific details remain an
infrastructure concern.

- localization requested at
- localization completed at
- source locale
- provider/model
- last error

Do not block commercial Save.

---

## 3. Retry strategy

Background AI failure must be retryable.

Delivered V1 behavior includes controlled retry/recovery and atomic concurrency
protection:

- manual Retry localization action
- controlled automatic retry
- no duplicate concurrent localization job for same quotation/version

---

## 4. Production AI provider

Keep TranslationPort abstraction.

Local development:

Ollama.

Production can use:

- OpenAI
- Gemini
- Google translation provider
- future provider

Provider choice must not leak into quotation domain logic.

---

# Phase 2 — Quotation/PDF final polish

Status: **Partially delivered through Phase 1.4**

Delivered: Unicode bidi-aware Arabic mixed text and money/percentage rendering,
approval identity, signature/stamp assets, preset branding themes, letterhead
safe areas, approval snapshots and public verification QR.

## 1. Arabic money direction

Delivered in Phase 1.4:

Arabic PDF totals may visually reorder:

- currency
- minus sign
- amount

The Unicode bidi-aware renderer preserves Arabic reading order and LTR numeric,
currency and percentage runs without reversing whole strings.

---

## 2. Approver identity

Delivered in Phase 1.4 using approval identity and company-configured signature
and stamp assets, with safe fallback behavior when an image is absent.

Still optional for a future configurable approver profile:

- approver name Arabic
- approver name English
- approver role Arabic
- approver role English
- approver phone
- optional signature image

PDF should use configured company approver data.

---

## 3. Logo support

Current guarantee:

VOKA draws no background/card behind company logo.

Still deferred:

- WebP decoding compatibility in the PDF pipeline. PNG/JPEG are supported;
  WebP is currently rejected by company image validation.
- optional transparency validation

---

## 4. Custom branding

Still deferred. Preset themes are delivered; arbitrary custom branding is not.

- custom primary HEX
- custom accent HEX
- possibly reusable document brand profile

Use same branding system for future:

- invoices
- proposals
- emails
- portal

---

## 5. Dynamic BOQ pagination

Still deferred. The current branded proposal intentionally renders exactly two
pages (cover plus BOQ/terms). General continuation across additional BOQ pages
requires a separate layout and acceptance-test slice.

---

# Phase 3 — Proposal composer UX

Status: **Delivered and closed through PR #31 (`6ff9762`)**

Delivered quotation creation/editing flow:

- single active language experience with inactive-locale preservation
- clear localization status
- catalog/custom line editor with descriptions and accessible reordering
- discounts and canonical tax/totals integrity
- scope, notes, terms and quotation validity
- authenticated preview and deterministic PDF
- approval state and approval-time document behavior
- email, combined Email + WhatsApp, and failed-channel retry UX

Delivery history: PRs #21-#31, from active-language UX (`627d467`) through
final Create/Edit line parity (`6ff9762`). The sequence also delivered validity,
preview, delivery audit/provider readiness, Resend email, Meta WhatsApp provider
code, Both/retry UX and tax/totals integrity.

Meta live-account credentials, phone-number setup and approved-template
configuration remain deferred; the provider implementation itself is complete.

---

# Phase 4 — Approval and document lifecycle

Status: **Delivered through Phase 4.3 / PR #39**

Phase 4 now covers the first complete downstream Sales Order operational
boundary after quotation approval.

Delivered:

- approved quotation → exactly one tenant-owned Sales Order;
- immutable quotation-derived customer, line, tax, total and approval snapshots;
- DRAFT, CONFIRMED and CANCELLED Sales Order lifecycle;
- confirmation and cancellation audit snapshots;
- tenant-scoped locking / stale-state protection;
- bilingual Sales Order PDF;
- immutable approved-brand inheritance;
- multi-page document pagination;
- internal operational activity notes;
- tenant-safe Sales Order APIs and UI.

Historical Sales Orders must never be dynamically repriced or rewritten from
current Customer, Catalog, Price List, Unit or TaxRate master data.

Still deferred from later phases:

- inventory / warehouse / fulfillment;
- procurement;
- contracts;
- invoices and payments;
- cryptographic document signatures.

---

# Phase 5 — Customer and catalog integration

Status: **Closed through PR #40**

Phase 5 established reusable canonical commercial master data for quotation
composition while preserving historical document snapshots.

Delivered:

- Products and Services remain semantically distinct;
- tenant-safe Product/Service catalog management;
- reusable Arabic/English catalog names and descriptions;
- tenant/shared Units with bilingual values;
- bounded catalog search and pagination;
- operational Products/Services management UI;
- quotation Create/Edit catalog selection parity;
- reusable persisted bilingual values reduce unnecessary AI localization;
- draft-time Price List item resolution where an explicit Price List exists;
- Catalog sale-price fallback where a Price List item is absent;
- zero is treated as a valid price rather than a missing-price sentinel;
- company-scoped Unit symbol uniqueness;
- database partial uniqueness for shared Units;
- tenant-first/shared-fallback Unit lookup;
- catalog deactivation without destroying historical quotation/Sales Order
  meaning;
- historical quotation and Sales Order snapshots remain authoritative.

Canonical Customer snapshot reuse already existed and remains preserved.
Server-side tax and totals authority remains unchanged.

Phase 5 final validation reached 635/635 passing tests across 95 files plus
green GitHub Quality CI.

Phase 6.1 implementation status:

**Text AI Sales Assistant / Structured Draft — merged through PR #42.**

The structured commercial drafting contract is implemented and has passed
local semantic review, TypeScript, 651 regression tests, lint, and production
build validation. PR #42 then passed Quality CI and was merged to main.

Phase 6.2 implementation status:

**Voice Input Transport — CLOSED / MERGED through PR #44.**

Merged to `main` through PR #44 at merge commit `0c94f521d07d4a2f78f4eb5d67c60e27ce686772`, based on pre-phase baseline `d19d2bd2e306a7db066532ff873e9af5ed3a8349`.
Voice serves strictly as an input transport feeding speech transcript into the existing Phase 6.1 prompt input field.
Zero audio files persisted, zero backend audio uploads, zero database schema changes. Final validation passed with 103 test files / 666 tests, TypeScript, lint, production build, diff check, and green GitHub Quality #79.
---

# Phase 6 — AI Sales Assistant

## Phase 6.3 — AI Model Routing

Status: **CLOSED / MERGED through PR #46 at `8ad47179408e2753f1ece92aedb8d0e5ab0641d8` after green Quality #83.**

Delivered:

- Ollama Cloud primary routing with local Ollama fallback;
- `minimax-m3:cloud` as primary interactive AI candidate;
- `qwen3:1.7b` as local fallback candidate;
- independent Sales AI and Translation model configuration;
- cloud-aware request profiles without structured-output `format`, forced `num_ctx`, or low `num_predict` ceilings;
- local structured JSON behavior retained where compatible;
- fallback for network, timeout, HTTP, empty output, invalid JSON and truncated generation;
- Sales semantic validation failure can fall back locally before heuristic extraction;
- Translation exact-key validation with fallback;
- no database schema, migration, dependency or paid-provider changes.

Final validation: 42/42 focused tests, 106 files / 708 full tests, TypeScript, lint, production build, diff check and GitHub Quality #83 all passed.

Core invariant remains: AI PROPOSES. SERVER VALIDATES. HUMAN SAVES.

Pipeline:

Voice / text
→ AI extraction
→ structured draft
→ validation
→ human review
→ Save
→ localization
→ proposal/PDF

Voice is a transport/input feature, not part of PDF generation.

The PDF renderer remains deterministic and AI-free.

---


## Phase 6.4 — Product Integrity & Stabilization

Status: **CLOSED / MERGED through PR #54 at `20c83d9c034189cbf40f907840fdaa81847c100b`.**

Phase 6.4 was inserted after real UI validation exposed product-integrity gaps
that had to be closed before Phase 7. The stabilization sequence is now closed.

### 6.4A — Localization Integrity

Status: **CLOSED / MERGED through PR #48 at `32823da495d7564c810b1479bb0133b11741e905`.**

Delivered:

- verified localization completion integrity;
- required translation-target validation;
- requested-locale serialization without masking broken completed content;
- bounded repair path for broken editable DRAFT quotations;
- read-only GET integrity detection;
- explicit controlled localization mutation endpoint;
- APPROVED immutability preserved;
- no schema, migration, or dependency changes.

Final validation: 8/8 focused Phase 6.4A tests, 22/22 Phase 6.3 routing tests, 107 files / 716 tests full regression, TypeScript, lint, production build, diff check, and GitHub Quality all PASS.

### 6.4B — Customer Master Data

Status: **CLOSED / MERGED through PR #50, with bilingual Customer UX completion
through PR #51 at `fceba986768d09a69cb1c74fd7c90d62f2c53feb`.**

Delivered boundary:

- automatic tenant-safe Customer code generation;
- bilingual Customer master-data naming;
- preservation of existing Customer authority and downstream historical snapshots.

### 6.4C — Delivery Configuration & UX

Status: **CLOSED / MERGED through PR #52 at
`a95dd42d32fed7022f006d1f4489c8715261dea9`.**

Delivered provider/configuration readiness visibility and delivery UX without
falsely enabling unavailable channels.

### 6.4D — Dense Quotation Composer UX

Status: **CLOSED / MERGED through PR #54 at
`20c83d9c034189cbf40f907840fdaa81847c100b`.**

Delivered the dense quotation composer UX and completed the Phase 6.4 merge
sequence.

---

# Phase 7 — Commercial Documents & Receivables

Status: **Phase 7A & Phase 7B.1 Contract MVP Delivered in handoff branch.**

The governing decision is
[ADR-010: Commercial Document Lifecycle](ADR-010-COMMERCIAL-DOCUMENT-LIFECYCLE.md).
Quotation-first is the recommended/default guided workflow where applicable,
not a mandatory technical dependency. Direct Contract and Direct Invoice are
first-class workflows. Quotation, SalesOrder, Contract, Invoice and Payment
remain semantically distinct aggregates.

## 7A — Commercial Document Foundation

- **DELIVERED**: shared document provenance/origin semantics (`DIRECT`, `QUOTATION`, `SALES_ORDER`, `CONTRACT`);
- **DELIVERED**: domain document kinds (`QUOTATION`, `SALES_ORDER`, `CONTRACT`, `INVOICE`, `PAYMENT`);
- **DELIVERED**: shared commercial snapshot primitives (`CommercialCustomerSnapshot`, `CommercialLineSnapshot`, `CommercialTotals`);
- **DELIVERED**: focused domain unit tests.

## 7B — Contracts

- **DELIVERED (7B.1 MVP)**: direct Contract creation;
- **DELIVERED (7B.1 MVP)**: optional upstream-source Contract provenance support;
- **DELIVERED (7B.1 MVP)**: terms, duration, milestones and installments model;
- **DELIVERED (7B.1 MVP)**: immutable Contract snapshots & server-authoritative totals;
- **DELIVERED (7B.1 MVP)**: Prisma schema & forward migration, repository, use cases & authenticated APIs.

## 7C — Invoices

- direct Invoice creation;
- upstream-source Invoice creation where applicable;
- immutable Invoice snapshots;
- server-authoritative totals, tax and currency.

## 7D — Payments & Receivables

- partial and full Payments;
- Invoice settlement state;
- Payment history and audit;
- no silent financial mutations.

## 7E — Document Conversion / Orchestration

- explicit supported conversions between commercial documents;
- provenance preservation;
- idempotency and duplicate prevention;
- human-controlled consequential actions.

This roadmap does not promise a conversion until its source/target lifecycle,
authorization, snapshot and idempotency rules have been designed and approved.

---

# Phase 8 — Notifications and sending

Status: **Partially delivered through PRs #25-#29**

Delivered sending workflow:

- Resend email delivery
- Meta WhatsApp Cloud API provider code
- Email, WhatsApp and Both-channel orchestration
- sending status and delivery audit records
- failure history and retry of failed channels
- approved/sent document snapshot safeguards

Still deferred:

- live Meta account credentials, phone-number registration and approved
  template configuration
- production environment rollout/monitoring decisions outside application code

Never silently mark a document sent if external delivery failed.

---

# Phase 9 — Permissions and audit

Finalize role rules:

- OWNER
- ADMIN
- SALES
- VIEWER

Ensure tenant scoping on every repository/API operation.

Add audit history for sensitive commercial actions.

---

# Phase 10 — Production readiness

Before V1 release:

## Engineering

- full typecheck
- full test suite
- database migrations
- Prisma generation
- production build
- no debug instrumentation
- no sensitive files tracked
- environment documentation
- backup/restore procedure
- error monitoring

## Performance

Measure:

- quotation Save
- quotation load
- PDF generation
- localization queue
- dashboard
- customer/product search

Interactive Save should remain independent from AI latency.

## Security

Review:

- secrets
- authentication
- authorization
- tenant isolation
- API validation
- rate limiting where appropriate
- file/logo validation
- upload limits

Safe transitive hardening was merged through PR #19 at `23c2d2f`. Remaining
Next 15 nested PostCSS/Sharp findings require a planned Next 16 migration or
unsupported overrides. Track the supported framework migration as an
engineering/security workstream; do not treat it as the next product feature.

---

# Phase 11 — Final UX / design pass

Only after functionality is stable:

- Arabic RTL polish
- English LTR polish
- mobile
- responsive tables
- loading states
- toast messages
- empty states
- error messages
- PDF typography
- spacing
- money formatting
- visual consistency

Re-verify Arabic PDF typography and money formatting during the final UX pass;
the Phase 1.4 bidi defect itself is closed.

---

# Phase 12 — V1 release

Release checklist:

1. clean feature/checkpoint history
2. create proper feature PR
3. CI green
4. review migrations
5. review production environment variables
6. staging smoke test
7. create sample quotation Arabic
8. create sample quotation English
9. create PDF
10. send
11. approve
12. verify downstream flow
13. backup database
14. release
15. monitor logs/errors

Important: Phase 5 is closed on `main` at
`55ef31e4fba7b38d0225aeb1296c7f1712fea38c`.

Phase 6.1 Text AI Sales Assistant / Structured Draft is merged on `main` through PR #42 after green Quality CI.
Phase 6.2 Voice Input Transport is CLOSED / MERGED through PR #44 at `0c94f521d07d4a2f78f4eb5d67c60e27ce686772`.
Phase 6.3 AI Model Routing is CLOSED / MERGED through PR #46 at `8ad47179408e2753f1ece92aedb8d0e5ab0641d8` after green Quality #83.
Phase 6.4 Product Integrity & Stabilization is CLOSED / MERGED through PR #54 at
`20c83d9c034189cbf40f907840fdaa81847c100b`.
The next bounded product step is Phase 7A — Commercial Document Foundation,
governed by [ADR-010](ADR-010-COMMERCIAL-DOCUMENT-LIFECYCLE.md).

<!-- ADR-011-UCL-ROADMAP -->

## Universal Commercial Library — Approved Architecture Track

Status: **UCL-1 THROUGH UCL-6 CLOSED / MERGED TO MAIN AT `42832749399ca9c9c22e2a8a908f4ea5c88b57c6`; REAL-DATA SOURCE SELECTION UNDER CTO REVIEW; UCL-7 NOT STARTED.**

The Universal Commercial Library is an approved long-term VOKA capability.

This track does not replace the existing Company Catalog.

Target architecture:

Universal commercial knowledge
-> bounded retrieval
-> tenant adoption
-> Company Catalog
-> commercial documents and historical snapshots.

Mandatory performance contract:

- no full catalog fetch;
- bounded server-side search;
- indexed retrieval;
- pagination or cursor continuation;
- lazy loading;
- optional virtualization for large UI result sets;
- small AI candidate retrieval rather than full-catalog prompts;
- caching where safe;
- optional hybrid lexical / semantic retrieval.

Implementation sequence:

1. **UCL-1 — global identity, taxonomy, provenance, adoption and retrieval contracts (DELIVERED).**
2. **UCL-2 — Brand, Manufacturer, models, variants, aliases, identifiers and structured attributes (MERGED).**
3. **UCL-3 — ingestion, normalization, entity resolution, quality and confidence (MERGED; no external data ingested).**
4. **UCL-4 — hybrid Company Catalog + Universal Library AI retrieval (MERGED).**
5. **UCL-5 — search intelligence, optional semantic boundary with lexical production fallback, caching, hybrid ranking, observability and synthetic bounded-retrieval contract validation (MERGED IN PR #64).**
6. **UCL-6 — controlled external data acquisition and source governance (MERGED IN PR #65).**

Real-data source qualification after UCL-6 is evidence gathering, not UCL-7.
Wikidata remains a possible supplemental taxonomy/reference source after mapping
review. Open Icecat is technically useful only as a supplementary identity and
specification source, and its current license is not approved for direct VOKA
production generative-AI use.

Before any next pilot, the CTO must select one bounded option: a stratified
500-record Building analysis, Industrial/Lab vertical `2835`, ETIM
qualification, or manufacturer feeds. No option is selected by this roadmap.
See [UCL Source Strategy](UCL_SOURCE_STRATEGY.md) and
[UCL Pilot Index](UCL_PILOT_INDEX.md).

No UCL implementation phase may weaken existing tenant isolation, pricing,
taxation, document snapshot or historical integrity guarantees.

Architecture source:
`docs/ADR-011-UNIVERSAL-COMMERCIAL-LIBRARY.md`.
