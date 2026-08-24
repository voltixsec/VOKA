# WS7 Evidence-Led Performance Pass — Payment History

Date: 2026-08-25

Status: **BOUNDED_SLICE_CODE_COMPLETE**

## Evidence

- Invoice payment history used an unbounded database query and returned every historical payment in one API/UI payload.
- This creates linear database, serialization, network, and browser-memory growth for long-lived receivables accounts.

## Change

- Payment history now defaults to 50 records per page and rejects page sizes above 100.
- Repository query uses bounded `skip`/`take` plus a separate total count, always tenant- and invoice-scoped.
- API returns explicit pagination metadata.
- Existing invoice UI requests only the first 50 recent payments.
- No financial mutation, settlement logic, or historical record was changed.

## Validation

- Focused API/repository tests: 6 passed.
- Typecheck and diff check: PASS.
- Existing production build baseline before this slice: shared JS 103 kB; invoice details first-load JS 110 kB.

## Remaining measured opportunities

- Quotation/contract composers preload up to 100 customers and 100 catalog items. Search-backed selectors may reduce payloads, but require a separate UX-safe slice and were not changed speculatively here.
- Existing build warnings for legacy hook dependencies and combobox ARIA remain visible and should be handled in their owning workstreams.

## Safety

- `main` remains untouched.
- No database migration or data mutation was required.

## Next action

Proceed to WS8 brand system and immutable document-brand snapshot review after full integration gates.
