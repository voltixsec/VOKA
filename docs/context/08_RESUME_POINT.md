# Resume Point

Verified on: 2026-08-20 (Asia/Kuwait)

## Current Verified State

- Canonical branch: `main`.
- Base GitHub main baseline: `87f985ce111d28eb2bd38416d3d1e199f35cda88` (PR #55 merged docs/architecture Phase 7).
- Phase 7A Commercial Document Foundation & Phase 7B.1 Contract MVP are implemented on the handoff branch and remain unmerged pending final CTO acceptance.

## Phase 7A & Phase 7B.1 Implemented Review Boundary

### Phase 7A — Commercial Document Foundation

Implemented and reviewed locally:

- Domain-owned canonical `CommercialDocumentKind` (`QUOTATION`, `SALES_ORDER`, `CONTRACT`, `INVOICE`, `PAYMENT`);
- Pure domain value object `CommercialDocumentProvenance` supporting `DIRECT` and sourced (`QUOTATION`, `SALES_ORDER`, `CONTRACT`) origins;
- Strict domain validation for provenance valid/invalid combinations;
- Shared pure commercial snapshot primitives (`CommercialCustomerSnapshot`, `CommercialLineSnapshot`, `CommercialTotals`, `CommercialConversionContract`);
- Pure domain unit tests for all valid/invalid provenance combinations.

### Phase 7B.1 — Contract MVP

Implemented and reviewed locally:

- Clean Architecture & DDD `Contract` aggregate, `ContractMilestone` entity, and `ContractNumber` value object (`CN-YYYYMM-XXXX`);
- Contract status limited to `DRAFT` for this slice;
- Server-authoritative commercial totals calculation;
- Milestone validation for percentage and fixed amount representations;
- Application repository interface (`IContractRepository`) and use cases (`CreateContractUseCase`, `GetContractUseCase`, `ListContractsUseCase`);
- Direct Contract creation supported as primary workflow without fake upstream quotation requirements;
- Additive database schema for `Contract`, `ContractLine`, and `ContractMilestone` models;
- Forward non-destructive migration `20260820200000_contract_mvp_foundation`;
- `PrismaContractMapper` and `PrismaContractRepository` infrastructure implementations;
- Authenticated, tenant-scoped API endpoints (`POST /api/contracts`, `GET /api/contracts`, `GET /api/contracts/[contractId]`);
- Tenant authorization (`OWNER`, `ADMIN`, `SALES` write; `VIEWER` read);
- Cross-tenant requests return safe 404 boundary (indistinguishable from missing resource).
- Direct creation ignores client provenance and always creates `DIRECT` contracts.
- Monthly contract numbers use an atomic company-scoped sequence.
- Catalog-linked lines use server-owned catalog identity/unit snapshots, canonical pricing, and DB-resolved tax.
- Repository updates require both contract id and company id.
- Contract list status is validated and missing/cross-tenant customers use a controlled not-found boundary.

## CTO Review Evidence

- Blockers 1-4: PASS in the local review worktree.
- Focused Contract gate: 6 test files / 23 tests PASS.
- TypeScript (`tsc --noEmit --incremental false`): PASS.
- Production compilation and type/lint phase: PASS; page-data collection could not run because `DATABASE_URL` is not configured in this worktree.
- Full test suite: 119 files PASS, 1 skipped, 1 environment-blocked (`Phase64BBlockerFixes.test.ts` imports Prisma without `DATABASE_URL`); 745 tests PASS, 2 skipped.
- Prisma validation could not load configuration because `DATABASE_URL` is not configured. The earlier Blocker #2 Prisma generate result remains historical evidence, not a fresh validation result.
- No commit, push, pull request, or merge has been performed for the CTO review changes.

## Continuing Guardrails

- Clean Architecture + DDD + dependency inversion.
- Domain stays independent of Next.js, Prisma, HTTP, browser speech APIs and AI providers.
- `companyId` always comes from authenticated server context.
- Cross-tenant resources use the established safe not-found boundary.
- Browser/client values are never canonical tax or totals authority.
- Approved quotation and Sales Order snapshots remain historical and immutable.
- AI produces proposals/drafts; consequential actions require human approval.

## Next Session Start Point

Phase 7A and Phase 7B.1 remain on the review branch pending final acceptance and publication workflow.
Do not begin **Phase 7B.2 / Contract UI / PDF rendering** or **Phase 7C Invoices** from this resume point until the current review changes are accepted and merged.

<!-- ADR-011-UCL-RESUME -->

## Approved Next Architecture — Universal Commercial Library

On 2026-08-20 the CEO approved the Universal Commercial Library architecture.

This decision must be preserved across future CTO sessions.

VOKA will ultimately support a very large shared commercial knowledge library
covering products and services across industries and countries.

This does NOT mean loading all records into a tenant catalog, browser session or
AI prompt.

The permanent architecture is:

Universal Commercial Library
-> bounded retrieval
-> explicit tenant adoption
-> canonical Company Catalog
-> Quotation / Contract / Sales Order / Invoice snapshots.

The Company Catalog remains tenant-owned operational truth.

The Universal Library is shared knowledge and discovery infrastructure.

Required future capabilities include taxonomy, manufacturers, brands, models,
variants, multilingual aliases, GTIN/EAN/UPC/MPN-style identifiers,
specifications, extensible attributes, provenance, confidence, entity
resolution, bundles/services, ingestion, source governance, licensing controls,
search ranking, caching and AI retrieval.

Performance is a hard architectural requirement:

large server-side corpus + small indexed retrieval + small client payload +
small AI context.

Never implement full-library browser loading or full-library AI context.

Canonical architecture:
`docs/ADR-011-UNIVERSAL-COMMERCIAL-LIBRARY.md`.
