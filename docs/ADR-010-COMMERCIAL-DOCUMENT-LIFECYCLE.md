# ADR-010: Commercial Document Lifecycle

- Status: Approved
- Date: 2026-08-20

## Context

VOKA already preserves approved Quotation snapshots and supports an explicit,
idempotent conversion from an approved Quotation to a SalesOrder. Phase 7 adds
Contracts, Invoices, Payments and broader commercial-document orchestration.

The existing Quotation-to-SalesOrder workflow remains valid, but it must not be
generalized into a mandatory dependency chain for every business process.
Businesses may enter VOKA after negotiation has already happened, issue a
Contract without a VOKA Quotation, or issue an Invoice without first creating a
fake upstream document.

## Decision

Quotation-first is the recommended commercial workflow, not a mandatory technical dependency. Contracts and invoices may be created directly when the business process requires it.

Quotation-first remains the preferred/default guided workflow where it applies.
Direct Contract and Direct Invoice creation are also first-class workflows.

VOKA recognizes these first-class commercial aggregates:

- **Quotation**: proposal, negotiation and approval document.
- **SalesOrder**: operational commercial commitment.
- **Contract**: contractual commitment including terms, duration, milestones
  and/or installments.
- **Invoice**: financial claim against a customer.
- **Payment**: actual receipt or settlement event.

One aggregate must not be used as a fake substitute for another. In particular:

- a fake Quotation is never required to create a Contract;
- a fake Quotation, SalesOrder or Contract is never required to create an
  Invoice;
- an existing supported Quotation-to-SalesOrder conversion retains its current
  approval, idempotency, tenant and snapshot guarantees.

## Origin and provenance

The conceptual origin/source values for downstream commercial documents are:

- `DIRECT`
- `QUOTATION`
- `SALES_ORDER`
- `CONTRACT`

Origin records provenance. It does not own or control the downstream document's
lifecycle. After creation, a Contract or Invoice is its own first-class
aggregate with its own authorization, lifecycle, audit and historical snapshot
boundaries.

These values are conceptual architecture. Phase 7A will decide their concrete
representation. This ADR does not prescribe database columns, foreign keys,
conversion tables or schema enums.

## Historical document snapshots

Commercial documents preserve immutable historical snapshots appropriate to
the document, including where applicable:

- customer identity and details;
- product or service identity;
- localized names and descriptions;
- unit;
- quantity;
- price;
- discount;
- tax;
- currency;
- totals;
- company and document branding;
- source or reference identity.

Changes to current Customer, Catalog, Unit, TaxRate, Price List or branding data
must never silently reprice, rewrite or reinterpret an existing historical
Quotation, SalesOrder, Contract or Invoice.

The existing approved-Quotation and SalesOrder snapshot invariants remain
authoritative and are not weakened by this decision.

## Contract, Invoice and Payment lifecycle

A Contract:

- may be `DIRECT` or derived from an applicable earlier commercial document;
- may define terms, duration, milestones and installments;
- may produce an Invoice when a milestone or installment becomes due;
- preserves its own immutable contractual and commercial snapshot.

An Invoice:

- may be `DIRECT` or derived from an applicable upstream document;
- represents the financial claim against the customer;
- preserves its own immutable commercial snapshot;
- keeps totals, tax and currency under canonical server authority.

A Payment:

- represents money actually received;
- settles an Invoice partially or fully;
- contributes to an expected Invoice settlement lifecycle of `UNPAID`,
  `PARTIALLY_PAID` and `PAID`.

Conceptually:

`Contract -> Milestone 30% -> Invoice -> one or more Payments -> Invoice settlement state`

Payment accounting, ledger behavior, refunds, credit notes and reconciliation
are outside this decision and require separate approval.

## Architecture and authority boundaries

- Clean Architecture, DDD, dependency inversion and feature boundaries remain
  mandatory. Presentation depends on Application, which depends on Domain.
- Repository interfaces remain inward and infrastructure implementations remain
  outward. Domain objects do not depend on Next.js, Prisma, HTTP, database
  drivers or external services.
- Every aggregate and operation is tenant-owned. `companyId` comes from trusted
  server authentication context, never client input.
- APIs and application commands accept explicit fields; mass assignment is
  forbidden. Cross-tenant and missing resources retain the same safe not-found
  boundary.
- Prices, discounts, tax, currency and totals remain validated and authoritative
  on the server. AI and clients have no authority over tenant, authorization,
  ownership, commercial totals, approval or history.
- AI may propose. The server validates. Humans control consequential creation,
  conversion and lifecycle actions.
- Document rendering remains deterministic and AI-free, based on an
  application-owned immutable document snapshot.
- Supported conversions must be explicit, tenant-safe, idempotent where
  conversion exists, duplicate-resistant and provenance-preserving. This ADR
  does not promise conversions that Phase 7 has not designed.

## Delivery boundary

Phase 7 is divided into:

- **7A — Commercial Document Foundation**
- **7B — Contracts**
- **7C — Invoices**
- **7D — Payments & Receivables**
- **7E — Document Conversion / Orchestration**

Phase 7A owns the concrete design decisions for persistence, application ports,
authorization, lifecycle transitions and conversion support. Those decisions
must preserve backward compatibility and must not destructively reinterpret
existing Quotation or SalesOrder data.

## Consequences

- Guided quotation-first flows can remain the default without blocking direct
  Contract or Invoice business processes.
- Each commercial document carries its own lifecycle and immutable historical
  meaning after creation.
- Provenance can be audited without coupling downstream lifecycle authority to
  an upstream aggregate.
- Implementations must handle more than one legitimate entry path and must make
  supported conversions explicit rather than inferring a universal chain.

## Non-goals

This ADR does not implement or approve a Prisma schema, migrations, API routes,
UI, domain code, accounting ledger, refunds, credit notes, reconciliation or a
specific conversion matrix.
