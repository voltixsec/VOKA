# Phase 4E readiness audit — 2026-09-10

Arena branch: `arena/01a085bc-voka`  
Audit START HEAD: `a9103bc1c4d6387868592b8c9d9bab17e48897fc`  
Phase 4D software: **CLOSED** (do not reopen).  
UCL production JSONL: not in Git. Data Factory PAUSED. Quotation + Sales Assistant **FROZEN**.

This document is audit + plan only. No product implementation.

## 1. Current HEAD

`a9103bc1c4d6387868592b8c9d9bab17e48897fc` — `docs(phase4d): close office session and prepare home resume`

## 2. Phase 4D closed status

A–E PASS. C CEO visual PASS. F installer PASS. UCL **content** not materialized. Do not treat empty Security items as a 4E localization task.

## 3. Localization findings (human-visible, non-frozen)

Severity: P1 = user-facing wrong language or raw enum; P2 = mixed chrome / a11y; P3 = polish.

| ID | Path | Locale | Problem | Sev | Bounded fix | Frozen? |
| --- | --- | --- | --- | --- | --- | --- |
| L1 | `app/dashboard/sales-orders/page.tsx` `renderBadge` | EN | Badges show `DRAFT` / `CONFIRMED` / `CANCELLED` (filters already say Draft/Confirmed). | P1 | Use `t("مسودة","Draft")` already used in filters, or `displayLabel`. | No |
| L2 | same file `load()` | AR | Thrown `"Unable to load Sales Orders"` then AR card copy; catch can still show English. | P1 | Localize throw; never surface API English. | No |
| L3 | `components/dashboard/Sidebar.tsx` | AR | Brand line always `AI Sales OS`; footer `VO` initials. | P2 | Localize tagline; keep VOKA. | No |
| L4 | `app/dashboard/settings/company/page.tsx` | EN | Headings `EMAIL` / `WHATSAPP` shout-case. | P2 | Title case like Arabic cards. | No |
| L5 | same | AR | Mixed English: `رمز الوصول Access Token`, `معرّف رقم الهاتف Phone ID`, `Graph API`. | P1 | Arabic-only labels; keep values as values. | No |
| L6 | same | both | `alt="Brand preview"` / `alt="Company logo"` not localized. | P2 | `t()`. | No |
| L7 | `app/dashboard/invoices/new/page.tsx` | both | Quotation origin uses raw **Quotation ID** text field (SO already has picker). | P1 | Number/search picker like `SalesOrderPicker`; do not show cuid. | No (invoice new only) |
| L8 | `app/api/drawing-takeoffs/[sessionId]/xlsx/route.ts` | AR | XLSX summary keys hardcoded English (`Takeoff ID`, `Quotation ID`, …). | P1 | Mirror PDF bilingual labels already used on takeoff UI. | No |
| L9 | `app/dashboard/products/page.tsx` | both | Table cell `SKU:`; catch `"Load failed"` / `"Save failed"` English. Grammar: `الكتالوج التجارية`. | P2 | Localize SKU prefix; catch `t()`; `الكتالوج التجاري`. | No |
| L10 | `app/dashboard/page.tsx` unused `LegacyDashboardPage` | — | Dead EN/AR cards; live UI is Command Center. | P3 | Delete later; not a live leak. | No |
| L11 | `components/dashboard/DashboardHeader.tsx` vs Sidebar | both | Header includes Reports; Sidebar omits Reports (and Sales Assistant). | P2 | Align nav; do not hide Reports. | No |
| L12 | Sidebar descriptions | EN | `CRM`, `CCTV / Low Voltage` leftover jargon. | P3 | Match Command Center copy. | No |

`lib/i18n/display-labels.ts` already maps commercial statuses (ISSUED, PARTIALLY_PAID, SUPPLY_AND_INSTALLATION, PRODUCT, …). **Use it** instead of new dictionaries. Invoices/contracts/payments/signatories already call it. Sales Orders list does not.

Frozen Sales Assistant / Quotation files were **not** audited for implementation. Known historical: SA tests assert no `SUPPLY_AND_INSTALLATION` in UI.

## 4. UX consistency (polished V1 blockers only)

1. **Nav mismatch:** Sidebar vs header vs Command Center (Reports, Payments, Drawing, voice CTA).
2. **Primary CTAs:** Catalog `+ Add Product` vs invoices/customers more formal; empty-state vs header buttons differ.
3. **List vs table:** Customers/catalog use tables; SO/invoices/contracts mix cards. Acceptable if badges/search/pagination match — they almost do except SO badges.
4. **Invoice create:** SO picker vs quotation ID field is the worst workflow inconsistency.
5. **Settings page** is a full `min-h-screen` nested layout (double chrome) vs other dashboard pages.
6. **RTL:** most pages set `dir`; Sidebar `border-e` is OK. Hardcoded `→` in Command Center lifecycle is LTR-biased (use logical arrow or `←` in AR).
7. **Pagination:** Prev/Next + `page / totalPages` is consistent enough.
8. **Dashboard KPIs:** Command Center uses `/api/dashboard/summary` (live). Legacy `—` cards are unused.

Do not redesign.

## 5. Raw enum leaks (human-visible only)

Deduped **actual UI leaks** (values as form `value=` / API bodies excluded):

1. Sales Order list EN badges: `DRAFT`, `CONFIRMED`, `CANCELLED`.
2. Settings delivery: `EMAIL`, `WHATSAPP`, provider token `RESEND`/`META` if configured (shown as provider name).
3. Invoice new: user types quotation **internal id**.
4. Takeoff XLSX: English schema + `s.status` raw if not mapped.
5. Catalog table: literal `SKU:`.

**Not leaks (already labeled):** invoice list `displayLabel(status/settlement)`; contract list; payment method; signatory document types; catalog Product/Service badges; customer Lead/Active options; invoice origin select options.

**Internal only:** `CommercialComposerMode`, API error codes (if UI maps messages). API `error.message` English can leak if pages `throw new Error(payload.error.message)` — company settings and signatories do this.

Count of confirmed visible leaks: **5 clusters** (SO badges, settings shout/mixed, quotation ID field, takeoff XLSX, catalog SKU/errors).

## 6. Module completeness map

| Module | List | Create | Edit | Detail | Archive/delete | Export | i18n | Pages | Perms | Tests | Blocker |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Customers | Y | Y | Y | Y + statement | status not hard-delete | statement PDF/XLSX | dual `t()` | Y | company auth | list tests | none 4E |
| Catalog | Y | modal | modal | — | deactivate | XLSX D/E PASS | dual + fallback | Y | Y | panel tests | none |
| Universal Library | operator + tenant adopt | bulk import control-plane | review | published | N/A | — | dual | Y | platform vs tenant | UCL suite | **content** not 4E |
| Invoices | Y | Y (direct/Q/SO) | Y | Y | void path exists | PDF C PASS | dual | Y | Y | list/new tests | quotation ID UX |
| Contracts | Y | Y direct | Y | Y | — | PDF C PASS | dual + displayLabel | Y | Y | — | none 4E |
| Sales Orders | Y | **from quotation only** | read-only lines | Y | cancel | PDF | badges leak EN | no `/new` | GET list | list tests | independent create = new slice |
| Payments | register | from invoice | — | list | — | — | displayLabel | Y | Y | 4C closed | none |
| Statements | customer 360 | — | — | Y | — | PDF/XLSX | dual | Y | Y | — | none |
| Dashboard | Command Center | — | — | — | — | — | dual | Y | Y | — | KPI live via summary |
| Company Settings | identity + assets + terms + delivery status | — | PATCH | — | — | — | dual | Y | OWNER/ADMIN | page tests | Logo Studio not a blank |
| Frozen | Quotations, Sales Assistant | — | — | — | — | — | — | exist | — | — | **do not touch** |
| Drawing | takeoff sessions | PDF upload | line review | — | — | PDF/XLSX | UI dual; XLSX EN | Y | Y | reporting tests | no quotation handoff UI |

## 7. Next 3 implementation slices (Arena-sized)

**Do not start tonight.** Prefer visible quality over Logo Studio / independent SO / Drawing.

### P1 — Sales Order list localization (30–45 min)

- **Objective:** EN badges + AR error path use human labels.
- **Files:** `app/dashboard/sales-orders/page.tsx` (+ list tests if present).
- **AC:** EN shows Draft/Confirmed/Cancelled; AR never shows those English tokens or `Unable to load Sales Orders`; filters unchanged.
- **Tests:** sales-orders page/list tests if any; otherwise add 1 render test.
- **Risk:** low. **CEO visual:** no (list only).

### P2 — Settings chrome leaks (45–60 min)

- **Objective:** Remove shout-case EMAIL/WHATSAPP and AR+EN mixed token labels; localize img alts.
- **Files:** `app/dashboard/settings/company/page.tsx` (+ existing page tests).
- **AC:** AR labels contain no `Access Token` / `Phone ID`; EN headings title case; alts localized.
- **Risk:** low. Do not change delivery env behavior. **CEO visual:** optional.

### P3 — Invoice quotation origin picker (60–90 min)

- **Objective:** Replace quotation ID text field with number/search picker (mirror `SalesOrderPicker`).
- **Files:** `app/dashboard/invoices/new/page.tsx`, likely `components/commercial/` new small picker, existing invoice-new tests.
- **AC:** User never types cuid; eligible approved quotations listed by number/customer; DIRECT/SO paths unchanged.
- **Risk:** medium (API list filter). **Not frozen** if quotation **pages** untouched. **CEO visual:** yes.

**Not P1–P3:** Logo Studio (foundation exists), independent SO (domain gap), Drawing OCR (out of V1).

## 8. Phase 4E: one sweep vs multiple slices

**B — several bounded module slices.**

Reason: copy is inline `t(ar,en)` across pages, not one `locales/*.json` (those files are tiny public-site keys). A single sweep would touch frozen-adjacent commercial composers and fail testability.

Suggested 4E order after P1–P3:

1. Shared chrome (Sidebar/Header/Command Center arrows).
2. Commercial lists remaining (takeoff XLSX, reports if any).
3. Catalog leftover SKU/errors.
4. Settings nested-layout / delivery copy remainder.

Stop between slices. CEO visual only on documents already PASS — do not reopen C.

## 9. Logo Studio readiness — PARTIAL

**Existing:** Settings upload PNG/JPG data-URL for logo (750 KB), letterhead (1.5 MB), signature/stamp (500 KB); `brandTheme`; persist `PATCH /api/companies/current`; commercial PDF `decodeCompanyDocumentImage` / `logoUrl` on Invoice/Contract; quotation PDF frozen uses same company brand snapshot.

**Missing for “studio”:** crop/safe-area, DPI, dark/light variants, dashboard chrome logo, public site, position/scale on PDF, multi-brand.

**V1 MVP:** keep upload + preview + persist + PDF draw. Optional: constrain preview box + empty-state. **Do not build** a design editor, HTTP image fetch, auto-stamp, or VOKA corporate identity redesign (`CEO-R1-007` deferred).

## 10. Independent Sales Order — BLOCKED / PARTIAL

- List + detail + confirm/cancel + PDF exist.
- **No** `POST /api/sales-orders`. Creation is `POST .../quotations/:id/convert-to-sales-order` from **frozen** quotation detail.
- Empty state copy: create from approved quotation.
- Domain: SO is a commercial snapshot of an approved quotation (read-only lines).

Minimum independent create would need new use case, numbering, composer, provenance `DIRECT`, tests — **touches quotation conversion contract**. Do not start as 4E. Treat as later product slice with CEO scope.

## 11. Drawing → commercial — PARTIAL

**Have:** PDF-only upload (15 MB), intent, session persist, human confirm lines, provenance labels via `displayLabel`, takeoff PDF/XLSX, `quotationId` column in export.

**Missing:** OCR/vision provider; catalog match UI; convert-to-quotation button on takeoff page; governed Smart System quantities.

**Smallest realistic V1 (later):** confirmed takeoff → create **quotation draft** lines with `NEEDS_CONFIRMATION` provenance — **would touch frozen Quotation APIs**. Until CEO unfreezes quotation, 4E should only localize takeoff XLSX. No AI provider.

## 12. Recommended first home task

**P1 — Sales Order list localization** on `arena/01a085bc-voka` after `git fetch` + clean tree. Do not start Logo Studio, independent SO, Drawing, or UCL JSONL.

## 13. Acceptance checklist (for the first 4E slice)

- [ ] HEAD is descendant of `a9103bc` on arena branch
- [ ] Frozen quotation/SA paths unchanged (`git diff` those trees empty)
- [ ] No Data Factory / UCL JSONL
- [ ] SO list EN badges are words not enums
- [ ] SO list AR errors Arabic
- [ ] Focused tests only
- [ ] No PR/merge/tag

## Test / build snapshot

Did **not** rerun 2312 tests. Night close: 2312 passed / 50 skipped. This session: `git diff --check` clean. No typecheck/build (docs-only).
