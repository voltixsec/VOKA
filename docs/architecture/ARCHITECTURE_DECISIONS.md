
# Architecture Decisions

## Architecture

- Clean Architecture
- Domain Driven Design
- Feature Based Development
- Repository Pattern
- Dependency Injection
- CQRS where useful

---

## Technology

- Next.js
- TypeScript
- Prisma
- PostgreSQL

---

## Rules

Business logic NEVER exists inside API routes.

API routes call Application Layer only.

Domain has zero infrastructure dependencies.

