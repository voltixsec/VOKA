# VOKA — Master Product Acceptance Ledger

Status: **LIVING SOURCE OF TRUTH**
Owner: **CEO + CTO**
Last reconciled: **2026-09-03 — Product/UCL historical reconciliation**
Current branch: `feature/pre-staging-product-coherence`
Verified pre-reconciliation checkpoint HEAD: `006bdc72bf0bd19098aae84e74d54a6618c6c15a`

## 1. Purpose

This ledger is the current operational source of truth for VOKA product acceptance.

It does not replace or rewrite historical evidence. It reconciles:

1. Current code and current Git state.
2. Git history and implementation commits.
3. CEO hands-on acceptance evidence.
4. Automated test evidence.
5. Historical product documentation.
6. Known live failures.
7. Paused work and current execution priorities.

Historical authoritative records remain immutable:

- `docs/product/changes/2026-08-27-ceo-acceptance-review-round-1.md`
- `docs/product/changes/2026-08-27-ceo-acceptance-implementation-checklist.md`

The CEO Acceptance Review remains the historical record of what was observed.
This ledger records what is true now.

---

# 2. Status Model

## 🟢 CLOSED / PROTECTED

The governed user outcome is accepted and should not be redesigned without a new product decision.

Closure requires:

- implementation evidence;
- automated gates where applicable;
- live workflow evidence;
- CEO/CTO acceptance;
- a preserved checkpoint.

## 🟡 IMPLEMENTED / ACCEPTANCE PENDING

Substantial or complete implementation exists, but one or more live, data-backed, responsive, migration, or workflow acceptance gates remain.

Code existence alone is not closure.

## 🔴 OPEN / PARTIAL / BROKEN LIVE

The required outcome is incomplete, unimplemented, or has failed live acceptance.

A working API, component, or isolated test does not override a failed user workflow.

## ⚪ DEFERRED

Explicitly excluded by CEO decision.

Deferred does not mean defective.

---

# 3. Permanent Governance Rules

## G-001 — Commercial Authority Boundary

**AI understands. Rules calculate. Human approves.**

Generative output may understand, research, propose, clarify, recommend, and prepare work.

Consequential commercial truth remains governed by deterministic rules, domain logic, server authority, and human approval.

## G-002 — Workflow Acceptance

A feature is not complete because a button, API, class, test, or component exists.

Acceptance is based on the complete user outcome.

Examples:

- Voice must survive pause → continue → review.
- Payment must update every authoritative dependent.
- Drawing must reach clarification/review/commercial handoff.
- Import must complete template → mapping → validation → preview → safe import.
- Notifications must be actionable and persistent.

## G-003 — Commercial Truth

Screen, PDF, XLSX, dashboard, reports, and downstream documents must derive from authoritative governed values.

No implicit cross-currency aggregation or invented FX is allowed.

## G-004 — Historical Immutability

Approved commercial snapshots, quotation revisions, source provenance, document history, and signatory approval context must remain historically trustworthy.

---

# 4. Verified Current Baseline

Branch:

`feature/pre-staging-product-coherence`

Pre-reconciliation checkpoint HEAD:

`006bdc72bf0bd19098aae84e74d54a6618c6c15a`

Checkpoint:

`docs(product): add master acceptance ledger`

At the start of the 2026-09-03 Product/UCL historical reconciliation:

- local HEAD matched the pushed feature branch;
- working tree was clean;
- no merge to `main` had been performed;
- the Master Product Acceptance Ledger existed at checkpoint `006bdc7`;
- subsequent historical archaeology identified additional preserved UCL, ETIM, real-data pilot, and Smart System evidence that required this ledger reconciliation.

CEO Acceptance Round 1 base:

`0f380cbebbe0b50d9c8099a3dfe19f3f4b54434e`

The pre-reconciliation checkpoint is **50 commits ahead** of that Round 1 base.

Historical implementation documents remain evidence of what was true at their respective dates. This ledger reconciles those records with the current product decision and must not reinterpret older `PENDING MERGE` or `NOT STARTED` statements as current truth when later commits prove completion.

---
# 5. Current Program State

## ACTIVE NEXT PROGRAM

### Product Intelligence Closure Program

Status: **ACTIVE — CEO REACTIVATED 2026-09-03**

The active product program is no longer Catalog-only.

The CEO explicitly reactivated the complete Product / Catalog / Universal Commercial Library / Smart System topic after historical recovery proved that substantial architecture and implementation already existed and had previously been parked.

The active governed scope is now:

Company Catalog
→ Universal Commercial Library
→ governed external product population
→ taxonomy/classification
→ commercial retrieval
→ explicit tenant adoption
→ Smart System deterministic coverage
→ Catalog-to-commercial-document acceptance.

### Critical Resume Rule

**DO NOT create a second Catalog, UCL, ingestion, retrieval, acquisition, or Smart System foundation.**

Historical archaeology performed on 2026-09-03 proved that these foundations already exist.

Future work must resume from the preserved implementation lineage and close remaining population, coverage, integration, live-acceptance, and product-governance gaps.

Sales Assistant and Quotation Draft remain preserved/paused unless required for Product integration acceptance.

Payment remains a known blocker but is not automatically reactivated by this program.

---

## Product Intelligence Historical Recovery — Authoritative Resume Evidence

The following evidence supersedes any earlier interpretation that Product Intelligence required a new architecture or foundation.

### Universal Commercial Library preserved lineage

- `83cc3b4` — `docs(architecture): define Universal Commercial Library`
  - ADR-011 established the canonical separation between shared Universal commercial knowledge and tenant-owned Company Catalog commercial truth.

- `fb1ac46` — `feat(ucl): implement Universal Commercial Library foundation`
  - UCL-1 foundation.

- `3834be9` — `feat(ucl): expand Universal Commercial Library identity model`
  - UCL-2 manufacturers, brands, product families, aliases, identifiers and structured attributes.

- `e3622bfd4677bd5a3fe66488fab0a94ee2ba896a` — UCL-3 ingestion and normalization pipeline.
  - source-isolated staging;
  - payload hashing;
  - bounded batch processing;
  - normalization;
  - conservative identity resolution;
  - review routing;
  - provenance;
  - canonical publication boundaries.

- `d372952de9cd14dfe26b8e4c184e408be4333b03` — UCL-4 hybrid commercial retrieval.
  - Company Catalog + Universal Library retrieval while preserving tenant authority.

- `7db31ed5c0dfece93ea4603155c01f837504fa0e` — UCL-5 search intelligence and scale validation.
  - lexical/hybrid strategy;
  - provider-neutral semantic boundary;
  - deterministic exact-identity precedence;
  - bounded caching and observability;
  - synthetic 10k / 50k / 100k retrieval validation.
  - This was synthetic scale validation, not a production PostgreSQL/vector benchmark.

- `42832749399ca9c9c22e2a8a908f4ea5c88b57c6` — UCL-6 controlled external data acquisition.
  - governed source approval;
  - licensing/commercial-use states;
  - bounded acquisition;
  - SSRF/access safety;
  - retries;
  - dry-run;
  - quota accounting;
  - acquisition audit;
  - UCL-3 provenance linkage.

### Real external source pilots — 2026-08-23

Real-data qualification was completed after UCL-6.

#### Wikidata

Two bounded product dry runs requested 100 records each and returned 0 product records.

Decision:

`NOT_PREFERRED_PRIMARY_SOURCE`

Preserved role:

- taxonomy enrichment;
- knowledge graph references;
- manufacturer relationships.

Do not repeat Wikidata primary-product qualification.

#### Open Icecat

Technical API access was successfully proven using:

`https://live.icecat.biz/api`

Building & Construction vertical `4776`:

- requested: 100;
- successful: 99;
- restricted: 1;
- commercially useful: 88.9%;
- ACCEPT: 48;
- NEEDS_REVIEW: 40;
- REJECT: 11.

Lighting vertical `2332`:

- requested: 100;
- successful: 100;
- ACCEPT: 17%;
- REJECT: 76%;
- 76% of the sample was off-market/stale.

Decision:

`ICECAT_RECOMMEND_SUPPLEMENTARY_SOURCE_ONLY`

Approved strategic role:

- brand identity;
- MPN/product-code verification;
- GTIN/barcode enrichment;
- descriptions;
- structured technical specification enrichment.

Open Icecat is not approved as the sole global Product population source, and production generative-AI use still requires licensing/commercial clarification.

A local pilot review console was also built and preserved historically at:

`C:\Dev\VOKA-worktrees\ucl-icecat-pilot-ui-lighting`

It read local pilot JSON only and performed zero Prisma/UCL/Company Catalog writes.

### ETIM taxonomy population — 2026-08-25

Commit:

`76352b3 — feat(ucl): import governed ETIM taxonomy`

Official ETIM 10.0 English master taxonomy was imported locally through the existing governed UCL source model.

Verified local result:

- ETIM groups: **159**
- ETIM product classes: **5,640**
- Total Universal Categories: **5,799**

The importer is bounded, local-development-only, explicit-apply, hierarchy-validating and idempotent.

ETIM is authoritative taxonomy/classification evidence only.

It did **not** create products, prices, manufacturers, brands, Company Catalog records, tenant adoption records or commercial truth.

Historical checkpoint status:

`TAXONOMY_POPULATED / PRODUCT_POPULATION_EXTERNAL_SOURCE_PENDING`

### Smart System preserved implementation

The deterministic Smart System architecture also already exists.

Foundation proof systems:

- Gypsum Board
- CCTV

Additional bounded implemented system:

- Access Control `1.0.0`

Core invariant:

**AI identifies/proposes. Deterministic rules calculate. Human confirms commercial truth.**

AI must not invent engineering quantities, brands, models or prices.

Known remaining candidate deterministic packs include:

- Structured Cabling
- Wi-Fi
- Fire Alarm
- Ceiling
- Painting
- Tiles
- Electrical
- Lighting
- HVAC
- Plumbing

These candidates are NOT represented as implemented until separately evidenced.

### Historical stop point

The project did not stop because Product Intelligence architecture was missing.

The proven historical stop point was:

1. UCL architecture/foundation complete through UCL-6;
2. real source pilots complete;
3. ETIM taxonomy populated;
4. Smart System proof architecture implemented and expanded to Access Control;
5. broad authoritative product population still pending an approved source strategy;
6. additional deterministic Smart System coverage still pending;
7. real production-style database/search performance validation still pending;
8. final Catalog/UCL/Commercial live acceptance still pending.

This is the authoritative resume point.

# 6. Paused Work

## SALES-ASSISTANT

Status: 🟡 **PAUSED — NOT CLOSED**

Checkpoint:

`62337fb`

Substantial implementation includes:

- conversational runtime;
- Flexible Brain / Strict Brain separation;
- governed workspace;
- commercial clarification;
- research/tool pathways;
- proposed customer handling;
- engineering-to-commercial resolution;
- product selection state;
- pricing state;
- quotation handoff;
- governed quotation draft preparation;
- company scope defaults;
- company Terms integration;
- commercial projection coherence.

Known position:

The work is intentionally preserved and paused for broader product work.

Do not treat it as final acceptance.

## QUOTATION-DRAFT

Status: 🟡 **PAUSED — NOT CLOSED**

Latest correction work includes:

- Arabic quotation wording corrections;
- localized display units;
- governed selection mapping;
- Company Settings scope-based Terms;
- governed Notes separation;
- customer-required Draft readiness;
- product and price allowed to remain pending for Draft.

Remaining:

- live persistence/reload acceptance;
- remaining CEO observations;
- no bulk repair of historical malformed records.

---

# 7. Known Live Failures

## LIVE-FAIL-001 — Payment Registration End-to-End

Source:

`CEO-R1-030`

Status: 🔴 **BROKEN LIVE / BLOCKER**

CEO observed and reconfirmed that registering a payment from the Invoice workflow does not successfully complete the required commercial lifecycle.

Code exists.

This does NOT make the feature accepted.

Required successful workflow:

Issued Invoice
→ valid governed payment
→ immutable payment record
→ invoice recalculation
→ invoice history
→ Payments register
→ Customer Statement
→ Dashboard / summaries
→ audit event
→ meaningful notification where applicable.

Do not mark this item green from source-code inspection alone.

---

# 8. CEO Acceptance Round 1 — 40 Finding Ledger

Progress percentages below are management estimates only.
Status and acceptance evidence have higher authority than percentage.

## CEO-R1-001 — One Commercial Operating System

Status: 🟡
Estimated implementation maturity: **75%**

Implemented:

- substantial cross-module commercial composition work;
- shared patterns increasingly used;
- improved navigation/terminology/localization coherence.

Remaining:

- full shared commercial document family;
- final cross-module workflow acceptance.

---

## CEO-R1-002 — Intelligence and Authority Boundary

Status: 🟡
Estimated maturity: **90%**

Implemented:

- Flexible Brain / Strict Brain direction;
- governed workspace;
- server/domain authority;
- human review boundaries.

Remaining:

- full live acceptance across AI, Drawing, pricing and commercial execution.

---

## CEO-R1-003 — Quotation as Golden Commercial UX

Status: 🟡
Estimated maturity: **80%**

Implemented:

- shared commercial composer foundations;
- Sales Order coherence improvements;
- Invoice composer modernization.

Remaining:

- final cross-document design/output consistency.

---

## CEO-R1-004 — Authoritative Values and Currency Isolation

Status: 🟡
Estimated maturity: **85%**

Implemented:

- server-authoritative reporting/export direction;
- currency-separated dashboard logic;
- authoritative document export work.

Remaining:

- final reconciliation across screen/PDF/XLSX and live commercial workflows;
- Payment dependency remains broken.

---

## CEO-R1-005 — Multilingual Active-Language UX

Status: 🟡
Estimated maturity: **92%**

Implemented:

- major authenticated AR/EN cleanup;
- active-language presentation;
- catalog localization model;
- shared domain labels.

Remaining:

- final system-wide AR/EN live sweep.

---

## CEO-R1-006 — Arabic Typography Consistency

Status: 🟡
Estimated maturity: **90%**

Implemented:

- major typography normalization.

Remaining:

- final responsive and formal-output sweep.

---

## CEO-R1-007 — Temporary VOKA Logo

Status: ⚪ **DEFERRED / DECISION SATISFIED**

Do not redesign temporary VOKA corporate identity during the current correction program.

---

## CEO-R1-008 — Session Expiry During Active Work

Status: 🟡
Estimated maturity: **85%**

Implementation evidence:

`4f65cab — fix(auth): refresh valid sessions before protected requests`

Implemented:

- session middleware;
- access-refresh handling;
- invalid-cookie handling;
- regression tests.

Remaining:

- live long-form workflow acceptance beyond the original failure interval;
- unsaved-form preservation acceptance.

---

## CEO-R1-009 — Notification Center

Status: 🟡
Estimated maturity: **90%**

Implementation status in historical checklist:

**COMPLETE IN CODE**

Evidence:

`ebf4a80 — feat(notifications): add tenant-safe notification center`

Remaining:

- manual browser acceptance;
- later lifecycle event expansion as authorized.

---

## CEO-R1-010 — Search / User Menu / Logout

Status: 🟢 **PROTECTED**

CEO manually confirmed working behavior.

Do not unnecessarily reimplement.

Must survive final regression acceptance.

---

## CEO-R1-011 — Advanced Account Administration

Status: ⚪ **DEFERRED**

Future account-administration program.

---

## CEO-R1-012 — Voice Finalizes on Natural Pauses

Status: 🟡
Estimated maturity: **70%**

Substantial voice implementation exists after Round 1.

Remaining:

- explicit live proof of natural pause → continue → finish behavior;
- consistent retained-entry-point acceptance.

---

## CEO-R1-013 — Universal Commercial AI Assistant

Status: 🟡 **PAUSED**
Estimated maturity: **90%**

Major implementation exists for conversational commercial routing and Sales Assistant.

Remaining:

- final workflow acceptance;
- broader module intent acceptance;
- paused by CEO.

---

## CEO-R1-014 — Conversational Clarification Loop

Status: 🟡 **PAUSED**
Estimated maturity: **90%**

Implemented:

- clarification turns;
- conversational state;
- suggestion/context handling;
- governed workspace synchronization.

Remaining:

- CEO final live acceptance.

---

## CEO-R1-015 — Drawing Must Lead to Governed Commercial System

Status: 🔴
Estimated maturity: **45%**

Current gap:

The Drawing/Takeoff experience still does not prove the complete governed journey:

Upload
→ requested system
→ quantities/components
→ governed system recommendation
→ clarification
→ review
→ quotation.

Do not fabricate engineering facts or prices.

---

## CEO-R1-016 — Simplify Ordinary Drawing UX

Status: 🔴 / 🟡
Estimated maturity: **50%**

Some localization/UI cleanup exists.

Remaining:

- ordinary commercial journey;
- simplified result/history;
- complete clarification and quotation handoff.

---

## CEO-R1-017 — Product / Service Multilingual Identity

Status: 🟡
Estimated maturity: **92%**

Implementation status:

**COMPLETE IN CODE**

Evidence:

`240ea99 — feat(catalog): add extensible item localizations`

Implemented:

- scalable localization model;
- canonical identity;
- localized representations;
- governed fallback;
- preserved historical snapshots.

Remaining:

- migration deployment verification;
- live Catalog acceptance.

This finding becomes part of the active Catalog Closure Program.

---

## CEO-R1-018 — ERP-Style Import / Export Framework

Status: 🔴
Estimated maturity: **10%**

Current Catalog does not expose the required governed import workflow.

Required:

Official XLSX template
→ upload
→ mapping
→ validation
→ preview
→ row errors
→ duplicate/conflict handling
→ explicit safe batch commit.

This finding becomes a primary active Catalog workstream.

---

## CEO-R1-019 — Customer Form Unexpected Submission

Status: 🟡
Estimated maturity: **90%**

Evidence:

`93e505a — fix(customers): require deliberate form submission`

Implemented:

- explicit form submission protection;
- Enter behavior protection;
- Contact Picker regression coverage.

Remaining:

- live browser acceptance.

---

## CEO-R1-020 — Customer 360 Direction

Status: 🟢 **PROTECTED**

CEO-approved direction.

Preserve connected commercial context.

Do not regress tenant/currency authority.

---

## CEO-R1-021 — Statement Terminology / Arabic Presentation

Status: 🟡
Estimated maturity: **85%**

Substantial localization work exists.

Remaining:

- full formal AR acceptance;
- ensure accounting terminology remains domain-correct.

---

## CEO-R1-022 — Dashboard Counts Reconciliation

Status: 🟡
Estimated maturity: **90%**

Implementation status:

**COMPLETE IN CODE**

Evidence:

`b47ef67 — fix(dashboard): reconcile authoritative module metrics`

Remaining:

- manual data reconciliation against real module records.

---

## CEO-R1-023 — Quotation Revision Governance

Status: 🟢 **PROTECTED**

CEO manually exercised this successfully.

Preserve:

- approved immutability;
- family/revision numbering;
- historical read-only state;
- current revision clarity;
- downstream exact provenance.

---

## CEO-R1-024 — Quotation Detail / Revision Language Cleanup

Status: 🟡
Estimated maturity: **90%**

Major localization cleanup exists.

Remaining:

- final AR/EN live detail/revision acceptance.

---

## CEO-R1-025 — Sales Order Semantic Coherence

Status: 🟡
Estimated maturity: **90%**

Major implementation exists.

Evidence includes historical Sales Order coherence work.

Implemented direction:

- Sales Order is primary identity;
- source quotation is secondary provenance;
- exact source revision preserved.

Remaining:

- final screen/output/live acceptance.

---

## CEO-R1-026 — Shared Commercial Document Design System

Status: 🟡
Estimated maturity: **70%**

Implemented:

- shared commercial composer foundations;
- extensive PDF/XLSX authority work;
- document-family progress.

Remaining:

- one coherent header/footer/identity/table/totals/branding/signature system;
- final side-by-side screen/PDF/XLSX acceptance.

---

## CEO-R1-027 — Contract Output Coherence

Status: 🟡
Estimated maturity: **75%**

Implemented:

- contract lifecycle;
- payment stages;
- terms;
- notes;
- PDF;
- XLSX;
- provenance.

Remaining:

- final shared document visual/output alignment.

---

## CEO-R1-028 — Invoice Horizontal Editing

Status: 🟡
Estimated maturity: **90%**

Major composer modernization exists.

Remaining:

- final desktop/mobile acceptance;
- no awkward field discovery or overflow.

---

## CEO-R1-029 — Governed Invoice Source Selection

Status: 🟡
Estimated maturity: **75%**

Substantial source/composer work exists.

Remaining:

- prove user can choose eligible source without internal-ID discovery;
- prove authoritative source hydration and provenance live.

---

## CEO-R1-030 — Payment Registration Fails End-to-End

Status: 🔴 **BROKEN LIVE / BLOCKER**

Estimated implementation maturity is not a closure metric.

Code exists.

Live workflow failed.

See:

`LIVE-FAIL-001`

This item stays RED until the complete dependent lifecycle succeeds.

---

## CEO-R1-031 — Company Settings Correction

Status: 🟡
Estimated maturity: **75%**

Implemented:

- broader Company Settings;
- AR/EN identity;
- company assets;
- default currency;
- delivery readiness;
- scope-based Terms templates.

Remaining:

- final structured master-data review;
- jurisdiction/legal optional fields;
- responsive composition;
- final asset/authority separation acceptance.

---

## CEO-R1-032 — Live Email / WhatsApp Activation

Status: ⚪ **DEFERRED**

Do not activate or fake providers.

---

## CEO-R1-033 — Company Logo Studio

Status: 🔴
Estimated maturity: **5%**

Requested customer-company feature remains substantially unimplemented.

This is separate from VOKA corporate branding.

---

## CEO-R1-034 — Authorized Signatories Governance

Status: 🟡
Estimated maturity: **85%**

Substantial implementation exists:

- localized identity;
- upload/draw/capture;
- permissions;
- Active/Inactive;
- default signatory;
- document authorization direction;
- snapshot work.

Remaining:

- final audit-history verification;
- immutable approval snapshot live acceptance.

---

## CEO-R1-035 — Company Assets vs Personal Authority

Status: 🟡
Estimated maturity: **75%**

Principle:

Company assets:
- logo;
- letterhead;
- stamp/seal.

Personal authority:
- signatory name;
- title;
- signature;
- permitted document types.

Remaining:

- final Settings/document acceptance.

---

## CEO-R1-036 — Formal Language Quality

Status: 🟡
Estimated maturity: **92%**

Major AR/EN cleanup exists.

Remaining:

- full product sweep for raw enums, mixed language, direction and formal output quality.

---

## CEO-R1-037 — Commercial Export Authority

Status: 🟡
Estimated maturity: **85%**

Historical implementation includes authoritative XLSX/PDF work across major modules.

Required roles:

Screen = operational interaction.
PDF = fixed official delivery.
XLSX = structured editable downstream work.

Remaining:

- full reconciliation acceptance.

---

## CEO-R1-038 — Drawing / Takeoff Export Semantics

Status: 🔴 / 🟡
Estimated maturity: **55%**

PDF/XLSX export capability exists.

Remaining:

- complete Drawing workflow;
- uncertainty/provenance/review semantics throughout quotation handoff.

---

## CEO-R1-039 — Major Workstreams / Reactivation State

Status: 🟡 **PARTIALLY REACTIVATED BY CEO — 2026-09-03**

The original Round-1 decision deferred several major workstreams.

Historical deferral remains valid for:

- live WhatsApp;
- live Email;
- Google Cloud production infrastructure;
- subscription/billing;
- payment gateway;
- staging;
- production;
- pilot;
- final VOKA identity;
- Advanced Account Manager;
- deep CAD expansion.

The following two items are **NO LONGER DEFERRED** after explicit CEO reactivation on 2026-09-03:

- Universal Commercial Library / governed product population completion;
- Smart System / System Intelligence coverage expansion.

Reactivation does not authorize architectural replacement.

Both must resume from the preserved UCL-1 through UCL-6, ETIM, Company Catalog, and deterministic Smart System foundations documented in this ledger.

---
## CEO-R1-040 — Workflow-Based Acceptance

Status: 🟢 **PERMANENT GOVERNANCE RULE**

This is not a feature to implement once.

It governs every future closure decision.

---

# 9. Round 1 Workstream Ledger

To avoid ambiguity, these are named:

`R1-WS-A` through `R1-WS-Q`

They must not be confused with historical numeric workstreams such as WS8, WS9, WS10, etc.

| Workstream | Area | Current State |
|---|---|---|
| R1-WS-A | Session/Auth | 🟡 IMPLEMENTED / LIVE ACCEPTANCE PENDING |
| R1-WS-B | Localization/Typography | 🟡 COMPLETE IN CODE / FINAL ACCEPTANCE PENDING |
| R1-WS-C | Notifications | 🟡 COMPLETE IN CODE / BROWSER ACCEPTANCE PENDING |
| R1-WS-D | Voice + Commercial AI | 🟡 MAJOR IMPLEMENTATION / PAUSED |
| R1-WS-E | Drawing → Quotation | 🔴 PARTIAL / BLOCKER |
| R1-WS-F | Customer Form | 🟡 IMPLEMENTED / LIVE ACCEPTANCE PENDING |
| R1-WS-G | Product Multilingual Identity | 🟡 COMPLETE IN CODE / LIVE-MIGRATION ACCEPTANCE PENDING |
| R1-WS-H | ERP Import/Export | 🔴 OPEN |
| R1-WS-I | Dashboard Summaries | 🟡 COMPLETE IN CODE / DATA RECONCILIATION PENDING |
| R1-WS-J | Shared Commercial Documents | 🟡 PARTIAL / STRONG FOUNDATION |
| R1-WS-K | Sales Order | 🟡 STRONG IMPLEMENTATION / FINAL ACCEPTANCE PENDING |
| R1-WS-L | Invoice Composer/Source | 🟡 STRONG PARTIAL / E2E ACCEPTANCE PENDING |
| R1-WS-M | Payments | 🔴 BROKEN LIVE / BLOCKER |
| R1-WS-N | Company Settings | 🟡 PARTIAL / SUBSTANTIAL IMPLEMENTATION |
| R1-WS-O | Signatories | 🟡 STRONG IMPLEMENTATION / FINAL GOVERNANCE ACCEPTANCE |
| R1-WS-P | Company Logo Studio | 🔴 OPEN |
| R1-WS-Q | Full Product Acceptance Sweep | 🔴 FINAL CLOSURE GATE NOT EXECUTED |

---

# 10. Historical Workstream Naming Rule

Older project records contain numeric workstream labels including examples such as:

- WS8
- WS9
- WS10
- WS11
- WS12
- WS13
- WS14

These are historical Product/Release workstreams.

They are NOT equivalent to:

`R1-WS-A ... R1-WS-Q`

From this document onward:

- Round 1 workstreams always use prefix `R1-WS-`.
- Historical numeric workstreams use prefix `LEGACY-WS`.

This prevents future documentation ambiguity.

---

# 11. Catalog — Current Truth

Catalog is not a placeholder.

Current source surface includes:

- `features/catalog/domain`
- `features/catalog/application`
- `features/catalog/infrastructure`
- `app/api/catalog/items`
- `app/dashboard/products`
- `components/catalog`
- localization utilities and tests.

Current capabilities include substantial support for:

- Products and Services;
- create/edit;
- search/filter/pagination;
- code/SKU;
- sale/purchase pricing fields;
- unit;
- tax;
- active state;
- tenant-aware persistence;
- localized catalog representation.

Key historical catalog evidence includes:

`240ea99 — feat(catalog): add extensible item localizations`

Catalog Closure must build on this architecture.

Do not create a second Catalog implementation.

---

# 12. Product / Catalog / UCL / Smart Systems Closure Program

Status: **ACTIVE**

This program replaces the earlier Catalog-only execution interpretation.

It preserves the existing Company Catalog architecture and expands closure to the already-built Universal Commercial Library and deterministic Smart System foundations.

## PIC-00 — Historical Baseline Reconciliation

Status: 🟡 **IN PROGRESS**

Evidence recovered:

- Catalog canonical implementation exists;
- UCL-1 through UCL-6 exist;
- Open Icecat and Wikidata real pilots exist;
- ETIM taxonomy population exists;
- Gypsum, CCTV and Access Control deterministic system implementations exist.

Required before new architecture work:

- reconcile current code with historical evidence;
- identify regressions or missing integration;
- distinguish implemented vs population-pending vs live-acceptance-pending;
- preserve all existing boundaries.

No greenfield architecture is authorized.

## PIC-01 — Current-Code Integrity Audit

READ-ONLY first.

Verify current HEAD still preserves:

- Company Catalog canonical domain/application/infrastructure/API/UI;
- UCL schemas/entities/repositories/use cases;
- ingestion and normalization;
- hybrid retrieval;
- search intelligence;
- controlled acquisition;
- ETIM taxonomy and importer;
- explicit UCL → Company Catalog adoption;
- Smart System registry/templates;
- Quotation/commercial integration;
- tenant isolation;
- localization and authoritative pricing boundaries.

Output:

`DONE / PARTIAL / REGRESSED / BROKEN / NOT IMPLEMENTED / LIVE ACCEPTANCE REQUIRED`

## PIC-02 — Governed Product Source Strategy

Do not select a single global source by assumption.

Evaluate current authoritative/supplementary source options using:

- legal/commercial-use rights;
- redistribution rights;
- generative-AI rights;
- API/feed availability;
- freshness;
- identity quality;
- MPN/GTIN coverage;
- technical specification coverage;
- taxonomy compatibility;
- Middle East relevance;
- update frequency;
- cost;
- manufacturer authority.

Preserved historical roles:

- ETIM → taxonomy/classification;
- Wikidata → taxonomy/relationships enrichment;
- Open Icecat → supplementary identity/spec enrichment;
- Manufacturer Direct Feeds → preferred authoritative product-detail candidate.

## PIC-03 — Governed Product Population

Resume through the existing UCL acquisition → staging → normalization → identity resolution → review/publication pipeline.

Do not bypass UCL governance.

Required:

- approved sources only;
- bounded ingestion;
- provenance;
- deduplication;
- identifier integrity;
- review-required routing;
- canonical publication;
- no automatic Company Catalog mutation.

## PIC-04 — Company Catalog Adoption & Commercial Truth

Prove:

Universal Library
→ explicit tenant adoption
→ Company Catalog
→ tenant-governed unit
→ tenant-governed price/tax/inventory
→ localized identity
→ quotation/commercial snapshot.

Universal data must never overwrite tenant commercial truth.

## PIC-05 — ERP Catalog Import / Export

Preserve the existing CEO-R1-018 requirement.

Import:

Official XLSX Template
→ Upload
→ Mapping
→ deterministic Validation
→ Preview
→ row errors
→ duplicate/conflict strategy
→ explicit safe batch commit.

Export:

Server-authoritative genuine XLSX.

No renamed CSV.

## PIC-06 — Smart System Coverage Expansion

Resume the existing deterministic Smart System engine.

Existing evidence-backed systems:

- Gypsum Board;
- CCTV;
- Access Control.

Candidate future packs must each use a bounded versioned deterministic rule set and require separately evidenced engineering rules.

No AI-authored engineering quantities.

## PIC-07 — Search / Scale / Performance Validation

Preserve UCL-5 synthetic scale evidence but do not misrepresent it as production database benchmarking.

Required before scale closure:

- real PostgreSQL query-plan/latency validation;
- realistic populated corpus;
- bounded retrieval;
- tenant isolation;
- lexical fallback;
- optional semantic provider behavior;
- cache invalidation policy for mutable commercial truth.

## PIC-08 — Live Product Acceptance

CEO hands-on review must cover at minimum:

- Product/Service list;
- search/filter/pagination;
- create/edit;
- AR/EN;
- localization/fallback;
- code/SKU/barcode identity;
- unit/tax/pricing;
- Active/Inactive;
- UCL search;
- UCL item review;
- explicit adoption;
- quotation selection;
- commercial snapshot;
- Smart System request;
- deterministic component derivation;
- clarification where engineering input is missing.

## PIC-09 — Closure

Required:

- current-code evidence;
- automated gates;
- tenant/security tests;
- population/governance evidence;
- real performance evidence where applicable;
- AR/EN acceptance;
- responsive acceptance;
- live commercial workflow evidence;
- CEO/CTO acceptance;
- preserved checkpoint.

Only then may the integrated Product Intelligence program become 🟢 CLOSED.

# 13. Current Product Intelligence Boundaries

The current program now explicitly includes governed UCL population and deterministic Smart System coverage expansion.

It does **not** authorize unrelated expansion into:

- product-image discovery as a separate visual-product program;
- variants redesign without evidence;
- unconstrained web crawling;
- unlicensed or legally ambiguous production data use;
- automatic Universal Library → Company Catalog mutation;
- AI-authored engineering quantities;
- AI-authored tenant prices/taxes/inventory;
- Payment repair;
- Drawing redesign;
- VOKA corporate branding;
- subscription/billing;
- production deployment.

Any architectural replacement of Catalog, UCL, ingestion, retrieval, acquisition, adoption, or Smart System foundations requires an explicit new CEO/CTO architecture decision supported by evidence that the existing architecture cannot satisfy the requirement.

# 14. Safety Rules

Before every implementation slice:

1. Verify branch.
2. Verify HEAD.
3. Verify working tree.
4. Read this ledger.
5. Read the relevant domain ledger.
6. Identify exact acceptance criteria.
7. Make the smallest bounded implementation.
8. Run relevant gates.
9. Perform live acceptance where applicable.
10. Update documentation.
11. Do not commit/push without CEO approval.

Never:

- force push;
- reset the database casually;
- destroy migrations;
- remove stashes/backups without approval;
- trust client tenant/company identifiers;
- bypass domain authority for AI convenience;
- silently change historical approved records.

---

# 15. Closure Contract

A future agent or CTO session must NOT infer CLOSED from:

- a commit message;
- a checked checkbox;
- an API route;
- a test suite alone;
- UI component existence;
- assistant memory.

A workstream becomes CLOSED only when supported by:

**Code Evidence ✅**

**Automated Gate ✅**

**Live Workflow Evidence ✅**

**CEO/CTO Acceptance ✅**

**Checkpoint ✅**

If live evidence contradicts code evidence, live evidence wins and the item remains RED/YELLOW until reconciled.

---

# 16. Resume Point

Authoritative product decision as of 2026-09-03:

**Complete the entire Product / Catalog / UCL / Smart Systems topic from the existing implementation lineage.**

Do not restart from Catalog foundation or UCL architecture.

Current execution sequence:

`PIC-00 Historical Reconciliation`
→ `PIC-01 Current-Code Integrity Audit`
→ `PIC-02 Governed Product Source Strategy`
→ `PIC-03 Governed Product Population`
→ `PIC-04 Catalog Adoption & Commercial Truth`
→ `PIC-05 ERP Import / Export`
→ `PIC-06 Smart System Coverage Expansion`
→ `PIC-07 Real Scale / Performance Validation`
→ `PIC-08 Live Product Acceptance`
→ `PIC-09 Closure`

Preserved architecture:

- Company Catalog = tenant-owned governed commercial truth;
- UCL = shared governed commercial/product knowledge;
- UCL acquisition/normalization/retrieval foundations already exist;
- explicit adoption controls movement into Company Catalog;
- ETIM taxonomy is already populated locally as classification evidence;
- AI may understand/propose;
- deterministic rules calculate;
- human approval governs consequential commercial truth.

Historical resume frontier:

**authoritative product population + system coverage expansion + integrated live acceptance**

—not architecture reconstruction.

Paused unless required for integration acceptance:

- Sales Assistant;
- Quotation Draft.

Known blocker retained for later unless CEO reactivates it:

- Payment E2E.

No next unrelated module is selected automatically.


## 2026-09-03 Product Intelligence Architecture Decision

OpenAI/Web research is the approved primary bootstrapping and broad global
discovery mechanism for UCL population.

AI output is discovery/structuring input, not canonical authority.

Governed population:

OpenAI/Web Research
-> Discover
-> Analyze
-> Structure
-> Research
-> Validate
-> Stage
-> Review
-> Publish to UCL.

Evidence, provenance, confidence, source/legal governance, normalization and
review remain mandatory.

Current canonical classification boundary:

`UniversalItemType`
= PRODUCT | SERVICE | SYSTEM | SOLUTION | SHIPPING | LABOR | DISCOUNT | CUSTOM

`CatalogItemType`
= PRODUCT | SERVICE | SHIPPING | LABOR | DISCOUNT | CUSTOM

SYSTEM/SOLUTION:

- are valid UCL discovery/publication/search records;
- are excluded from default Commercial Hybrid Retrieval;
- are not currently adoptable into Company Catalog;
- require separately approved conversion/adoption policy before becoming tenant commercial truth.

Smart System remains a separate deterministic engineering/calculation layer.

The Sales Assistant is a downstream consumer of governed library knowledge and
has no direct role in building the Universal Library.

Permanent scaling rule:

**Huge Library, Small Working Set.**
