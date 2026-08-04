# Project Status


Current Sprint: 09A

Status: In Progress

Verified baseline: `a81cb50` on `feature/mvp-09-quotation-api` (2026-08-04)

## Sprint 09A - Quotation API

Completed and verified:

- Quotation schema, domain aggregate, calculator, application use cases, Prisma
  repository, and authenticated create API foundation.
- Tenant isolation for quotation lookup, update, and soft delete.
- Tenant-scoped validation of customer, price list, catalog item, and tax rate
  references before quotation creation.
- Company tax rates and global system tax rates are supported without allowing
  cross-company references.
- Current quality baseline: TypeScript PASS, Prisma validation PASS, production
  build PASS, and 33/33 tests PASS across 12 test files.

Remaining before Sprint 09A can be closed:

- Approve the exact HTTP API surface and acceptance criteria.
- Complete list/detail and required update/state-transition endpoints.
- Add route-level integration coverage for authentication, authorization,
  validation, tenant isolation, and error mapping.
- Decide whether the customer snapshot must be loaded from persistence rather
  than accepted from the request after validating `customerId`.
- Refresh the status ledger again after the approved completion slice passes all
  required checks.

Architecture:
- Clean Architecture
- DDD
- Prisma
- PostgreSQL

## Architecture Decisions

- AI First: `APPROVED`
- Advanced Import / Export Center: `APPROVED` as an optional product capability
- Codex Desktop development execution workflow: `APPROVED`

The Advanced Import / Export Center is not implemented. Its implementation
status remains `PLANNED`.
