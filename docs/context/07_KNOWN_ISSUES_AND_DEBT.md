# Known Issues and Technical Debt

## High-value architectural concerns

1. **Dual architecture trees.** `features/` and `src/` both contain user/customer
   concepts. Auth currently bridges both. Establish and execute a migration plan
   before expanding duplicates.
2. **Duplicate API helper names.** `lib/api` contains both PascalCase and kebab-case
   variants such as `ApiError.ts`/`api-error.ts` and
   `ApiResponse.ts`/`api-response.ts`. Confirm ownership and consumers before cleanup.
3. **Documentation generator risk.** `scripts/generate-docs.mjs` overwrites living
   status/journal/roadmap and architecture companions with minimal templates.
4. **Sparse current ledgers.** Project Status and Roadmap no longer contain the
   detailed evidence tables introduced in commit `69454db`; Git/tree verification
   is required to avoid false planning.

## Product gaps

- No verified Voice, AI, conversation, WhatsApp, mobile/offline, document/PDF,
  sales-order, invoice, payment, or import/export implementation.
- Customer UI exists, but most other engine surfaces are backend/domain foundations.
- Test coverage is concentrated on customer and pricing; quotation/auth/catalog
  lack equivalent tracked test breadth.

## Environment and quality gaps

- Current dependencies were unavailable during context-pack validation, so current
  typecheck/tests/build remain unverified.
- `.env.example` lists `NEXTAUTH_*`, while implementation/audit evidence expects
  JWT access/refresh variables. Align the template without exposing values.
- README stack/status contains stale claims relative to `package.json` and Git.
- Next.js was patched from 15.5.1 to 15.5.22 to remove the critical direct advisory.
- The current package audit still reports three high transitive advisories in
  Next.js dependencies (PostCSS and Sharp); npm proposes a Next 16 major upgrade,
  which requires a separately approved compatibility migration.

## Repository hygiene

- `package-lock-HaniOthman.json` is a second lockfile-like artifact and may create
  ambiguity; determine whether it is intentional before removal.
- `tsconfig.tsbuildinfo` and `.next` are local/generated; the former is ignored now,
  but existing tracked state should be checked before cleanup.
- A historical stash exists (`refs/stash`) from `feature/mvp-01-foundation`; inspect,
  do not apply automatically.

These are observations, not authorization to refactor or delete files.
