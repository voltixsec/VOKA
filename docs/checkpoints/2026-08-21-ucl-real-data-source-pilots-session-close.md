# UCL Real-Data Source Pilots — Session Close

Date: 2026-08-21 (Asia/Kuwait)

## Canonical Baseline

- Repository: `voltixsec/VOKA`.
- Canonical branch: `main`.
- Session-close baseline: `42832749399ca9c9c22e2a8a908f4ea5c88b57c6`.
- UCL-1 through UCL-6 are merged. UCL-6 is PR #65 and is the current baseline.
- UCL-7 has not started.

## Delivered UCL Lineage

| Slice | Result | Canonical evidence |
| --- | --- | --- |
| ADR-011 | Universal Commercial Library architecture | `83cc3b4` |
| UCL-1 | Foundation, taxonomy, provenance, adoption and bounded retrieval | `fb1ac46` |
| UCL-2 | Commercial identity enrichment | PR #61 / `3834be9` |
| UCL-3 | Ingestion and normalization pipeline | PR #62 / `e3622bfd4677bd5a3fe66488fab0a94ee2ba896a` |
| UCL-4 | Hybrid commercial retrieval | PR #63 / `d372952de9cd14dfe26b8e4c184e408be4333b03` |
| UCL-5 | Search intelligence and scale validation | PR #64 / `7db31ed5c0dfece93ea4603155c01f837504fa0e` |
| UCL-6 | Controlled external data acquisition and source governance | PR #65 / `42832749399ca9c9c22e2a8a908f4ea5c88b57c6` |

## Wikidata Pilot Findings

- Qualification result: `QUALIFIED_WITH_REQUIRED_FIXES`.
- The adapter was corrected to parse `results.bindings`, send a monitored
  Wikimedia User-Agent contact, separate query and canonical entity hosts,
  keep a fixed server-owned query, honor `Retry-After`, reject raw client
  SPARQL, cap each run at 100, and prohibit pagination.
- Dry Run #1 and Dry Run #2 each made one real bounded request and returned zero
  records. Audit metadata only was permitted; neither run published canonical
  items, staged ingestion records, nor mutated a Company Catalog.
- Conclusion: the approved construction query was too restrictive. Wikidata is
  not the first product source, but remains a possible supplemental source for
  taxonomy, manufacturers, brands and reference enrichment after mapping review.

## Open Icecat Pilot Findings

- Current legal conclusion: `ICECAT_REJECTED` for direct production generative-AI
  use under the current Open Content License. Separate commercial terms or
  explicit legal approval are required before production UCL use.
- Technical access was nevertheless confirmed for temporary non-production
  evaluation: vertical index `4776` returned 100 references and datasheet
  `2975` (APC `LR1250I`) returned HTTP 200 with an OK response.
- Building pilot: 100 references; 99 successful, 1 restricted, 0 failed; 48
  ACCEPT, 40 NEEDS_REVIEW and 11 REJECT. Commercially useful: 88/99 (88.9%).
  Coverage was strongest for power/UPS and electrical products, but 48.5% of
  the sample was APC and 15.2% was irrelevant contamination.
- Lighting pilot: 100 references; 100 successful; 17 ACCEPT, 7 NEEDS_REVIEW and
  76 REJECT. Commercially useful: 24%. The sample was stale and concentrated:
  76% Philips by Signify and 76 records marked out of market.
- Source decision: `ICECAT_RECOMMEND_SUPPLEMENTARY_SOURCE_ONLY`, conditional on
  licensing, category mapping, freshness controls, stratified sampling and bias
  controls. It must not be the sole or primary construction source.

## Local Pilot UI

- Preserved worktree: `C:\Dev\VOKA-worktrees\ucl-icecat-pilot-ui-lighting`.
- Preserved branch: `review/ucl-icecat-pilot-ui-lighting`.
- Local route: `http://localhost:3000/admin/ucl-pilot/icecat`.
- The UI compares Building and Lighting pilot evidence using local JSON only.
  It performs no Prisma writes, canonical publication or Company Catalog mutation.
- Validation recorded in the pilot session: focused tests 10/10; full tests 991
  passed and 2 skipped across 147 passed and 1 skipped files; typecheck, build,
  diff check, visual QA and credential scan passed.
- The UI and pilot artifacts remain intentionally uncommitted and unpushed.

## Preserved Local State

- Wikidata adapter worktree: `C:\Dev\VOKA-worktrees\ucl-wikidata-pilot-adapter`
  at `63515c69fbac5c7d02a678d4befc62c2d97b0645`, with its report modification preserved.
- Open Icecat qualification, Wikidata qualification and Icecat pilot UI
  worktrees remain preserved with their local uncommitted artifacts.
- Local development database used for controlled pilots:
  `localhost:5432/voka`; UCL migrations through UCL-6 were applied locally.
  No production migration was performed.
- Credential names only: `WIKIMEDIA_USER_AGENT_CONTACT`, `ICECAT_API_KEY`, and
  `ICECAT_USERNAME`. Values are local secrets and must never be printed or committed.

## Next CTO Decision — No Option Selected

The next session must select exactly one bounded path after CTO review:

1. 500-record stratified/random Building analysis.
2. Industrial/Lab vertical `2835` qualification.
3. ETIM qualification.
4. Direct manufacturer-feed qualification.

No option is authorized by this checkpoint. Reconfirm source licensing,
governance limits, mutation boundaries and sample design before execution.

## Session-Close Invariants

- No canonical UCL publication occurred.
- No ingestion staging or automatic tenant adoption occurred.
- No Company Catalog mutation occurred.
- No production or remote database was changed.
- No credentials or raw bulk payloads were committed.
- UCL-7 was not started.
- Pilot branches/worktrees were not merged or deleted.
