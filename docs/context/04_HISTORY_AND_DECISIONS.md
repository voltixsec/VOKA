# History and Decisions

## Delivery timeline

### 2026-07-23 — Initial product shell

Repository README, Next.js setup, premium landing page, and Arabic support.

### 2026-07-29 — Foundation and core architecture

Project structure/design system, core architecture and Company persistence, then
authentication foundation. Feature-branch and PR workflow became established.

### 2026-07-30 — API/auth and customer foundation

Reusable API response/error handling, authentication standardization, active
company context, authorization guards, Customer persistence/domain/API, and later
the customer dashboard.

### 2026-07-31 — Catalog and quotation engine

Catalog schema/domain/API/security, project ledgers, quotation schema, then the
quotation domain/application/repository/API engine. The historical full audit was
captured from branch `feature/mvp-08-quotation-domain` on another workstation.

### 2026-08-01 — DDD consolidation and pricing

Auth migration toward `src/`, bootstrap seed, test tooling, customer domain tests,
quotation application flow, Master Blueprint/constitution, price-list DDD work,
and pricing foundation. Commit `9ec8561` explicitly removed duplicated pricing
logic, reinforcing the single-source rule.

### 2026-08-02 — CTO session protocols

Added formal CTO START and CLOSE checklists.

### 2026-08-04 — AI-first decision

Commit `f4e6c8c` approved ADR-009, Codex Desktop as execution agent, and the
optional planned Advanced Import / Export direction.

## Important decisions

- Clean Architecture/DDD and inward dependency flow.
- Global User identity with company-scoped membership roles.
- Human-controlled AI and explicit completion by `تم`.
- AI/Voice are default interaction; advanced manual tools need AI alternatives.
- Advanced Import / Export is approved direction but remains Planned.
- Documentation and Git are project memory; implementation evidence outranks stale prose.
- Small atomic commits, tests before merge, and no direct work on `main`.

## Prior problems and lessons

- A planning error once selected Customers as “next” despite existing implementation;
  this led to the Git-backed project ledger.
- Generated documentation replaced detailed ledgers with minimal templates in
  commit `b887e1c`; automated doc generation must be reviewed before use.
- Multiple architecture layouts (`features/` and `src/`) and similarly named API
  helpers remain; new work must avoid multiplying duplicate logic.
- Placeholder directories/documents previously inflated perceived completion.
  Only code, tests, migrations, and validated behavior count as implementation.
- An earlier GitHub Desktop stash exists on the old foundation branch; it is not
  part of the current branch and should not be applied without inspection.

Primary evidence: `git log --all`, [CTO Journal](../CTO_JOURNAL.md), and
`VOKA_FULL_AUDIT.txt`.
