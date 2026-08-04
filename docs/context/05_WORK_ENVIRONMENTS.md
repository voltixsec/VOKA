# Work Environments

## Observed workspaces

| Label | Observed path | Evidence | Notes |
|---|---|---|---|
| Current Windows workspace | `C:\Users\<current-user>\Documents\GitHub\VOKA` | Current session | Redacted example of the active workspace on 2026-08-04 |
| Historical Windows workspace | `C:\Users\<legacy-user>\OneDrive\Documents\GitHub\VOKA` | `VOKA_FULL_AUDIT.txt`, 2026-07-31 | Redacted example of an older OneDrive-backed workspace |

These paths are environmental examples, not mandatory commands or fixed locations.
The repository does **not** reliably identify which path is the office machine and
which is the home machine. Preserve these neutral labels until the owner records
the mapping. Do not infer identity from Windows usernames.

## Shared baseline

- Windows/PowerShell workflow.
- GitHub remote: `https://github.com/voltixsec/VOKA.git`.
- GitHub is the authoritative shared state between the two workstations. Do not
  treat copied folders, OneDrive state, or a local Codex session as source of truth.
- Local environment file `.env` is ignored and must never be committed.
- Current code expects `DATABASE_URL` plus JWT access/refresh configuration; the
  example file still lists `NEXTAUTH_*`, creating an environment-template mismatch.
- Database defaults and product locale assumptions include KWD and Asia/Kuwait.

## Handoff checklist between office and home

1. Confirm there is no unrelated local work with `git status -sb`.
2. Refresh remote state with `git fetch origin`.
3. Select the approved branch with `git switch feature/mvp-09-quotation-api`.
4. Fast-forward only with `git pull --ff-only origin feature/mvp-09-quotation-api`.
5. Never copy `.env`, generated Prisma output, `.next`, or `node_modules` through Git.
6. Compare `git rev-parse HEAD` with the tracking branch.
7. Install dependencies from the committed lockfile; do not assume either machine
   has usable `node_modules`.
8. Verify only environment-variable **names**, never record secret values.
9. Run Prisma validation, typecheck, tests, and build as appropriate.
10. Update [Resume Point](08_RESUME_POINT.md) after an approved handoff.

The commands synchronize repository state only. Codex conversation history,
temporary reasoning, approvals, and live session state do not automatically move
between devices; durable information must be recorded in approved repository docs.

## Tooling caveat

GitHub CLI `gh` was unavailable in the current environment during an attempted
close workflow. Git push may use other Git credentials, but workflows requiring
`gh` need it installed and authenticated first.
