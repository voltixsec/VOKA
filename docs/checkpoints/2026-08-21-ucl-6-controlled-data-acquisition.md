# UCL-6 — Controlled Real-World Data Acquisition & Source Governance

Date: 2026-08-21

Status: IMPLEMENTED ON FEATURE BRANCH / PENDING CTO REVIEW

Baseline: `7db31ed5c0dfece93ea4603155c01f837504fa0e`

UCL-6 adds explicit source approval/licensing states, health and bounded operating policy; auditable acquisition runs; atomic quota reservation; provider-neutral bounded acquisition envelopes; fail-closed HTTP/SSRF controls; safe retries; dry-run; payload minimization; and provenance linkage into the existing UCL-3 pipeline.

Canonical flow remains: governed source → acquisition envelope → UCL-3 staging → normalization → identity resolution → review/publication → Universal Library → explicit tenant adoption. No route writes Company Catalog.

The migration is forward-only and adds governance fields, run accounting, provenance links, constraints, and lookup/quota indexes. It has not been deployed.

The initial HTTP adapter accepts only governed structured JSON endpoints and one bounded page per run. No crawling, arbitrary URL, login, paywall, CAPTCHA, access-control bypass, or cursor-following loop exists.

REAL PILOT EXECUTED: NO. See [UCL_6_PILOT_REPORT.md](../UCL_6_PILOT_REPORT.md). UCL-7 NOT STARTED.
