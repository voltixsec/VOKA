# VOKA CTO Journal

> Engineering decisions, constraints and technical debt.

## 2026-07-31 — Project Ledger Adopted

### Context

A planning error incorrectly identified Customers as the next module even though its backend and dashboard UI had already been completed.

### Decision

GitHub becomes the authoritative source of truth for VOKA project status.

Three permanent project documents are introduced:

- `docs/PROJECT_STATUS.md`
- `docs/ROADMAP.md`
- `docs/CTO_JOURNAL.md`

### Operating Rule

Before selecting any next task, the CTO must inspect:

1. `docs/PROJECT_STATUS.md`
2. Git branch and working-tree status
3. Recent Git commits
4. Existing project files
5. Prisma models and migrations
6. Existing API routes

No next milestone may be selected from conversational memory alone.

### Completion Rule

The system must never close a milestone due to silence or elapsed time.

Only the CEO closes the milestone by explicitly saying:

`تم`

Technical completion also requires successful validation, commit, push and documentation update.

---

## 2026-07-31 — Catalog Company Security

### Commit

`34697ab` — `feat(catalog): secure catalog routes with company auth`

### Decision

Catalog routes must never trust a client-supplied `companyId`.

The active company is resolved from authenticated company context.

### Authorization

- Catalog GET:
  - `OWNER`
  - `ADMIN`
  - `SALES`
  - `VIEWER`

- Catalog POST:
  - `OWNER`
  - `ADMIN`
  - `SALES`

### API Standardization

Catalog routes use:

- `withCompanyAuth`
- `ApiError`
- `apiSuccess`

### Validation

- Prisma: passed
- TypeScript: passed
- Push: completed

---

## 2026-07-31 — Customers Status Confirmed

### Evidence

The repository contains:

- Customer Prisma model and migration
- Customer domain entity
- Customer repository contract
- Prisma customer repository
- Create-customer command
- List-customers query
- Customers API
- Customers dashboard page
- `useCustomers` hook
- Customer table
- Loading state
- Empty state

### Decision

Customers must be treated as an existing completed foundation, not as a new module.

Future customer work should be described specifically, such as:

- customer editing
- customer details
- activity history
- importing customers

The generic label `Customers Module` must not be used as though nothing exists.

---

## Technical Debt Register

### TD-001 — Automated Tests Missing

- Status: OPEN
- Severity: MEDIUM
- Evidence: No tests directory found.
- Risk: Regressions currently depend on manual validation and TypeScript checks.
- Proposed action: Add unit and integration test foundation before high-risk workflow modules mature.

### TD-002 — Placeholder Feature Directories

- Status: OPEN
- Severity: LOW
- Affected:
  - AI
  - conversations
  - quotations
  - services
  - settings
- Note: Placeholder directories do not count as implemented modules.

### TD-003 — Documentation Was Not Part of Milestones

- Status: RESOLVED BY POLICY
- Resolution: Every future milestone must update the project ledger before completion.

---

## Next Decision Gate

After this documentation foundation is committed and pushed:

1. Re-read the project ledger.
2. Confirm the exact scope of Quotations.
3. Split Quotation Foundation into controlled implementation parts.
4. Begin only after CEO approval.
