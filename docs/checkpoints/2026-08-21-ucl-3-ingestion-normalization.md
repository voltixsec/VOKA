# UCL-3 — Ingestion & Normalization Pipeline

Status: **IMPLEMENTED IN PR #62 / CTO REVIEW VERIFIED LOCALLY / PENDING MERGE**

Branch: `feature/ucl-3-ingestion-normalization-pipeline-17679525953001373204`

UCL-3 adds infrastructure only:

- source-isolated raw ingestion records with deterministic payload hashing;
- bounded, atomic batch claiming and retry-safe processing;
- Unicode-safe normalization using UCL-2 identifier rules;
- conservative, bounded identity resolution with ambiguous/conflicting evidence routed to review;
- transactional canonical publication with provenance and typed attributes;
- OWNER/ADMIN-only ingestion and processing APIs;
- synthetic regression tests.

The staging boundary cannot directly mutate tenant catalogs or historical commercial documents. Changed payloads for already-published source records require review rather than overwriting canonical identity.

No external commercial dataset or production seed data was added or ingested. UCL-4 has not started. The migration has been formatted and statically validated but was not applied to a production database. Merge and deployment remain separate approvals.
