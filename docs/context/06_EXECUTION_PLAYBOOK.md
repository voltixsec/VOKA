# Execution Playbook

## CTO START REPORT sequence

1. Read [Project Status](../PROJECT_STATUS.md), [Roadmap](../ROADMAP.md), and
   [CTO Journal](../CTO_JOURNAL.md).
2. Check whether a current `CTO_AUDIT.md` exists. None was present at this snapshot;
   use this pack and historical `VOKA_FULL_AUDIT.txt` with dates clearly marked.
3. Review the most recently changed active blueprint.
4. Run `git status -sb`, identify branch/tracking, and inspect recent commits.
5. Read approved ADRs and relevant architecture documents.
6. Review current Sprint, technical debt, and quality evidence.
7. State the first concrete task and its completion criteria.

Source checklist: [CTO START SESSION](../CTO_START_SESSION.md).

## Implementation sequence

Use the blueprint flow: Architecture -> Database -> Domain -> Application ->
Infrastructure -> API -> Tests -> Documentation -> Commit. Not every task needs
every stage, but dependency direction and validation always apply.

## Safe Git workflow

- Work on a feature branch, never directly on `main`.
- Inspect user changes before editing; stage explicit paths only.
- Review staged content with `git diff --cached --check`, `--name-status`, and `--stat`.
- Commit/push only after explicit authority.
- Do not treat push as task closure; closure still requires `تم`.

## Validation matrix

| Change | Minimum validation |
|---|---|
| Documentation only | Link/content review, `git diff --check`, name/status/stat |
| TypeScript/domain | Typecheck and focused/full tests |
| API/UI | Typecheck, tests, build; manual surface check when relevant |
| Prisma/schema | Prisma validate, migration review/status, tests, build |
| Dependency/tooling | Install integrity, typecheck, tests, lint/build as available |

If a check cannot run, report the exact missing prerequisite. Historical success
does not substitute for current validation.

## CTO CLOSE REPORT sequence

Review quality, Git status/diff, architecture decisions, audit, project status,
roadmap, journal, new decisions, and next task. Then commit/push only if explicitly
authorized. Source: [CTO CLOSE SESSION](../CTO_CLOSE_SESSION.md).
