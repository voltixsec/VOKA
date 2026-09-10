# 16 CTO DECISIONS

> This document is part of the VOKA Master Blueprint.

Primary Reference:

[VOKA_MASTER_BLUEPRINT.md](../VOKA_MASTER_BLUEPRINT.md)

This file contains implementation details for this section only.

Status: Living Document

## ADR-009: AI First

Official decision record: [ADR-009: AI First](../ADR-009-AI-FIRST.md)

- Status: Approved
- Date: 2026-08-04

### Context

VOKA is designed around a simple product philosophy:

> The customer talks. VOKA works.

Voice and AI remain the primary interface for normal users. Forms, manual
workflows, and bulk data tools support advanced use cases without replacing the
AI-first experience.

### Decision

- Every feature must be designed AI-first before forms or manual workflows are added.
- Every advanced feature must have an AI-first alternative.
- The Advanced Import / Export Center is approved as an optional, web-only capability for advanced users.
- Excel/CSV import complements Voice and AI and is not the default product experience.
- Codex is the official development execution agent for VOKA.
- Human approval remains required before consequential development actions.

### Roles

- CEO: Defines business vision.
- CTO: Owns architecture and technical approval.
- Codex: Executes implementation and does not own product or technical decisions.
- Human: Approves consequential actions and closes a task only by saying "تم".

Silence never closes a task or a session.

<!-- ADR-011-UCL-CTO-DECISION -->

## 2026-08-20 — Universal Commercial Library

Approved.

VOKA will evolve beyond a tenant-only catalog through a separate Universal
Commercial Library.

Permanent boundaries:

- Universal Library = shared commercial knowledge.
- Company Catalog = tenant commercial truth.
- tenant adoption is the boundary between them.
- Quotation, Contract, Sales Order and future Invoice records do not directly
  reference mutable Universal Library data as their commercial authority.
- Company pricing, tax, unit and historical snapshot rules remain
  server-authoritative.
- global search is bounded, indexed and paginated/cursor-based.
- no full global catalog fetch is permitted.
- AI receives only a small ranked retrieval candidate set.
- architecture must scale from PostgreSQL search toward hybrid/vector or
  dedicated search infrastructure without changing business semantics.
- source provenance, licensing, confidence and entity resolution are first-class
  concerns.

Canonical decision document:
`docs/ADR-011-UNIVERSAL-COMMERCIAL-LIBRARY.md`.


## 2026-09-03 — Universal Item Type Separation and System/Solution Boundary

Approved.

- `UniversalItemType` is the UCL classification contract.
- UCL supports PRODUCT, SERVICE, SYSTEM, SOLUTION, SHIPPING, LABOR, DISCOUNT and CUSTOM.
- `CatalogItemType` remains the six-value commercial contract.
- SYSTEM/SOLUTION are valid UCL discovery/publication/search records.
- SYSTEM/SOLUTION are excluded from default Commercial Hybrid Retrieval.
- SYSTEM/SOLUTION are not currently adoptable into Company Catalog.
- Future commercial conversion requires a separately approved governed policy.
- Smart System remains separate deterministic engineering/calculation execution.
- Library population is a separate governed OpenAI/Web research and ingestion flow.
- The Sales Assistant consumes governed published knowledge; it does not build the library.
- AI discovery is not canonical authority; provenance, validation, review and publication govern UCL truth.
- Permanent scaling invariant: **Huge Library, Small Working Set.**


## 2026-09-10 — Phase 4D bounded night closeout

Owner-authorized local verification and bounded fixes are recorded in the [night checkpoint](../checkpoints/2026-09-10-phase4d-night-close.md). Commercial Invoice/Contract labels and locale handling preserve frozen Quotation geometry without changing Quotation source/tests. Sector installation stores tenant selection, scopes discovery and does not bulk-adopt products. A narrowly identified existing ETIM alarm hierarchy is linked under Security; missing real published items remain a product-data blocker, not permission to synthesize or populate the library. C/D/D2 engineering gates pass; F installer/linkage gates pass while local real-content acceptance is BLOCKED (45 descendants, zero active items). Data Factory stays paused; Arena-only commit/push is authorized, with no official update, PR, merge or tag.

## 2026-09-10 — Phase 4D software close vs UCL content

Phase 4D module engineering (A–F installer) is CLOSED on Arena `3d570b1`. CEO visual acceptance of Invoice/Contract AR/EN is PASS. UCL **production item** population is a separate deployment/content prerequisite: governed JSONL is produced by Data Factory (paused) and ingested via existing platform-admin bulk-import + Review/Publish. Those files are not in Git. Customer GET must never bootstrap taxonomy or items. Do not fabricate UniversalCatalogItem rows to close F.
