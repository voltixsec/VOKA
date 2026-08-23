# VOKA Session Close — 2026-08-23

## Authoritative Main
- Main SHA before this checkpoint: `5f4417edf5bff16e9ae16e3378af0908b5dd7b3c`
- PR #74 merged successfully.
- ProtectedTokenValidator localizable-unit bug is closed.
- Working tree was clean after merge.

## OpenAI Production Translation
- Production provider selected: OpenAI.
- Local provider config: `VOKA_TRANSLATION_PROVIDER=openai`.
- Selected production model: `gpt-5.6-luna`.
- API key remains local/server-side only and must never be committed.

### Model benchmark
Mini benchmark completed across:
- `gpt-5.6-luna`
- `gpt-5.6-terra`
- `gpt-5.6-sol`

All 18 translations completed successfully after ProtectedTokenValidator fix.

Observed average latency:
- Luna: 2552 ms
- Terra: 1754 ms
- Sol: 2317 ms

Decision:
- `gpt-5.6-luna` = Production Primary.
- Terra remains a latency-oriented alternative.
- Sol remains configurable for future higher-language-quality use cases.

## Translation Acceptance
Manual product test completed successfully.

Confirmed:
- Arabic to English translation quality manually accepted.
- Protected commercial and technical data remained intact.
- Arabic / English switching works correctly.
- Repeated language switching is immediate and does not require a new AI translation.
- Existing generic multilingual backend architecture remains valid.

Status:
**OpenAI Production Translation Acceptance: PASS**

## Multilingual UI Gap
Backend persistence and translation architecture support generic BCP-47 locales.

Current UI still exposes only Arabic / English.

Required future UI:
- Generic Language selector.
- Company-enabled language list.
- Support arbitrary enabled locales such as French, Chinese, Hindi, Spanish, German, etc.
- Generate a translation only when a locale has no valid stored translation.
- Switching between already-stored locales must remain AI-free and immediate.

Status:
**Multilingual backend: PASS**
**Generic multilingual UI selector: PENDING**

## Authentication / Session UX Findings
Manual UI review identified the following issues:

1. `/login` currently returns 404.
2. An unauthenticated user can reach the Dashboard shell.
3. Login form is embedded inside the Quotations page.
4. Desired behavior:
   - unauthenticated `/dashboard/*`
   - redirect to a standalone VOKA Login page
   - successful authentication
   - return to originally requested route.
5. Dashboard sidebar/header must not be exposed as the login experience.
6. Account/Profile card currently appears interactive but has no functional menu.
7. Functional Logout is currently not available through the visible account UI.
8. The visible `admin@voka.local` login value must be inspected later to determine whether it is browser autofill, development convenience, or application-provided default. No security conclusion has been made yet.

Status:
**Authentication UX Closure: PENDING**

## Additional UI / Functional Acceptance Notes
Recorded for later dedicated acceptance:

- Account/Profile menu requires functional review.
- Logout requires implementation/acceptance.
- Notifications currently appear to be UI-only and require functional acceptance.
- Search requires functional acceptance.
- Smart Assistant has UI/modal but requires a dedicated end-to-end functional acceptance pass.
- Header controls require complete UX acceptance.
- Generic multilingual selector remains missing.
- Dashboard and quotation screens still require broader Manual Core Product Acceptance.

## Next Recommended Workstream
Start with:

**Authentication UX Closure**

Then continue the existing product-closure gates without removing any previously approved gate.

No Release Hardening / Staging / Pilot decision is implied by this checkpoint.

### Authentication boundary clarification

Observed during unauthenticated testing:

- `GET /dashboard/quotations` returned `200` and rendered the Dashboard shell.
- `GET /api/quotations?page=1&pageSize=20` returned `401`.

Current conclusion:
- Protected API access was denied correctly in this observed flow.
- The confirmed defect is that unauthenticated users can reach/render the protected Dashboard UI shell instead of being redirected to a standalone login route.
- This finding does not establish an API authorization bypass.

### Development environment observation

During the session, several Prisma requests temporarily failed with `ECONNREFUSED`, then subsequent database-backed requests recovered and returned `200`.

Status:
- Record for later development-environment reliability review.
- No production defect conclusion is made from this observation alone.
