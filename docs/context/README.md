# VOKA Context Pack

Status: Living navigation layer

Snapshot date: 2026-08-04

Repository: `voltixsec/VOKA`

This pack supports `CTO START REPORT` and durable repository handoff between
sessions and workstations. It summarizes verified facts and links to the
authoritative source. It does not synchronize a live Codex conversation or its
in-memory state, and it must not become a competing blueprint.

## Read order

1. [Source map](00_SOURCE_MAP.md)
2. [Vision and governance](01_VISION_AND_GOVERNANCE.md)
3. [Architecture and data](02_ARCHITECTURE_AND_DATA.md)
4. [Implementation status](03_IMPLEMENTATION_STATUS.md)
5. [History and decisions](04_HISTORY_AND_DECISIONS.md)
6. [Work environments](05_WORK_ENVIRONMENTS.md)
7. [Execution playbook](06_EXECUTION_PLAYBOOK.md)
8. [Known issues and debt](07_KNOWN_ISSUES_AND_DEBT.md)
9. [Resume point](08_RESUME_POINT.md)

## Confidence labels

- **Approved**: stated in an approved ADR or governance document.
- **Verified**: observed in the current Git tree/history.
- **Historical**: true at the date of a recorded audit; recheck before acting.
- **Planned**: approved direction without implementation evidence.
- **Unknown**: the repository does not contain enough evidence; do not infer.

## Refresh triggers

Refresh the relevant page after an approved ADR, milestone completion, schema or
architecture change, branch handoff, workstation change, newly discovered debt,
or a new verified stopping point. Keep links stable and avoid copying whole source
documents.
