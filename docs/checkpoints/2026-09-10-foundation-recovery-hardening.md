# Foundation recovery hardening — 2026-09-10

Recovery hardening of the unaccepted Requirement + Evidence + Attachment foundation
(`f95954baed874c20009597be3af55bd1f1591027`). Accepted baseline remains `e46857f`.
Executed on isolated Arena branch `arena/01a08d38-voka`; authoritative branches were
not modified, nothing was merged, no force push. Hardening only: no redesign, no
Supplier/RFQ/PO/Procurement/Messaging/OCR/Vision product work.

## Fixed defects

1. **Citation ordering** — inspection reads citations `orderBy [{pageNumber asc}, {observedAt asc}]`; the
   schema has no `createdAt` on `Citation`.
2. **Attachment-only submission** — `resolveTurnIntent` yields `ATTACHMENT_ANALYSIS` when a turn carries
   a server-issued artifact id and no text. The API accepts it (still 400 when there is neither text nor
   a valid attachment id). The runtime forces one bounded inspection (`BOQ_INSPECTION` for PDF text,
   `ATTACHMENT_INSPECTION` otherwise) with a fixed internal query, records the user timeline entry as
   `📎 Attachment: <name>` tagged `intent: "ATTACHMENT_ANALYSIS"` (never fake prose), and replies from
   the inspection outcome. Text + attachment behaviour is unchanged.
3. **Requirement identity** — `requirementStableKey(context, runtimeId, structuralKey)` →
   `<context>:runtime:<runtimeId|none>:<fact:key | component:system:id | artifact:id:boq:n>`, unique per
   tenant via `[companyId, stableKey]`. Stable across edits in one conversation, isolated across
   conversations; no random ids, no description-text keys.
4. **Citation linkage** — BOQ line ↔ citation only when the line text is found on exactly one page and
   exactly one citation proves that page; runtime requirement ↔ citation only when the citation's claim
   text names the requirement value; foreign/unowned citations are never linked; uncertain → unlinked.
5. **Shared storage** — content-addressed store has no delete API; ingest never removes bytes on failure;
   `put` is atomic (tmp + rename) and duplicate-hash safe; a unique-constraint race returns the existing
   tenant record idempotently.
6. **PDF truthfulness** — no text → `TEXT_NOT_EXTRACTABLE` (no citation); page numbers only for
   single-page or explicit form-feed page breaks, otherwise `pageNumber: null`; never invents page 1.
7. **Localization test** — the reintroduced eslint suppression line is removed; file is byte-identical to
   `e46857f` (Arabic encoding untouched).
8. **Migration/schema drift** — `@@index([companyId, sourceArtifactId])` added to `DrawingTakeoffSession`
   to match the earlier migration; new additive migration adds the enum value `TEXT_NOT_EXTRACTABLE`.
   No destructive operations, no reset/seed/db push.
9. **Vehicle Elevator authority** — one governed authority. Same-turn AI counter-proposals that
   contradict a verbatim user fact are now `REJECTED (CONTRADICTS_VERBATIM_USER_STATEMENT)` instead of
   parking as pending and riding a later blanket approval. Engineering/product patches for the vehicle
   system are dropped. Honest `readiness.engineeringState` (`SYSTEM_KNOWN` / `REQUIREMENTS_PARTIAL` /
   `ENGINEERING_REVIEW_REQUIRED` / `BOM_RESOLVED`) is exposed and rendered; no invented BOM.
10. **Takeoff linkage** — a deduplicated session is linked to the SourceArtifact only when the existing
    link is null and tenant + `sourceSha256` match (`updateMany` guarded by companyId + sha + null); never
    by filename; manual review, explicit confirmation and Takeoff → Quotation are preserved.

Also: quotation handoff copies only customer-facing evidence (`USER_VERIFIED`, `VERIFIED_DOCUMENT`,
`VERIFIED_DATABASE`, `VERIFIED_AUTHORITY`) from `COMPLETED` observations into notes;
`RECEIVED_NOT_USER_VERIFIED` stays internal.

## Validation

Focused Vitest (source-artifact infra/app, source-artifact/drawing-takeoff/conversation-runtime API
routes, conversation-runtime, infrastructure/ai, sales-assistant components and page, products
localization, commercial-conversation): 59 files / 474 tests passed (5 legacy files already skipped).
`prisma validate` + `prisma generate` OK (offline engine stub, no DB access). `tsc --noEmit` green
(red with 4 errors at the recovery base). `git diff --check` clean. `next build` green with an offline
`next/font` mock (Google Fonts unreachable in the sandbox; the only warning is the pre-existing `jose`
Edge notice).

## Still not implemented

OCR / drawing vision, Requirement review UI, object storage, Supplier / RFQ / PO / Procurement /
Messaging. Migration must be applied in the target environment (`prisma migrate deploy`).
