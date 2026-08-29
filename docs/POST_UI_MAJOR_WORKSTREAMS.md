# VOKA Post-UI Major Workstreams

Current architecture notes: [Agentic Commercial Intelligence Core](product/changes/2026-08-29-agentic-commercial-intelligence-core.md) and the separate [deferred Project BOQ Procurement Workspace](product/changes/2026-08-29-project-boq-procurement-workspace-deferred.md). These links record direction without reordering the workstreams below.

Status: **APPROVED FOR FUTURE DELIVERY — NOT CODE-COMPLETE**

This register prevents pre-staging UI closure from being confused with completion of external activation, commercial knowledge population, or engineering intelligence. Each workstream requires its own architecture review, acceptance evidence, and release decision.

## 1. Live commercial delivery activation

The Email and WhatsApp adapters remain `CODE_COMPLETE / EXTERNAL_ACCEPTANCE_PENDING`. Future activation requires real provider accounts, secrets, approved templates where applicable, DNS/authentication, monitored recipients, delivery evidence, retry/observability acceptance, and an explicit production authorization. PDF remains the formal customer-facing attachment. No credentials belong in source control.

## 2. Universal Commercial Library population

The governed ingestion, identity, retrieval, and pilot engineering foundation exists. Canonical population is incomplete. A later program must populate verified manufacturers, brands, products, services, models, identifiers, units, terminology, and categories from governed sources. Source, license, provenance, freshness, duplicate handling, and human approval remain mandatory. Global data must never be loaded wholesale into browser memory or silently adopted into a tenant catalog.

## 3. System Intelligence Library

This is distinct from the product catalog and Universal Commercial Library. It will define versioned system profiles for domains such as CCTV, access control, fire alarm, FM-200, structured cabling, Wi-Fi, electrical, lighting, HVAC, plumbing, and gypsum/partitions.

Each profile must define:

- required inputs and explicit missing-input behavior;
- deterministic rules, units, rounding, wastage, and limitations;
- code/region profile and effective version;
- typical component roles without invented brands, models, quantities, or prices;
- controlled product mapping;
- provenance for user-provided, calculated, and suggested values;
- human/engineer review requirements.

The governing pipeline is: project data, drawing, or BOQ + verified rules profile → proposed calculation/BOQ → qualified human review → commercial draft. Safety-critical engineering must fail safely when required inputs or governing rules are absent.

## Additional deferred platform decisions

- Cloud/hosting and production infrastructure remain provider-neutral pending a separate decision.
- Subscription billing and payment gateway selection are deferred. Candidate plan names and prices are exploratory and must not be hard-coded before market, Kuwait/global payment, tax, KNET, and compliance review.
- Future subscription limits may cover users, commercial records, AI/voice usage, drawing jobs, storage, exports, integrations, and governed library usage, but require a dedicated entitlement model.
- Regional pricing must retain source, currency, observed/effective date, and validity. AI must never invent prices and unlike currencies must never be summed without a governed FX engine.

None of these workstreams authorizes staging, production mutation, external provider activation, or a real-user pilot.
