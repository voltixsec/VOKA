# Universal Commercial Library Source Strategy

Status: **CTO source-selection decision required before the next real-data pilot.**

## Strategy

VOKA requires a governed portfolio of sources rather than a single global
catalog provider. A source may be strong for identity, taxonomy, specifications
or market coverage without being suitable as canonical commercial truth.

Every source must pass four independent gates:

1. legal permission for VOKA's intended commercial and generative-AI use;
2. technical access through the UCL-6 governed acquisition boundary;
3. representative quality, freshness and bias evaluation;
4. explicit human-controlled publication and tenant adoption.

Passing a technical pilot does not pass the legal or production gates.

## Current Source Decisions

| Source | Current decision | Appropriate role | Blocking conditions |
| --- | --- | --- | --- |
| Wikidata | Qualified with required fixes; mapping review required | Supplemental taxonomy, manufacturer, brand and reference enrichment | Current construction query returned zero in two real dry runs; product-level mapping and recall remain unproven |
| Open Icecat | `ICECAT_RECOMMEND_SUPPLEMENTARY_SOURCE_ONLY` technically; `ICECAT_REJECTED` for current production AI use | Identity, brand, MPN, GTIN, descriptions and specifications after permission | Current Open Content License is insufficient for direct production generative-AI/UCL use; samples show category bias, contamination and stale records |
| ETIM | Not yet qualified | Candidate construction taxonomy and technical classification source | Licensing, access, multilingual coverage and mapping have not been reviewed |
| Manufacturer feeds | Not yet qualified | Candidate authoritative product identity, lifecycle and specification source | Each feed requires separate commercial terms, schema mapping, freshness and provenance controls |

## Required Production Controls

- UCL-6 source registration must remain approved, active, server-owned and bounded.
- Fixed source-owned requests only; no raw client query languages.
- SSRF, DNS, redirect, timeout, retry, rate-limit, quota and audit protections remain mandatory.
- Source external identity and canonical source URL must be preserved.
- License and provenance must survive normalization, resolution and publication.
- Duplicate resolution must be conservative; uncertain matches require review.
- No automatic canonical publication, tenant adoption or Company Catalog mutation.
- Sampling must be stratified and disclose brand, category, lifecycle and market bias.
- Freshness and availability must be measured separately from attribute completeness.
- The Company Catalog remains tenant-owned operational truth.

## Evaluation Metrics

Each bounded pilot must report requested, fetched, valid, useful, accepted,
review, rejected, restricted, failed, duplicate and changed counts. It must also
report language, brand, manufacturer, model/MPN, GTIN, category, specification,
provenance, lifecycle/freshness and sector coverage, plus a human-readable sample.

## Current Recommendation

Do not select a primary source yet. The next CTO session should choose one of:
a 500-record stratified Building analysis, Industrial/Lab vertical `2835`, ETIM
qualification, or direct manufacturer-feed qualification. The choice must be
explicit; this document does not authorize a network run or data mutation.

See [UCL Pilot Index](UCL_PILOT_INDEX.md) and the
[2026-08-21 session-close checkpoint](checkpoints/2026-08-21-ucl-real-data-source-pilots-session-close.md).
