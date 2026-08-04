# VOKA Agent Operating Guide

This repository is VOKA, an AI-first, voice-first sales operating system.
Before any work, read [docs/context/README.md](docs/context/README.md).

## Authority and source order

When sources disagree, use this order and report the conflict instead of silently
choosing a convenient version:

1. Explicit instruction from the project owner in the current task.
2. Approved ADRs, beginning with [ADR-009](docs/ADR-009-AI-FIRST.md).
3. [Architecture constitution](docs/architecture/00_CONSTITUTION.md),
   [core architecture](docs/ARCHITECTURE.md), and
   [architecture decisions](docs/architecture/ARCHITECTURE_DECISIONS.md).
4. [Master Blueprint](docs/VOKA_MASTER_BLUEPRINT.md) and active engine blueprints.
5. [Project status](docs/PROJECT_STATUS.md), [roadmap](docs/ROADMAP.md), and
   [CTO journal](docs/CTO_JOURNAL.md).
6. Git history and implementation evidence.
7. Context-pack summaries. These are navigation aids, never replacement sources.

## Governance

- CEO/project owner owns the business vision and final product decisions.
- CTO owns architecture and technical approval.
- Codex is an execution agent, not a product or technical decision maker.
- AI proposes; humans approve consequential actions.
- A task closes only when the user explicitly says `تم`.
- Silence never closes a task or session.

## Product invariants

- AI and Voice are the primary interfaces for normal users.
- Arabic and English are first-class languages.
- The user remains in control; nothing is approved automatically.
- Products and services are distinct item types and both contribute to totals.
- The Advanced Import / Export Center is `PLANNED`, not implemented. It is an
  optional, web-only tool for advanced users and must not displace Voice or AI.

## Architecture guardrails

- Use Clean Architecture, DDD, feature boundaries, repository interfaces, and
  dependency inversion.
- Dependency direction is Presentation -> Application -> Domain.
- Domain code must not depend on Next.js, Prisma, HTTP, database drivers, or
  external services.
- API routes orchestrate application use cases; business logic does not live in routes.
- Repository interfaces belong inward; Prisma implementations belong in infrastructure.
- Repositories return domain objects, not Prisma records.
- Every company-owned record and operation must preserve tenant isolation.
- Prefer one canonical implementation. Do not extend both `features/` and `src/`
  for the same concept without an approved migration decision.

## Change discipline

- Inspect `git status`, the relevant diff, current branch, and recent commits first.
- Preserve unrelated and pre-existing worktree changes.
- Do not modify schema, migrations, generated Prisma output, or dependencies unless
  the task explicitly requires it.
- Do not work directly on `main`; use a feature branch.
- Keep commits small and scoped. Never commit or push without explicit permission.
- GitHub is the shared source of truth between workstations; local folders and
  Codex conversation state are not synchronization mechanisms.
- Documentation is part of the product. Update the authoritative document and link
  from summaries rather than copying policy text into multiple places.
- Before a code commit, run the applicable checks from
  [ARCHITECTURE.md](docs/ARCHITECTURE.md). Record unavailable tools honestly.

## Session protocol

- Start: follow [CTO START SESSION](docs/CTO_START_SESSION.md) and use
  [the resume point](docs/context/08_RESUME_POINT.md).
- Close: follow [CTO CLOSE SESSION](docs/CTO_CLOSE_SESSION.md).
- Refresh this context pack when authoritative documents, milestones, architecture,
  environments, or the verified resume point materially change.
