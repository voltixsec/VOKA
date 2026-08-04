# Architecture and Data

## Architecture contract

VOKA uses Clean Architecture, DDD, feature-oriented modules, repository pattern,
dependency inversion, and lightweight CQRS where useful.

```text
Presentation -> Application -> Domain
                         ^
                         |
              Infrastructure implements inward contracts
```

The Domain contains entities, value objects, domain services/errors, and repository
interfaces. It must not depend on Prisma, Next.js, HTTP, databases, drivers, or
external services. API routes call application behavior; they do not own business
logic. Repositories return domain objects.

Sources: [Architecture](../ARCHITECTURE.md),
[Architecture decisions](../architecture/ARCHITECTURE_DECISIONS.md).

## Current technical stack (verified 2026-08-04)

- Next.js 15.5.1, React 18.2, TypeScript 5.6, Tailwind CSS 3.4.
- Prisma ORM/client 7.9 with PostgreSQL and `@prisma/adapter-pg`.
- JWT tooling via `jose`; password hashing via `bcryptjs`.
- Vitest test infrastructure.
- App Router APIs and pages.

Evidence: `package.json`, `prisma.config.ts`, and repository tree. README references
Auth.js, Zod, and OpenAI API, but those packages are not present in the current
manifest; treat them as vision/legacy text, not verified dependencies.

## Multi-tenant identity model

`User` is a global identity. `CompanyMember` joins User to Company and owns the
role/status, allowing one user to hold different roles across companies. Initial
roles are OWNER, ADMIN, SALES, VIEWER. Company context must scope business data.

Sources: [Architecture](../ARCHITECTURE.md),
[Architecture V2](../ARCHITECTURE_V2.md), `prisma/schema.prisma`.

## Persisted model snapshot

Verified Prisma models: Company, User, CompanyMember, Customer, CatalogCategory,
Unit, TaxRate, CatalogItem, PriceList, PriceListItem, Quotation, QuotationLine.
Key enums cover locale, membership, customer, quotation, discount, and catalog
item types. Current company currency/timezone defaults are KWD and Asia/Kuwait.

Three tracked migrations establish the initial company/customer foundation,
catalog foundation, and quotation foundation. Generated Prisma client output is
ignored at `lib/generated/prisma`.

## Implementation layouts

Two layouts coexist:

- `features/`: company, user, customers, catalog plus presentation-facing pieces.
- `src/`: newer DDD/application/infrastructure work for auth, customer, pricing,
  price lists, quotation, and user.

This is a transitional boundary, not permission to duplicate new behavior. The
quotation API uses `src/`; company/customer/catalog routes largely use `features/`;
auth bridges both. Choose the established owner for the touched module and seek
an architectural decision before cross-tree migration.

## API surface (verified)

Routes exist for health, companies, customers, catalog items, quotations, login,
logout, refresh, and current-user lookup. A customer dashboard UI exists. Route
presence proves a surface exists, not full product completion.
