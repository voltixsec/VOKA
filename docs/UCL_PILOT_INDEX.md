# Universal Commercial Library (UCL) — Data Pilot Index

**Last Updated:** 2026-08-23
**Status:** AUTHORITATIVE PILOT REGISTER

---

## Executive Summary

This register indexes all real-data and technical pilot evaluations conducted for the Universal Commercial Library (UCL) following UCL-6. It records pilot parameters, outcomes, decisions, artifacts, and next steps for clear auditing and future reference.

---

## Pilot Register

| Source | Pilot Name | Status | Records Evaluated | Strategic Decision | Artifacts & Tooling | Next Action |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Wikidata** | Dry Run #1 | Complete | 100 requested / 0 fetched | `NOT_PREFERRED_PRIMARY_SOURCE` | Acquisition Audit Logs; Adapter code at `be02b3eb` & `63515c69` | Preserved for taxonomy & manufacturer relationship enrichment. Do not re-run product queries. |
| **Wikidata** | Dry Run #2 | Complete | 100 requested / 0 fetched | `NOT_PREFERRED_PRIMARY_SOURCE` | Acquisition Audit Logs | No further action required. |
| **Open Icecat** | Technical Access Qualification | Complete | 1 test product (`APC LR1250I` / ID `2975`) | `ICECAT_PILOT_ACCESS_CONFIRMED` | API auth discovered; streaming index extractor | Access mechanics proven. Proceed to vertical sampling. |
| **Open Icecat** | Building & Construction Quality Pilot (Vertical `4776`) | Complete | 100 requested / 99 successful | `ICECAT_RECOMMEND_SUPPLEMENTARY_SOURCE_ONLY` | Pilot audit JSON payload; 48.5% ACCEPT, 40.4% REVIEW, 11.1% REJECT | Use for MPN/GTIN/spec enrichment. Evaluate stratified sampling (Option A). |
| **Open Icecat** | Lighting Quality Pilot (Vertical `2332`) | Complete | 100 requested / 100 successful | `REJECT_AS_PRIMARY_LIGHTING_CATALOG` | Pilot audit JSON payload; 17% ACCEPT, 76% REJECT (76% off-market) | Do not use Icecat as primary lighting catalog source. |
| **Open Icecat** | Pilot Review UI Console | Complete | Local UI review over 200 pilot samples | `LOCAL_TOOLING_PRESERVED` | Local worktree `ucl-icecat-pilot-ui-lighting` at `http://localhost:3000/admin/ucl-pilot/icecat` | Preserved in local worktree for CTO review. 0 DB writes, 0 publications. |

---

## Detailed Pilot References & Reports

1. **Wikidata Dry Runs:** Recorded in `docs/checkpoints/2026-08-23-ucl-real-data-pilots-session-close.md` (Section 3).
2. **Icecat Building & Construction Pilot Report:** Recorded in `docs/checkpoints/2026-08-23-ucl-real-data-pilots-session-close.md` (Section 5).
3. **Icecat Lighting Pilot Report:** Recorded in `docs/checkpoints/2026-08-23-ucl-real-data-pilots-session-close.md` (Section 6).
4. **Pilot Review Console UI:** Detailed in `docs/checkpoints/2026-08-23-ucl-real-data-pilots-session-close.md` (Section 8).
