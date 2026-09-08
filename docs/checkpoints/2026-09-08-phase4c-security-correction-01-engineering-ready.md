# Phase 4C — Security Correction 01 — Checkpoint

**STATUS: PHASE 4C SECURITY CORRECTION 01 = IMPLEMENTED / OFFLINE FOCUSED VALIDATED / STANDARD VALIDATION PENDING**

- **Date:** 2026-09-08
- **Repository:** `voltixsec/VOKA` · Branch: `feature/pre-staging-product-coherence` baseline (working branch `arena/01a082b5-voka`)
- **Baseline HEAD:** `bb3a00c13b4a02ccde0df3d3fa6aaa063a5f57cb`
- **Status detail:** NOT full "engineering ready" — Prisma Generate, repository-wide TypeScript, production build and DB-backed/full regression were environment-blocked and remain **PENDING** on the dedicated disposable test database (never the office/shared DB).

## Guardrail compliance

- NO Sales Assistant — CEO-FROZEN and untouched.
- NO Quotation — CEO-FROZEN and untouched.
- NO schema change, NO migration, NO `migrate deploy`, NO office/shared database connection (office/shared database was NEVER touched), NO DB-backed test executed.
- NO MERGE. NO TAG.
- Audit document `VOKA_PHASE4C_AUTH_TENANT_SECURITY_AUDIT.md` frozen — not edited in this implementation pass.

## Definitive facts

- 56 focused offline tests PASS.
- `git diff --check` PASS.
- Prisma generate environment-blocked by Prisma engine download failure (`binaries.prisma.sh` unreachable).
- Typecheck/build consequently environment-blocked by the missing generated Prisma client (`lib/generated/prisma/client`); zero errors in any changed/new file.
- DB-backed/full regression PENDING for a dedicated disposable test database (never office/shared).
- D1 / D2 / D3 implemented (platform-admin boundary for acquisition run detail; platform-admin gate for `GET/POST /api/companies`; real dashboard pathname injected through middleware for nested safe returnTo).
- UCL Review mojibake fixed (`Review → Approve / Reject → Publish`).
- D4 deferred / fail-closed (multi-membership active-company selection).
- D5 deferred to Phase 5 Production Hardening (server-side session revocation — requires state/schema, out of Phase 4C scope).
- D6 remains a later bounded live/UX follow-up (client 401 → login redirect parity across pages).
- Payment blocker remains RED (tracked in the Master Product Acceptance Ledger; not addressed by this slice).

---

## Corrections implemented

### D1 — Platform-admin boundary for `GET /api/universal-library/acquisition/runs/[id]` (MEDIUM, CWE-862/639)
**File:** `app/api/universal-library/acquisition/runs/[id]/route.ts`
Changed guard from `withCompanyAuth(["OWNER","ADMIN"])` to the existing platform-admin boundary `withPlatformAdminAuth(["OWNER","ADMIN"])` (identical to the sibling list route `app/api/universal-library/acquisition/runs/route.ts`). Anonymous and ordinary tenant users (including tenant OWNER/ADMIN who are not platform admins) now receive `403 PLATFORM_ADMIN_REQUIRED` instead of being able to read any platform acquisition run by id.

### D2 — Protect `GET/POST /api/companies` (MEDIUM)
**File:** `app/api/companies/route.ts`
Both handlers are now exported through the existing platform-admin boundary `withPlatformAdminAuth(["OWNER","ADMIN"])`:
- Anonymous callers → `401 UNAUTHORIZED`.
- Ordinary tenant users → `403 PLATFORM_ADMIN_REQUIRED` (or `403 INSUFFICIENT_PERMISSIONS` for non-OWNER/ADMIN company roles).
- They can no longer enumerate every active company (`GET`) or create orphan/unowned companies (`POST`).
Business validation and response shapes inside the handlers are unchanged (only re-indented by the wrapper).

### D3 — Inject real protected dashboard pathname through middleware (LOW, nested returnTo)
**File:** `middleware.ts`
Middleware now records the actual requested sub-path as an `x-pathname` request header (`pathname + search`) on every `/dashboard` and `/dashboard/:path*` request, in **all** session branches (valid access, no cookies, refresh success, refresh failure). The server auth gate in `app/dashboard/layout.tsx` reads this header, so a logged-out user who manually enters a deep dashboard URL is redirected to `/login?returnTo=<exact nested path>` and returned there after login. Non-dashboard requests are passed through untouched (no request-header override), preserving prior behavior exactly.

### 4 — UCL Review heading mojibake (cosmetic)
**File:** `app/dashboard/universal-library/review/page.tsx` (line 256)
`Review â†' Approve / Reject â†' Publish` → `Review → Approve / Reject → Publish`.

---

## Regression tests added (offline — no PostgreSQL)

1. `app/api/universal-library/acquisition/runs/[id]/__tests__/route.test.ts` (5 tests, new)
   - route registered behind `withPlatformAdminAuth(["OWNER","ADMIN"])`;
   - non-platform roles → `403 PLATFORM_ADMIN_REQUIRED`, no data access;
   - allowed platform session → `200` run payload, `Cache-Control: no-store`, `getRun(id)` called;
   - missing run → `404 RUN_NOT_FOUND`;
   - over-length run id → `400 INVALID_RUN_ID` before data access.
2. `app/api/companies/__tests__/route.test.ts` (5 tests, new)
   - GET and POST both registered behind `withPlatformAdminAuth(["OWNER","ADMIN"])`;
   - ordinary tenant roles denied (`403`) on GET and POST, repository untouched;
   - allowed platform session lists the active-company directory (`200 {data:[]}`, tenant-scoped query `where {isActive:true}`);
   - allowed platform session still gets payload validation (`400 INVALID_COMPANY_NAME`).
3. `lib/auth/__tests__/session-middleware.test.ts` (+2 tests, total 7)
   - dashboard request → forwarded request carries `x-pathname = /dashboard/customers/123?tab=overview`, valid session not rotated;
   - non-dashboard request → no `x-pathname` injected.

---

## Validation executed

| Validation | Result | Notes |
|---|---|---|
| `npm ci` | ✅ done (767 packages) | network to npm registry OK; no manifest changes |
| Focused offline vitest (14 suites) | ✅ **56 tests passed** | see suite list below |
| `git diff --check` | ✅ clean (exit 0) | no whitespace errors |
| `npx prisma generate` | ⛔ environment-blocked | engine download from `binaries.prisma.sh` fails (TLS network disconnect ×4); generated client absent; **no DB connection attempted** (dummy URLs only, never resolved) |
| `npx tsc --noEmit` (typecheck) | ⛔ environment-blocked | all 168 errors are cascades of missing `lib/generated/prisma/client` (44 × TS2307 + downstream TS7006). **Zero errors in any changed/new file** |
| `npx next build` | ⛔ environment-blocked | webpack `Can't resolve … lib/generated/prisma/client` |
| Full `npm test -- --run` | ⛔ pending | DB-backed suites require the disposable test database; see PENDING section |

Focused offline suites executed (all green):
`lib/auth/__tests__/session-middleware.test.ts` (7) · `lib/auth/__tests__/platform-admin.test.ts` (4) · `lib/auth/__tests__/return-to.test.ts` (4) · `app/api/companies/__tests__/route.test.ts` (5) · `app/api/universal-library/acquisition/runs/[id]/__tests__/route.test.ts` (5) · `app/api/universal-library/review/__tests__/route.test.ts` (8) · `app/api/universal-library/population/run/__tests__/route.test.ts` (4) · `app/dashboard/__tests__/layout.test.tsx` (6) · `app/dashboard/__tests__/page.test.tsx` (2) · `app/dashboard/__tests__/command-center.test.tsx` (2) · `app/login/__tests__/page.test.tsx` (4) · `lib/notifications/__tests__/notification-service.test.ts` (1) · `lib/reporting/__tests__/customer-activity.test.ts` (2) · `lib/reporting/__tests__/drawing-takeoff.test.ts` (2)

One pre-existing suite could not load offline: `app/api/universal-library/__tests__/route.test.ts` (needs generated Prisma client at runtime). Unrelated to these corrections; part of the PENDING full run.

## PENDING (dedicated disposable test database / CI ephemeral Postgres only)

```bash
npm ci
npx prisma generate            # requires engine download (network OK in CI)
npx prisma migrate deploy      # disposable test DB only — never office/shared DB
npm run typecheck
VOKA_RUN_DB_TESTS=1 npm test -- --run
```
Also verify in the same environment: `app/api/universal-library/__tests__/route.test.ts` and the DB-backed suites listed in the Phase 4C audit (§A.5), plus the full suite health.

## Exact committed file scope (authorized Phase 4C work only)

- `M app/api/companies/route.ts` — D2 guard (GET/POST → `withPlatformAdminAuth`, bodies preserved).
- `M app/api/universal-library/acquisition/runs/[id]/route.ts` — D1 guard swap (2 lines).
- `M middleware.ts` — D3 `x-pathname` injection for `/dashboard…` requests.
- `M app/dashboard/universal-library/review/page.tsx` — heading mojibake fix (1 line).
- `A app/api/companies/__tests__/route.test.ts` — D2 regression tests (5).
- `A app/api/universal-library/acquisition/runs/[id]/__tests__/route.test.ts` — D1 regression tests (5).
- `M lib/auth/__tests__/session-middleware.test.ts` — D3 regression tests (+2).
- `A docs/checkpoints/2026-09-08-phase4c-security-correction-01-engineering-ready.md` — this checkpoint.
- `A VOKA_PHASE4C_AUTH_TENANT_SECURITY_AUDIT.md` — Phase 4C audit evidence, included in this durable session checkpoint.

No unrelated files included. No schema, no migrations, no dependencies, no generated files tracked (`lib/generated/prisma` is gitignored and was never produced locally).
