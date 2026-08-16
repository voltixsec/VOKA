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

**Text AI Sales Assistant / Structured Draft — CTO local validation passed.**

The structured commercial drafting contract is implemented and has passed
local semantic review, TypeScript, 651 regression tests, lint, and production
build validation. PR, Quality CI, and merge remain pending.

Voice remains deferred and should reuse this contract as an input transport
rather than creating a separate business workflow.
---

# Phase 6 — AI Sales Assistant

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

# Phase 7 — Contracts and invoices

After quotation approval:

- create contract / order where applicable
- generate invoice
- reuse customer/company/document branding
- preserve quotation references
- preserve currency/tax/discount values

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

Phase 6.1 Text AI Sales Assistant / Structured Draft has passed CTO local
validation. The remaining closure path is PR review, green Quality CI, merge
to `main`, then formal closeout. Voice transport remains deferred.
