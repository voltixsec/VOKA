# VOKA — Master Product Acceptance Ledger

Status: **LIVING SOURCE OF TRUTH**
Owner: **CEO + CTO**
Last reconciled: **2026-09-02**
Current branch: `feature/pre-staging-product-coherence`
Verified HEAD: `62337fb84b82adcfa6f6965c4a246d7e08a14d01`

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

HEAD:

`62337fb84b82adcfa6f6965c4a246d7e08a14d01`

Checkpoint:

`checkpoint(voka): preserve sales assistant and quotation draft WIP`

At verification:

- local HEAD == origin branch HEAD;
- working tree was clean;
- no branch divergence was present.

CEO Acceptance Round 1 base:

`0f380cbebbe0b50d9c8099a3dfe19f3f4b54434e`

From that review checkpoint to current HEAD:

**49 commits ahead**

This means the original implementation checklist is historically authoritative but partially stale as a current-state tracker.

---

# 5. Current Program State

## ACTIVE NEXT PROGRAM

### Catalog Closure Program

Status: **NEXT ACTIVE**

The CEO has explicitly chosen Catalog as the next product area.

Sales Assistant and Quotation Draft are paused.

Payment remains a known blocker but is intentionally not the active workstream until the CEO reactivates it.

---

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

## CEO-R1-039 — Deferred Major Workstreams

Status: ⚪ **DEFERRED**

Deferred:

- full UCL population;
- full System Intelligence population;
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

# 12. Catalog Closure Program

Status: **NEXT ACTIVE PROGRAM**

## CAT-00 — Master Baseline

Status: 🟡 IN PROGRESS

Goal:

Freeze this Master Ledger and current Catalog truth before modification.

## CAT-01 — Deep Catalog Truth Audit

READ-ONLY first.

Audit:

- Prisma/data model;
- domain;
- application;
- infrastructure;
- APIs;
- UI;
- tests;
- tenant safety;
- localization;
- units;
- categories;
- taxes;
- prices;
- SKU/code/barcode identity;
- deletion/deactivation;
- duplicates;
- search;
- UCL boundaries;
- quotation integration.

Output:

`DONE / PARTIAL / BROKEN / NOT IMPLEMENTED / DEFERRED / LIVE ACCEPTANCE REQUIRED`

No coding before this matrix is complete.

## CAT-02 — CEO Catalog Acceptance Round

Hands-on screenshot-driven review.

Test at minimum:

- list;
- search;
- filters;
- pagination;
- create Product;
- create Service;
- edit;
- AR mode;
- EN mode;
- localization/fallback;
- code/SKU;
- unit;
- tax;
- sale/purchase price;
- Active/Inactive;
- quotation product selection/use.

Findings use IDs:

`CAT-R1-001`
`CAT-R1-002`
`CAT-R1-003`
...

Do not repair while still discovering unless a blocker prevents further review.

## CAT-03 — Core Integrity Corrections

Fix only evidence-backed issues from CAT-01/CAT-02.

Priority:

1. data integrity;
2. tenant safety;
3. identity;
4. localization;
5. unit/tax/pricing correctness;
6. UX.

## CAT-04 — ERP Import Foundation

Implements the first bounded part of `CEO-R1-018`.

Initial slice:

Official XLSX Template
→ Upload
→ deterministic Validation
→ Preview.

**No database commit during the first slice.**

## CAT-05 — Safe Import Commit

Add:

- mapping where required;
- duplicate/conflict strategy;
- transactional/batched writes;
- partial-failure policy;
- tenant isolation;
- audit evidence.

## CAT-06 — Catalog Export

Server-authoritative genuine XLSX.

No renamed CSV.

## CAT-07 — Catalog → Commercial Acceptance

Prove Catalog data enters commercial workflows correctly:

Catalog
→ product selection
→ localized identity
→ governed unit
→ governed price source
→ Quotation/commercial document snapshot.

AI must not overwrite authoritative commercial truth.

## CAT-08 — Catalog Closure

Required:

- TypeScript;
- focused tests;
- integration tests;
- tenant tests;
- AR/EN acceptance;
- responsive acceptance;
- diff check;
- updated Catalog ledger;
- CEO/CTO acceptance;
- checkpoint.

Only then may Catalog become 🟢 CLOSED.

---

# 13. Catalog Non-Goals for Current Program

Do not expand scope into:

- product image discovery;
- variants redesign;
- full UCL population;
- deep AI engineering;
- Payment repair;
- Drawing redesign;
- VOKA branding;
- subscription/billing;
- production deployment.

Any such expansion requires explicit CEO authorization.

---

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

Current product decision:

**Complete Catalog next.**

Current active sequence:

`CAT-00 → CAT-01 → CAT-02 → evidence-backed Catalog slices → CAT-08`

Paused:

- Sales Assistant
- Quotation Draft

Known blocker retained for later:

- Payment E2E

After Catalog Closure:

The CEO chooses the next workstream.

No next module is to be selected automatically.
