# Phase 4C final verification and unauthorized API code correction

Date: 2026-09-09. Branch: `feature/pre-staging-product-coherence`.

<!-- VOKA-SLICE1-CANONICAL-CLOSURE-2026-09-09 -->

## CURRENT CANONICAL CLOSURE — 2026-09-09 (Slice 1)

**PHASE 4C = CLOSED.**

**LIVE-FAIL-001 / CEO-R1-030 = CLOSED.**

Official product base for this documentation closure:

`7b00c857a39d4d0d8bd6d8fbe4434b2595ba5287`

This current section supersedes earlier claims in this same file that Phase 4C live acceptance is PARTIAL, that cross-tenant live proof is PENDING, and that Payment remains LIVE RE-ACCEPTANCE REQUIRED. Historical engineering evidence below remains immutable.

### Phase 4C

| Gate | Status |
|---|---|
| Engineering validation | PASS |
| Live auth / session / platform acceptance | PASS |
| Cross-Tenant Isolation | PASS 8/8 |
| `AUTH-DIRECT-ROUTE-GATE` | CLOSED |

Cross-tenant live proof (customers):

- A reads A = 200
- B reads B = 200
- A reads B = 404
- B reads A = 404
- A PATCH B = 404
- B PATCH A = 404
- A list excludes B
- B list excludes A

Denied foreign resources returned:

`CUSTOMER_NOT_FOUND`
`"Customer not found."`

### Payment live re-acceptance

**PASS. LIVE-FAIL-001 = CLOSED.**

Live evidence:

- Issued invoice **10.000 KWD**
- Pay **4.000** → HTTP **201** → `PARTIALLY_PAID`, paid **4.000**, outstanding **6.000**
- Payment Register PASS
- Customer Statement PASS
- Dashboard PASS
- Pay **6.000** → HTTP **201** → `PAID`, paid **10.000**, outstanding **0.000**, payment form hidden
- Overpay **1.000** → HTTP **409** `PAYMENT_CONFLICT`, no extra payment persisted

### Deferred, not blockers

- D4 multi-membership selector = fail-closed / deferred
- D5 server-side refresh revocation = Phase 5
- D6 broader expired-session UX = deferred

### Freeze / pause (unchanged)

- Sales Assistant = CEO-FROZEN
- Quotation = CEO-FROZEN
- Data Factory = PAUSED
- UCL foundation not reopened
- This documentation slice does **not** start Phase 4D

---

**Prior checkpoint body (engineering review at `fbc79c2` / correction at `7b00c85`) follows. Treat PARTIAL / PENDING / Payment-not-closed sentences below as superseded historical evidence.**

**ENGINEERING PASS (bounded non-frozen validation).** Historical live-status lines in the original body are superseded by the current closure section above.

## Baseline and authority

- HEAD before review: `fbc79c2ad435aada3d6c451dbd57f91c0f6e2573`.
- Initial working tree clean; official branch matched its origin tracking ref before and after `git fetch origin --prune`.
- The current CEO request explicitly authorizes Codex for this bounded review and one local commit after validation. It supersedes the older reserve-agent restriction for this task only.
- No push, merge, tag, cherry-pick, release promotion, or Data Factory resumption is authorized by this review.
- Current evidence below supersedes stale standard-validation-pending and live-auth-pending claims in the [previous Phase 4C checkpoint](2026-09-08-phase4c-security-correction-01-engineering-ready.md). Historical audits remain historical evidence.

## Defect and exact correction

`ApiError.unauthorized(code = 'UNAUTHORIZED', message = 'Authentication is required.')` takes the machine code first. Four non-frozen production calls supplied only human-readable text, putting that text in `error.code` and, for custom messages, falling back to the wrong default `error.message`.

| Call | Correct machine code | Preserved human message |
|---|---|---|
| `lib/auth/get-current-user.ts`: no access cookie | `UNAUTHORIZED` | Authentication is required. |
| Same file: access verification fails | `SESSION_INVALID_OR_EXPIRED` | The authentication session is invalid or expired. |
| Same file: user missing/inactive | `USER_UNAVAILABLE` | The user account is unavailable or inactive. |
| `lib/http/unauthorized.ts` | `UNAUTHORIZED` | Caller-supplied message, or the existing default |

Only these call signatures changed. The API error class, response envelope, HTTP status, tenant/platform authorization and session behavior are unchanged. The remaining non-frozen `ApiError.unauthorized` calls use the valid default or explicit two-argument form.

The new `lib/auth/__tests__/unauthorized-response.test.ts` executes real auth, company and platform wrappers and `/api/auth/me`, with cookies, token verification and repositories mocked. It verifies exact JSON, HTTP 401, absence of a Location redirect, no protected-handler execution, and early denial before further data reads. It also preserves trusted tenant selection, multi-membership fail-closed behavior, ordinary OWNER platform denial and helper custom messages.

## Validation evidence

| Check | Result |
|---|---|
| New regression before correction | 18 FAIL / 3 PASS, reproducing the exact code/message defect |
| New regression after correction | 21 PASS / 0 FAIL |
| Final explicit allowlist below | 16 files PASS; 96 tests PASS / 0 FAIL / 0 skipped; includes the same 21 new tests |
| `npm run typecheck` | PASS, exit 0 |
| `npx --no-install prisma validate` | PASS, exit 0; schema only |
| `npm run build` | PASS, exit 0; compilation, type/lint checks, 73 static pages and build traces complete |
| `git diff --check` | PASS |

The existing installed environment reports Vitest 4.1.11 and Next.js 15.5.25. No dependency installation or manifest/lockfile change was made. Non-blocking existing Vite config and build lint warnings remain out of scope.

Validation processes override `DATABASE_URL`, `SHADOW_DATABASE_URL` and `DIRECT_URL` with `postgresql://offline:offline@127.0.0.1:1/voka_offline?connect_timeout=1`, and set `VOKA_RUN_DB_TESTS=0`. This is an unreachable placeholder, not a disposable database. Tests use mocks; no live DB tests, fixtures, migrations or DB operations ran. Next loaded its existing environment files, but inherited database overrides prevented use of their configured DB URLs. The office/shared DB was not touched.

### Exact test allowlist

Run with `npx --no-install vitest run` followed by these exact file arguments (no broad suite selection or regex exclusions):

```text
lib/auth/__tests__/unauthorized-response.test.ts
lib/auth/__tests__/session-middleware.test.ts
lib/auth/__tests__/return-to.test.ts
lib/auth/__tests__/platform-admin.test.ts
app/dashboard/__tests__/layout.test.tsx
app/login/__tests__/page.test.tsx
app/api/companies/__tests__/route.test.ts
app/api/universal-library/acquisition/runs/[id]/__tests__/route.test.ts
app/api/universal-library/review/__tests__/route.test.ts
app/api/customers/__tests__/route.test.ts
app/api/catalog/items/__tests__/route.test.ts
app/api/notifications/__tests__/route.test.ts
src/application/invoice/__tests__/InvoiceUseCases.test.ts
app/api/payments/__tests__/route.test.ts
app/api/customers/[customerId]/statement/__tests__/route.test.ts
app/dashboard/invoices/[invoiceId]/__tests__/page.test.tsx
```

Sales Assistant, adapters, conversation runtime, governed workspace and Quotation suites were not run. Invoice domain, invoice repository and invoice API suites that instantiate `Invoice` were also excluded: its runtime dependency invokes the frozen `QuotationCalculator`. Delivery-settings tests import Quotation delivery configuration and were excluded. Mixed dashboard aggregation tests were excluded. The explicitly requested global typecheck/build compiled the existing project; they do not constitute live or frozen-feature acceptance. No frozen source/test file changed.

DB-backed tenant isolation and live cross-tenant proof remain PENDING for an explicitly verified safe home/test DB. No database safety was inferred from a name.

## Accepted CEO live evidence (reported in this task; not re-executed here)

1. Logged-out nested protected route redirects to login with the exact returnTo.
2. Login returns to that nested route.
3. Missing/invalid access plus valid refresh recovers the session.
4. Invalid access plus invalid refresh returns to login and prevents protected UI access.
5. Safe returnTo/open-redirect checks passed.
6. Logout plus browser back/refresh remains logged out.
7. Tested logged-out protected APIs return 401 JSON without Location or protected data.
8. `admin@voka.local` has platform-admin UCL UI access.
9. Ordinary tenant OWNER is denied platform-admin UI access.
10. Ordinary tenant OWNER receives 403 from `/api/companies`.

These establish the reported non-frozen direct-route/session/platform checks. They do not prove cross-tenant live isolation or full Phase 4C closure. No additional browser acceptance is invented.

## Payment review

**No implementation needed from the reviewed evidence; CEO LIVE RE-ACCEPTANCE REQUIRED. Payment is not ACCEPTED or CLOSED.**

Static tracing confirms invoice detail submits an idempotency key to `POST /api/invoices/[invoiceId]/payments`, which uses the authenticated company and `RecordPaymentUseCase`. Repository `recordPayment` uses a Serializable transaction and invoice-scoped advisory lock, checks issued state and overpayment, persists Payment, updates paid/outstanding/settlement fields and emits `PAYMENT_RECORDED` in the transaction. Payment history is tenant/invoice scoped. The detail UI reloads after payment and hides the form at zero outstanding. Register, statement and dashboard payment/invoice projections query the current tenant data.

Safe automated evidence covers use-case forwarding, register tenant scope/pagination, statement arithmetic/foreign-customer denial and invoice detail presentation. It is not a live end-to-end payment test and does not prove the database transaction under concurrency. No payment implementation or payment test was changed.

Future CEO scenario remains: issued 10.000 -> pay 4.000 -> PARTIALLY_PAID, paid 4/outstanding 6 -> register, statement and dashboard agree -> pay 6.000 -> PAID, paid 10/outstanding 0 -> payment form hidden and statement outstanding 0 -> overpay rejected.

## Arena and promotion decision

- `origin/arena/01a082b5-voka` is `e708632`, already in official HEAD ancestry. Its final tree lacks the subsequent official checkpoint reconciliation; no new implementation to promote.
- `origin/arena/01a08189-voka` is `a181278`, older CLOSE-06 work with `7aac371`/`a181278` on its separate lineage. Branch history and file-level differences were inspected; its older checkpoint/UCL changes must not replace the official baseline.
- No `VOKA_PHASE4D_REMAINING_VISIBLE_V1_AUDIT.md` was found in either fetched Arena tree or in fetched/local history for that path. No Arena change was applied.
- Release promotion is not approved: cross-tenant live proof and payment live re-acceptance remain pending.

## Remaining status and next action

- Phase 4C engineering validation: PASS for the bounded non-frozen allowlist, typecheck and build.
- Phase 4C live acceptance: PARTIAL / IN PROGRESS.
- Cross-tenant live proof: PENDING.
- Low unauthorized API code defect: FIXED and regression-validated.
- D4 multi-membership selector: DEFERRED / FAIL-CLOSED.
- D5 server-side refresh revocation: DEFERRED to Phase 5.
- D6 bounded 401 UX: DEFERRED; no new non-frozen reproduction in this review.
- Payment: LIVE RE-ACCEPTANCE REQUIRED; existing release gate remains open.
- Data Factory: PAUSED.
- Next: CEO safe home/test DB cross-tenant proof and payment re-acceptance, then governed Phase 4D review. No frozen area is reopened by this checkpoint.

One local correction commit is authorized after validation. Its identity is the commit containing this checkpoint; no self-referential SHA is embedded. Task/session closure still requires the user's explicit `تم`.
