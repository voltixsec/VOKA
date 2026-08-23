# V1 Product Integrity Regression Baseline

Date: 2026-08-25

## Baseline

Authoritative main baseline:

`2bd203198a043a44dd4278b96739df3c0f7d1622`

## Purpose

This checkpoint preserves the valuable automated journey coverage originally created during PR #70 without claiming that VOKA is release-ready or ready for a real-user pilot.

The automated suite is a regression safety net, not a substitute for product completion or manual acceptance.

## Regression Coverage Preserved

The suite verifies core commercial journeys including:

- CCTV Smart System request
- Gypsum Board Smart System request
- incomplete Smart System confirmation
- invalid negative engineering input
- ordinary non-system quotation requests
- supply-only camera requests
- editable quotation continuity
- quotation persistence continuity
- PDF/output continuity
- current Arabic/English localization continuity
- voice transport privacy boundary

## Important Product Status

VOKA is NOT considered release-ready yet.

Automated green tests do not prove full product acceptance.

The current product frontier is:

**V1 Product Completion & Globalization**

## Mandatory Completion Gates Before Release Hardening

### Gate 1 — Multilingual Localization V2 / OpenAI

Required:

- provider-independent localization architecture
- OpenAI production translation adapter
- removal of hard-coded Arabic/English assumptions from the localization core
- configurable locale support
- protected commercial identifiers and numeric tokens
- persisted localized variants
- quotation, Sales Order, Contract, Catalog and UCL compatibility
- proof with at least one third language in addition to Arabic and English

### Gate 2 — Manual UI Product Acceptance

Manual acceptance is required for:

- Quotations
- AI Sales Assistant
- Customers
- Products / Services
- Sales Orders
- Contracts
- PDFs
- Arabic / English switching
- relevant dashboard navigation

Automated tests do not replace this gate.

### Gate 3 — Voice End-to-End Acceptance

Required:

- real browser microphone test
- Arabic speech → transcript
- transcript → same Sales Assistant pipeline
- Smart System flow
- editable draft
- quotation continuation
- permission/error/start/stop behavior

Voice remains input transport only.

### Gate 4 — Universal Commercial Library Population

UCL-1 through UCL-6 foundations remain preserved.

Real canonical population is still incomplete.

Required V1 source/population work must cover prioritized commercial sectors with governed acquisition, normalization, deduplication, classification, validation, localization and publication.

### Gate 5 — Smart System Coverage Expansion

Current CCTV and Gypsum Board templates prove the architecture.

Additional high-value system packs should be added using the same versioned deterministic engine after prioritization.

## Release Sequence

Only after the five completion gates are closed:

Product Completion
→ Release Hardening
→ Staging
→ Real-user Pilot
→ V1 Release

## Decision

PR #70 regression evidence is valuable and should be preserved.

Any previous conclusion that VOKA was ready for a real-user pilot is explicitly superseded by this checkpoint.

Current status:

**PRODUCT COMPLETION IN PROGRESS / NOT RELEASE READY**
