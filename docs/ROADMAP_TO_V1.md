# VOKA — Roadmap to V1 Completion

This document is the continuation plan after Sprint 10B.

---

# Phase 1 — Finish localization lifecycle

## 1. Changed-fields-only localization

Implement target invalidation.

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

Add a proper localization state if needed:

- PENDING
- COMPLETED
- FAILED

Possible metadata:

- localization requested at
- localization completed at
- source locale
- provider/model
- last error

Do not block commercial Save.

---

## 3. Retry strategy

Background AI failure must be retryable.

Possible V1 behavior:

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

## 1. Arabic money direction

Deferred issue:

Arabic PDF totals may visually reorder:

- currency
- minus sign
- amount

Recommended final solution:

draw currency, sign and amount as separate explicit LTR PDF text runs.

Do not continue experimenting with bidi control characters.

---

## 2. Approver identity

Remove temporary hardcoded/fallback identity.

Add Company Settings fields:

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

Future:

- verify PNG
- JPEG
- WebP decoding consistency in PDF pipeline
- optional transparency validation

---

## 4. Custom branding

After five preset themes are stable:

- custom primary HEX
- custom accent HEX
- possibly reusable document brand profile

Use same branding system for future:

- invoices
- proposals
- emails
- portal

---

# Phase 3 — Proposal composer UX

Finalize quotation creation/editing flow:

- single active language experience
- clear localization status
- line editor
- discounts
- tax
- scope
- notes
- terms
- preview
- PDF
- approval state

Remove temporary bilingual editing controls where they conflict with the final one-language-at-a-time UX.

---

# Phase 4 — Approval and document lifecycle

Complete:

Draft
→ Sent
→ Approved / Rejected
→ downstream commercial document

Audit:

- who sent
- who approved
- when
- snapshot/version
- PDF used at approval

Do not regenerate historical approved documents from mutable live data without a snapshot/version strategy.

---

# Phase 5 — Customer and catalog integration

Quotation composer should use canonical:

- customers
- products
- services
- units
- taxes
- price lists

Localization variants should belong to their appropriate entities when reusable.

Avoid retranslating the same catalog product for every quotation.

This can dramatically reduce AI usage.

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

Add production sending workflow:

- email
- optional WhatsApp integration later
- sending status
- failure/retry history
- sent document snapshot

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

Revisit the deferred Arabic PDF totals issue here.

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

Important:

Do not merge the checkpoint branch directly to main.

Prepare a clean feature branch / PR from the verified work when Sprint 10B is formally closed.
