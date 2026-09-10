# Phase 4E — Big V1 Closure Sprint

Date: 2026-09-10

## 1. Authoritative base

- Authoritative product branch: `arena/01a085bc-voka`
- Authoritative integrated HEAD: `f75b0c75fa376d5ab354f2ad1471747e4ec7bb1a`
- This HEAD already contains P1 (Sales Order localization), P2 (Company Settings
  localization/chrome), and P3 (Invoice commercial source picker); Phase 4D is
  closed. Verified via `git fetch origin arena/01a085bc-voka` →
  `FETCH_HEAD == f75b0c75…`.

## 2. Arena execution branch

- `arena/01a08bf6-voka` (disposable execution infrastructure).
- Aligned to the authoritative commit with `git reset --hard f75b0c75…`.
- The authoritative branch `arena/01a085bc-voka` was NOT modified or pushed.
- Pre-sync working changes were preserved via
  `git stash push -u -m "PRE_AUTHORITATIVE_SYNC_20260910"` (kept in stash list).

## 3. DB environment verification

- No `.env.local` or `.env` is present in this execution sandbox (only
  `.env.example`). No real `DATABASE_URL` / `SHADOW_DATABASE_URL` exists here.
- DB HOST: not available in this environment
- DB PORT: not available in this environment
- DB NAME: not available in this environment
- Consequence: `npx prisma migrate status` cannot run (no `DATABASE_URL`), and
  `npx prisma generate` cannot complete because Prisma engine binaries cannot be
  downloaded (network to `binaries.prisma.sh` is blocked).
- No credentials were invented. DB data and schema were left completely
  untouched. No migrate/seed/reset commands were run.

## 4. Exact issues closed

### Group A — Shared dashboard chrome
- Sidebar tagline "AI Sales OS" now localizes in Arabic to
  "نظام تشغيل المبيعات بالذكاء الاصطناعي" (English unchanged).
- Sidebar leftover technical jargon descriptions removed:
  - Customers: "CRM" → "Customer records" / "سجلات العملاء".
  - Drawing Takeoff: "CCTV / Low Voltage" → "Quantity takeoff" /
    "حصر الكميات من المخططات".
- Sidebar footer unexplained initials "VO" → single brand initial "V"
  (`aria-hidden`); Header fallback initials "VO" → "V" for consistency.
- Navigation consistency: added Reports to the Sidebar (it previously appeared
  only in the Header mobile nav) and added Products & Services to the Header
  mobile nav (previously only in Sidebar + Command Center). Reports is a real
  route (`app/dashboard/reports`); no dead routes introduced.
- Command Center lifecycle separator arrow was hardcoded `→`; now direction-aware
  (`←` in Arabic RTL, `→` in English). The "Open workspace" arrow was already
  direction-aware and left as-is.
- `app/dashboard/page.tsx`: removed dead `LegacyDashboardPage` code (never the
  default export; carried stale hardcoded `→` and English-only card copy). The
  route still renders the live `DashboardCommandCenter` — no behavior change.

### Group B — Catalog localization polish
- Arabic grammar fix: eyebrow "الكتالوج التجارية" → "الكتالوج التجاري".
- Localized English-only catch fallbacks that leaked in Arabic:
  `"Load failed"` and `"Save failed"` now go through `t()`.
- "SKU:" retained as a legitimate technical acronym; surrounding header remains
  intentionally localized (`t("الكود / SKU", "Code / SKU")`). XLSX
  import/export behavior untouched.

### Group C — Drawing Takeoff XLSX localization
- `app/api/drawing-takeoffs/[sessionId]/xlsx/route.ts` previously localized only
  the worksheet tab names; all Summary labels, BOQ headers, and status/enum
  values were hardcoded English. Now:
  - Summary row labels and BOQ headers use the route's existing `t()` helper.
  - Worksheet names localized ("Summary"/"ملخص", "BOQ"/"جدول الكميات").
  - Enum values (status, quantity provenance, human review state) rendered via
    the existing `displayLabel(value, locale)` helper; booleans via localized
    Yes/No. IDs remain raw values; only labels are localized.
  - Workbook structure, columns, number formats, RTL view flag, and autofilter
    preserved. Drawing OCR/extraction and the snapshot builder were not touched.

### Group D — Delta AR/EN leak sweep (bounded, non-frozen)
- Localized English-only error catch fallbacks that leaked in Arabic on live
  non-frozen surfaces:
  - `contracts/page.tsx` ("Unknown error"), `contracts/new` ("Load failed",
    "Create failed"), `contracts/[id]` ("Load failed"),
    `contracts/[id]/edit` ("Load failed", "Save failed").
  - `payments/page.tsx` ("Load failed", "Payment failed").
  - `invoices/page.tsx` ("Error"), `invoices/[invoiceId]/page.tsx` ("Error" ×3),
    `invoices/[invoiceId]/edit/page.tsx` ("Load failed").
- Deliberately left untouched: `sales-orders/[salesOrderId]` (P1-owned) and
  `invoices/new` (P3-owned) to respect the regression-guard boundary. These
  remain candidate follow-ups (see remaining issues).

### Group E — Settings follow-up verification (no change)
- Confirmed P2 is correctly integrated: consolidated `deliveryLabels`, clean
  Arabic delivery labels, Email/WhatsApp title-case, no nested full-page settings
  chrome. Left as-is.

### Group F — P1/P3 regression guard (no change)
- P1: Sales Orders list uses `displayLabel` for DRAFT/CONFIRMED/CANCELLED (no raw
  enums). Verified by existing tests.
- P3: Invoice New uses `CommercialSourcePicker` for QUOTATION/SALES_ORDER (no raw
  DB ID input), preserves exact `{ sourceKind, sourceId }` POST contract, clears
  selection on origin switch, and keeps the direct flow. Verified by 7 existing
  tests.

## 5. Files changed

Source:
- `components/dashboard/Sidebar.tsx`
- `components/dashboard/DashboardHeader.tsx`
- `components/dashboard/command-center/DashboardCommandCenter.tsx`
- `app/dashboard/page.tsx`
- `app/dashboard/products/page.tsx`
- `app/api/drawing-takeoffs/[sessionId]/xlsx/route.ts`
- `app/dashboard/contracts/page.tsx`
- `app/dashboard/contracts/new/page.tsx`
- `app/dashboard/contracts/[contractId]/page.tsx`
- `app/dashboard/contracts/[contractId]/edit/page.tsx`
- `app/dashboard/payments/page.tsx`
- `app/dashboard/invoices/page.tsx`
- `app/dashboard/invoices/[invoiceId]/page.tsx`
- `app/dashboard/invoices/[invoiceId]/edit/page.tsx`

Tests:
- `components/dashboard/__tests__/Sidebar.test.tsx` (extended)
- `components/dashboard/command-center/__tests__/DashboardCommandCenter.test.tsx` (extended)
- `app/dashboard/products/__tests__/page-localization.test.tsx` (new)
- `app/api/drawing-takeoffs/[sessionId]/xlsx/__tests__/route.test.ts` (new)

## 6. Tests

- Focused suite for touched areas: 67 passing / 0 failing across 15 files,
  including P1 (sales-orders), P3 (invoices/new — 7 tests), P2 (settings),
  chrome (Sidebar/CommandCenter), catalog, and takeoff XLSX.
- New/updated tests specifically cover: AR/EN Sidebar tagline, no leftover
  CRM/CCTV jargon, Reports destination present, direction-aware lifecycle arrow
  (LTR/RTL), catalog Arabic grammar + localized error state, and takeoff XLSX
  EN/AR labels + localized status + RTL flag + workbook still opens.

## 7. Typecheck

- `npm run typecheck`: 169 pre-existing errors, ALL caused by the missing
  generated Prisma client (`lib/generated/prisma/client`) which cannot be
  generated in this network-restricted environment. None are in the files
  changed by this sprint. FAIL is environment-only.

## 8. Build

- `npm run build`: DEFERRED — ENVIRONMENT ONLY. Fails solely due to (a) missing
  generated Prisma client and (b) `next/font` requiring network access — both
  environment/network blockers unrelated to this sprint's changes.

## 9. Migrate status

- Not run: no `DATABASE_URL` available in this sandbox. DB untouched.

## 10. Remaining V1 issues

1. Environment: generate Prisma client + real HOME `DATABASE_URL` so
   typecheck/build/migrate-status can actually pass on a real HOME machine.
2. Extend the AR/EN error-fallback localization into the P1-owned
   `sales-orders/[salesOrderId]` and P3-owned `invoices/new` catch strings
   (left untouched here to respect the regression-guard boundary).
3. Broader untested surfaces (customers pages, universal-library UI) were out of
   scope for this bounded sprint and can be swept next.

## 11. Frozen-area proof

- `git status --short` shows only shared-chrome, catalog, takeoff-xlsx,
  contracts, payments, and invoice list/detail files plus their tests.
- No changes under `app/dashboard/sales-assistant/**`, Sales Assistant APIs,
  `src/application/conversation-runtime/**`, StrictBrain, governed workspace,
  Quotation UI/APIs/domain/application/repositories/tests/renderer, Data Factory,
  or UCL content. Verified by a negative grep over the changed-file list.

## 12. Recommendation for next product slice

- Provision a real HOME environment (Prisma client generated + `.env.local` with
  `DATABASE_URL`) and re-run the full `typecheck`/`build`/`migrate status` gate to
  formally certify this sprint, then proceed to the next bounded AR/EN polish
  slice (P1/P3-owned error fallbacks + customers/universal-library UI). Do NOT
  start Logo Studio, independent Sales Order creation, or Drawing→Quotation.
