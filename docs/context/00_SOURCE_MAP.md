# Source Map and Conflict Policy

## Canonical sources

| Subject | Primary source | Supporting source |
|---|---|---|
| Immutable principles | [Constitution](../architecture/00_CONSTITUTION.md) | [Master Blueprint](../VOKA_MASTER_BLUEPRINT.md) |
| AI-first decision and governance | [ADR-009](../ADR-009-AI-FIRST.md) | [CTO decisions index](../architecture/16_CTO_DECISIONS.md) |
| Technical architecture | [Architecture](../ARCHITECTURE.md) | [Architecture decisions](../architecture/ARCHITECTURE_DECISIONS.md) |
| Core product rules and tenant model | [Architecture V2](../ARCHITECTURE_V2.md) | [Architecture](../ARCHITECTURE.md) |
| Long-term product vision | [Master Blueprint](../VOKA_MASTER_BLUEPRINT.md) | [Vision](../architecture/VISION.md) |
| Sales domain | [Sales Engine blueprint](../blueprints/01_SALES_ENGINE.md) | [Master Blueprint](../VOKA_MASTER_BLUEPRINT.md) |
| Module details | [Modules](../architecture/13_MODULES.md) | Engine blueprints |
| Execution status | [Project Status](../PROJECT_STATUS.md) | Git and repository evidence |
| Sequence and future work | [Roadmap](../ROADMAP.md) | [Architecture roadmap](../architecture/15_ROADMAP.md) |
| Decision chronology | [CTO Journal](../CTO_JOURNAL.md) | Git history |
| Session protocol | [CTO Start](../CTO_START_SESSION.md), [CTO Close](../CTO_CLOSE_SESSION.md) | This pack |

## Documents that need interpretation

- Files `architecture/01_...20_*.md` are section companions to the Master
  Blueprint. Many remain short living-document shells; an empty section is not
  implementation evidence.
- Most files under `blueprints/02_...09_*.md` are Draft placeholders. The Sales
  Engine blueprint is the only detailed active engine blueprint at this snapshot.
- `README.md` provides orientation but contains older stack/status statements;
  current dependency and implementation claims must be checked against
  `package.json`, Git, and the tree.
- `VOKA_FULL_AUDIT.txt` is a historical evidence bundle generated 2026-07-31 on
  another workspace. It is not a current status ledger.
- `scripts/generate-docs.mjs` can overwrite several living docs with minimal
  templates. Do not run it without explicit review and approval.

## Conflict rule

Prefer approved decisions over drafts, current implementation evidence over stale
status prose, and current owner instruction over prior workflow defaults. Record
the conflict and update the authoritative source; never “solve” it by duplicating
another full policy block.
