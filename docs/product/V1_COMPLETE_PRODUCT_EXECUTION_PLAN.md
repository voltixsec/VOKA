# VOKA — Complete V1 Product Execution Plan

**Document Status:** Authoritative Product Execution Plan  
**Date Established:** 2026-08-24  
**Scope:** Remaining product work from Authentication UX Closure through V1 Release  
**Product:** VOKA — Voice-First AI Sales OS

---

# 1. Purpose

This document is the authoritative execution plan for completing VOKA V1.

It consolidates the previously approved architecture, product-closure roadmap,
commercial-document lifecycle, multilingual architecture, branding requirements,
manual product observations, and the additional product decisions established
during final product-shape review.

Existing ADRs and historical roadmap/checkpoint documents remain valid historical
and architectural references.

This document governs **execution order** from the current product state until V1.

New ideas discovered after approval of this plan must not silently reorder the
roadmap. They must first be recorded as a separate change proposal under:

`docs/product/changes/`

and then intentionally accepted, rejected, deferred, or inserted into this plan.

---

# 2. Product Definition

VOKA is a **Voice-First AI Sales OS** for companies and professionals who sell,
supply, install, contract, quote, invoice, and collect payment for commercial
products, services, and engineered systems.

VOKA is not primarily an architectural-design application.

The primary user may be:

- technical sales engineer;
- supplier;
- contractor;
- subcontractor;
- system integrator;
- specialist installer;
- commercial engineer;
- sales consultant;
- estimator;
- sales team;
- company owner or manager.

The system exists to reduce the time between:

**customer requirement → commercial understanding → structured scope → quantities /
products → quotation → downstream commercial documents → payment visibility**

---

# 3. Product Operating Model

The product is organized around three primary business circles:

## 3.1 Master Data

Canonical reusable business information:

- Customers
- Products
- Services
- Units
- Price Lists
- Taxes
- Company Settings
- Users / Members
- Branding Assets
- Authorized Signatories
- Commercial Library content

Master Data may improve future documents.

Master Data must NEVER rewrite historical approved document snapshots.

---

## 3.2 Commercial Operations

First-class commercial operations include:

- Quotations
- Sales Orders
- Contracts
- Invoices
- Payments

Quotation-first is the recommended commercial flow where appropriate,
but it is not a mandatory technical dependency.

Direct Contract and Direct Invoice workflows remain valid where the real
business process requires them.

Historical approved commercial documents are immutable.

---

## 3.3 Reporting

VOKA must expose business information created by operations through:

- customer-facing statements;
- financial and receivables reports;
- sales and quotation reports;
- contract reports;
- operational registers;
- management summaries;
- dashboard visibility.

Reporting is not merely charts.

It includes usable business outputs that may be reviewed internally or sent to
customers.

---

# 4. Intelligence Layer — Voice First

The Intelligence Layer serves Master Data, Operations, and Reporting.

VOKA is intentionally:

**VOICE + VOICE + VOICE → TEXT → SMART SYSTEMS → TRANSLATION → COMMERCIAL LIBRARY → DRAWING INTELLIGENCE**

The repeated word "VOICE" is deliberate product positioning.

## 4.1 Voice-First Principle

Voice is the primary AI-assisted interaction channel.

Text is fully supported, but is secondary to the intended Voice-first experience.

The user should increasingly be able to express commercial intent naturally:

- "اعمل عرض سعر للعميل ده"
- "ضيف عشر كاميرات"
- "غير الدفع لخمسين بالمية مقدم"
- "اعمللي سيستم الكاميرات الموجود في المخطط"
- "طلعلي الـ BOQ وخليه توريد وتركيب"
- "زود خصم خمسة بالمية"

Voice must work through the same server-authoritative commercial pipeline used by
text.

Voice must not obtain special authority over:

- tenant ownership;
- authentication;
- pricing authority;
- tax;
- totals;
- approvals;
- history;
- document immutability.

---

# 5. Governing Intelligence Rule

The core VOKA rule remains:

> **AI understands. Rules calculate. Human approves.**

AI may:

- interpret;
- extract;
- classify;
- suggest;
- translate;
- identify missing information;
- map products;
- interpret drawings;
- select deterministic templates.

AI must not silently invent consequential engineering or commercial truth.

Server-authoritative deterministic logic remains responsible for calculations,
commercial totals, document ownership, and invariant enforcement.

Human review remains mandatory before consequential commercial approval.

---

# 6. Historical Snapshot Invariant

Approved commercial history must remain immutable.

Changing any current master data must not mutate historical:

- customer identity snapshots;
- quotation content;
- product descriptions;
- unit prices;
- taxes;
- totals;
- logos;
- signatures;
- authorized signatories;
- themes;
- approval identity;
- PDFs.

A historical document represents exactly what was approved at that time.

---

# 7. Authentication and Public Entry Contract

Authentication is the security boundary between the public product and the
tenant application.

Required product contract:

`/`
→ Public Landing Page

`Sign In`
→ `/login`

Unauthenticated:

`/dashboard/*`
→ `/login?returnTo=<safe-path>`

Authenticated login:

`/login`
→ safe `returnTo` where available
→ otherwise `/dashboard`

Logout:

authenticated application
→ logout
→ `/login`

The Landing Page must:

- remain public;
- never render an authenticated Dashboard shell;
- provide clear Sign In navigation;
- visually align with the final VOKA brand;
- remain independent from authenticated application data.

The Dashboard must remain server-protected.

Authentication infrastructure errors must never be disguised as unauthenticated
redirects.

---

# 8. Quotation Revisioning — Mandatory Core Commercial Capability

Quotation revision history is a mandatory V1 commercial lifecycle requirement.

It is NOT acceptable to mutate an already approved quotation in place.

## 8.1 Commercial Identity

A quotation family keeps one commercial quotation number.

Example:

`Q-2026-00451`

Possible revisions:

- `Q-2026-00451 Rev.0`
- `Q-2026-00451 Rev.1`
- `Q-2026-00451 Rev.2`

These are revisions of the same commercial quotation identity.

They are not unrelated quotation numbers.

---

## 8.2 Edit vs Revise

While a quotation is editable DRAFT:

**Edit**

After quotation approval:

**Create Revision**

An approved quotation must never return to mutable editing.

Creating a revision produces a new editable revision based on the previous
revision while preserving the old revision unchanged.

---

## 8.3 Required Revision Semantics

VOKA must support:

- immutable historical revisions;
- incrementing revision number;
- current revision designation;
- previous revision relationship;
- revision creation from prior approved data;
- revision history UI;
- read-only historical revision access;
- exact PDF revision identification;
- audit history tied to exact revision;
- delivery history tied to exact revision;
- tenant-safe revision creation;
- concurrency protection;
- no revision-number reuse.

Example lifecycle:

`Rev.0 — Approved / Sent / Superseded`

`Rev.1 — Approved / Sent / Superseded`

`Rev.2 — Approved / Sent / Current`

Abandoned future revisions must not cause historical revision renumbering.

---

## 8.4 Downstream Provenance

Sales Orders, Contracts, Invoices, and other derived commercial documents must
preserve both:

1. quotation commercial family identity; and
2. exact source revision.

Example:

`Contract C-00142`

Source:

`Q-2026-00451 / Rev.2`

If a later `Rev.3` is created, the historical Contract must remain bound to
`Rev.2`.

No downstream historical document may silently move to a newer revision.

---

# 9. Authoritative Remaining Execution Sequence

The following sequence is the intended execution order.

A later workstream must not be used to hide an unresolved blocker in an earlier
workstream.

---

## Workstream 1 — Authentication UX Closure

**Current status:** IN FINAL MANUAL ACCEPTANCE

Already proven:

- standalone `/login`;
- server dashboard authentication gate;
- canonical `ApiError` runtime redirect fix;
- unauthenticated Dashboard redirect manual test;
- valid login reaching Dashboard;
- focused auth-gate regression tests;
- TypeScript validation;
- GitHub Quality CI.

Still require final manual acceptance:

- Account/Profile menu behavior;
- authenticated identity display;
- Logout;
- post-logout Dashboard protection;
- invalid credentials generic error;
- safe `returnTo`;
- Arabic / English login UX where applicable;
- session-expiry behavior.

This workstream closes only after manual acceptance is complete.

---

## Workstream 2 — Commercial Delivery Closure: Email + WhatsApp

Existing provider code must be converted into proven live commercial delivery.

### Email

Required:

- Resend production account;
- domain verification;
- approved From identity;
- secure server-side API key;
- live PDF attachment;
- real recipient delivery test;
- invalid-recipient failure behavior;
- retry verification;
- audit verification.

### WhatsApp

Required:

- Meta Business configuration;
- WhatsApp Cloud API production sender;
- production phone-number configuration;
- secure access token;
- approved message templates where required;
- real document / PDF delivery;
- real mobile recipient acceptance;
- failure behavior;
- retry;
- audit.

Acceptance modes:

- Email only
- WhatsApp only
- Both

Never silently mark delivery successful when an external provider failed.

---

## Workstream 3 — Manual Core Product Acceptance & Commercial Lifecycle Closure

This workstream validates VOKA as a real commercial application rather than a
collection of implemented modules.

Mandatory acceptance coverage includes:

- Customers;
- Products;
- Services;
- Units;
- Quotations;
- Quotation Revisioning;
- Sales Assistant;
- Sales Orders;
- Contracts;
- Invoices;
- Payments / Receivables;
- any missing Invoice or Payment lifecycle capability required by V1 must be implemented and accepted before Reporting closure;
- PDFs;
- approval;
- language switching;
- navigation;
- Search;
- Notifications;
- Smart Assistant;
- Account controls;
- empty states;
- error states.

### Quotation Revisioning Gap

Quotation Revisioning is a known mandatory core lifecycle gap and must be implemented,
tested, manually accepted, and merged before the Quotation lifecycle can be considered complete.

The product cannot claim complete Quotation lifecycle acceptance without it.

---

## Workstream 4 — Voice End-to-End Acceptance

Voice already exists as an input transport but requires real product acceptance.

Required:

- real browser microphone;
- microphone permission handling;
- Arabic speech;
- English speech;
- transcript review;
- transcript → Sales Assistant;
- structured commercial extraction;
- deterministic validation;
- human review;
- Save;
- no audio persistence;
- clear failures and retry.

Voice is not an optional decorative feature.

It is the primary VOKA interaction mode.

---

## Workstream 5 — Universal Commercial Library Population

The Universal Commercial Library must move from architecture and pilots into a
substantially useful commercial library.

Required:

- governed source acquisition;
- manufacturer-preferred authority;
- normalization;
- identity resolution;
- taxonomy;
- duplicate control;
- multilingual localization;
- review;
- publication;
- provenance;
- tenant-safe product mapping.

The library must be materially populated before V1 release.

A technically correct empty library does not satisfy this workstream.

---

## Workstream 6 — Smart System Coverage Expansion

Smart Systems convert natural commercial intent into reviewable engineering
commercial drafts.

Pipeline:

`Voice / Text`
→ Intent Extraction
→ System Template
→ Deterministic Calculation Engine
→ Product Mapping
→ Editable Draft

Quantities must not be invented by AI.

Missing required engineering information produces:

`NEEDS_CONFIRMATION`

Initial and future system packs may include:

- CCTV;
- Access Control;
- Structured Cabling;
- Wi-Fi;
- Fire Alarm;
- Gypsum Board;
- Ceiling;
- Painting;
- Tiles;
- Electrical;
- Lighting;
- HVAC;
- Plumbing;
- other approved bounded systems.

Each engineering ruleset must be versioned and deterministic.

---

## Workstream 7 — Product Performance Pass

Performance work must be measurement-driven.

Measure and improve:

- application initial load;
- Dashboard rendering;
- navigation transitions;
- hydration;
- JavaScript bundle size;
- API latency;
- Prisma queries;
- N+1 behavior;
- database indexes;
- connection behavior;
- duplicate network requests;
- images;
- fonts;
- PDF preview;
- async loading;
- mobile responsiveness;
- low-bandwidth behavior.

Explicit performance budgets must be established during this workstream.

Do not optimize based on guesswork.

---

## Workstream 8 — Brand System / Themes / Logo / Signature / Signatories

Required:

### Web Theme System

- curated company-level theme presets;
- centralized design tokens;
- accessibility;
- RTL/LTR compatibility.

### Company Logo

Support:

- Upload Logo;
- preview;
- fit / crop;
- validation;
- future bounded Create Logo workflow behind provider abstraction.

### Signature

Support:

- Upload;
- Draw;
- Photo capture;
- background cleanup;
- transparent output;
- preview.

Software must not alter signature identity.

### Authorized Signatories

Support organizational commercial approval identity:

- bilingual name;
- bilingual title;
- signature asset;
- active/inactive;
- default signatory;
- allowed document types.

### Snapshot Invariant

Changing current branding applies only to future drafts.

Historical approved documents remain unchanged.

---

## Workstream 9 — Landing Page Rebuild + Authentication Alignment

The existing Landing Page is not final V1 product acceptance.

Required:

- simple commercial messaging;
- Voice-first product positioning;
- natural Arabic;
- strong English;
- fast mobile-first experience;
- final VOKA visual identity;
- accessibility;
- SEO-ready structure;
- clear CTA;
- Sign In;
- authentication flow alignment.

Primary product message should emphasize simplicity:

**Speak. Understand. Quote.**

or an equivalent final brand phrase approved during the branding slice.

The Landing Page must communicate that complex commercial work can be executed
through a simple Voice-first workflow.

---

## Workstream 10 — Dashboard Command Center Completion

The Dashboard must represent the full first-class product.

Every major first-class module must have visible representation.

Examples:

- Customers;
- Products / Services;
- Quotations;
- Sales Orders;
- Contracts;
- Invoices;
- Payments.

Each applicable module card must:

- use real tenant-scoped database data;
- show meaningful count/status;
- be clickable;
- navigate to its operational workspace.

Decorative fake counts are prohibited.

The Dashboard is a command center and navigation overview.

Advanced financial analytics belong to the Reporting workstream rather than
being arbitrarily embedded into module cards.

---

## Workstream 11 — Reporting & Statements System

VOKA reporting is divided into customer-facing and internal/management outputs.

### Customer-Facing Reports

Mandatory core candidate:

### Customer Statement

Example:

One customer has:

- 8 invoices;
- 4 payments.

The statement must show:

- opening / relevant balance;
- invoices;
- payments;
- dates;
- references;
- debits;
- credits;
- running balance;
- outstanding balance.

Additional customer-facing outputs may include:

- Invoice Statement;
- Payment History;
- Outstanding Balance;
- Contract / Installment Statement.

Delivery formats:

- on-screen;
- PDF;
- Excel where appropriate;
- Email;
- WhatsApp.

### Management / Internal Reports

Candidate V1 reporting set:

- Outstanding Invoices;
- Aging:
  - 0–30;
  - 31–60;
  - 61–90;
  - 90+;
- Invoice Register;
- Payment Register;
- Sales by Customer;
- Sales by Period;
- Product / Service Sales;
- Quotation Status;
- Quotation Conversion;
- Sales Order Register;
- Contract Register;
- Contract Installment Schedule;
- Customer Activity History;
- Collections / Receivables summary.

Reports should also be reachable from their natural domain context.

Example:

Customer page:

- Statement
- Invoices
- Payments
- Contracts

Central Reports may expose aggregate views across all customers.

---

## Workstream 12 — Drawing-to-Quote Intelligence / Smart Takeoff

### Product Purpose

This capability is for people selling engineering or specialist commercial work.

The primary objective is NOT to replace architects or design consultants.

The objective is:

> receive a drawing → understand what the user wants to sell → extract a useful
> engineering takeoff → create an editable commercial draft / BOQ → allow human
> correction → build the quotation.

Examples:

- CCTV supply and installation;
- Low Voltage;
- Lighting;
- Electrical;
- HVAC;
- piping;
- insulation;
- waterproofing;
- epoxy systems;
- specialist anchoring / firestop systems;
- ceiling;
- gypsum;
- concrete quantity takeoff;
- other bounded supplier/contractor systems.

---

### 12.1 User Experience

The intended experience:

1. User opens VOKA.
2. User uploads a drawing.
3. User speaks.

Example:

"أنا عايز أورد وأركب نظام الكاميرات الموجود في المخطط ده."

or:

"طلعلي كمية الخرسانة للقواعد فقط."

or:

"اعمللي BOQ لنظام التكييف الموجود في الرسم."

VOKA analyzes only the requested commercial intent rather than attempting to
design the entire project.

---

### 12.2 Input Strategy

Initial and future supported drawing boundaries may include:

1. PDF — preferred first commercial slice;
2. DXF;
3. DWG through isolated adapter/conversion boundary;
4. IFC;
5. Revit / RVT through supported interchange or integration strategy;
6. images/scans as lower-confidence inputs.

The domain must not be coupled directly to AutoCAD or Revit.

Use an import abstraction such as:

`DrawingImportPort`

with provider/format adapters.

---

### 12.3 Internal Pipeline

Target pipeline:

`Drawing`
+
`Voice / Text User Intent`
→ Drawing Parsing
→ Geometry / Symbol / Annotation Extraction
→ System Intent Resolution
→ Engineering Takeoff Rules
→ Product Mapping
→ Editable BOQ / Commercial Draft
→ Human Review
→ Quotation

---

### 12.4 Provenance

Every derived quantity should preserve how it was obtained.

Candidate provenance values:

- `DRAWING_COUNTED`
- `DRAWING_MEASURED`
- `CALCULATED`
- `USER_PROVIDED`
- `AI_INTERPRETED`
- `CATALOG_MAPPED`
- `NEEDS_CONFIRMATION`

Example:

`Camera: 24 — DRAWING_COUNTED`

`Concrete: 38.6 m³ — DRAWING_MEASURED + CALCULATED`

`Cable: unresolved — NEEDS_CONFIRMATION`

Never present an uncertain inferred engineering quantity as certain.

---

### 12.5 Engineering Safety Rule

AI may recognize and interpret a drawing.

Engineering quantities must use deterministic methods wherever deterministic
geometry/rules are available.

If:

- scale is unclear;
- units are missing;
- symbols are ambiguous;
- drawing revision is uncertain;
- routes are missing;
- dimensions are insufficient;

VOKA must request clarification or mark the result as requiring confirmation.

---

### 12.6 Pricing Separation

Drawing Intelligence primarily produces:

- quantity;
- scope;
- BOQ;
- material/system requirement.

Pricing remains a separate commercial concern.

Takeoff may then use:

- Company Catalog;
- Price List;
- currency;
- tax;
- country/company commercial configuration.

If valid pricing is unavailable, VOKA may return an unpriced BOQ rather than
inventing a price.

---

### 12.7 Recommended Delivery Strategy

Do not make full multi-discipline DWG/Revit automation a hard prerequisite for
initial V1 unless explicitly approved later.

Recommended controlled first slice:

**PDF + one strongly bounded commercial discipline**

Candidate first discipline:

**CCTV / Low Voltage**

because:

- symbol counts are relatively reviewable;
- it aligns with existing Smart Systems;
- it is commercially relevant;
- engineering uncertainty is easier to expose;
- the pipeline can be proven before structural/mechanical expansion.

After validation, expand to additional disciplines.

---

## Workstream 13 — Full Product Acceptance

After all required product workstreams are complete, test VOKA as one complete
product.

Acceptance must include realistic end-to-end business journeys rather than only
isolated feature tests.

Examples:

Voice requirement
→ quotation
→ revision
→ approval
→ PDF
→ send
→ Sales Order / Contract / Invoice
→ payment
→ statement / reporting.

No workstream is considered complete merely because code exists.

---

## Workstream 14 — Release Hardening

Required before production release:

### Engineering

- full typecheck;
- full regression suite;
- production build;
- migrations review;
- Prisma generation where required;
- no debug instrumentation;
- environment documentation;
- no sensitive files tracked.

### Security

- authentication;
- authorization;
- tenant isolation;
- API input validation;
- secrets;
- upload validation;
- rate limiting where appropriate;
- dependency/framework review.

### Operations

- backup;
- restore procedure;
- monitoring;
- error visibility;
- production environment validation.

---

## Workstream 15 — Staging

Run the fully integrated product in a production-like staging environment.

Validate:

- authentication;
- database migrations;
- AI providers;
- translation;
- Email;
- WhatsApp;
- PDFs;
- uploads;
- branding;
- performance;
- tenant isolation;
- full commercial flows.

---

## Workstream 16 — Real-User Pilot

Only after staging acceptance.

Use real commercial users and real workflows.

Observe:

- usability;
- Voice behavior;
- quotation creation time;
- misunderstanding;
- error recovery;
- commercial-document workflow;
- reporting usefulness;
- performance;
- trust.

Pilot feedback may create controlled change proposals.

Pilot feedback must not silently destabilize historical/document invariants.

---

## Workstream 17 — V1 Release

V1 is the final step.

Release only after:

- Full Product Acceptance;
- Release Hardening;
- Staging;
- Real-User Pilot;
- final CTO review;
- green CI;
- approved production configuration.

---

# 10. V1 Priority Classification

Not every future idea must block V1.

Each newly proposed feature must be classified:

### MUST HAVE

Required for V1 correctness or promised product value.

### SHOULD HAVE

Strong V1 value but may be bounded if schedule/risk requires.

### EXPANSION

Architecturally documented and intentionally deferred beyond initial V1.

Drawing Intelligence may begin with a bounded V1 slice while broader
DWG / IFC / Revit and multi-discipline coverage remains an expansion path.

---

# 11. Change-Control Rule

After this document is approved, new product ideas must be captured separately.

Format:

`docs/product/changes/YYYY-MM-DD-<topic>.md`

Each change proposal must contain:

- Idea
- Business reason
- User value
- Product impact
- Architecture impact
- Data impact
- Security / tenant impact
- Historical snapshot impact
- V1 impact
- Proposed execution position
- CTO recommendation
- CEO decision

Only accepted changes should modify this Master Plan.

---

# 12. Delivery Governance

VOKA continues to use:

`Review → Execute → Test → Commit`

GitHub remains the shared code source of truth.

Rules:

- never implement directly on `main`;
- use bounded feature/fix/docs branches;
- review before commit where appropriate;
- focused tests after focused implementation;
- full gates near closure;
- no merge before CTO review and green required CI;
- tenant isolation is mandatory;
- no secrets committed;
- no destructive schema changes without explicit design review;
- do not rewrite user changes;
- historical snapshots remain immutable.

Implementation responsibilities are selected by task size:

- quick investigation / verification / Git operations:
  **CTO + user + Terminal**
- small, critical, surgical engineering fixes:
  **Codex**
- large, bounded implementation slices:
  **Jules**
- roadmap / architecture / acceptance / merge gate:
  **CTO**

Jules executes.

Jules does not independently redefine product architecture or roadmap.

---

# 13. Closure Rule

A workstream is not complete because:

- code was generated;
- a branch exists;
- a PR exists;
- tests alone passed.

Closure requires appropriate:

- implementation;
- CTO review;
- automated validation;
- manual acceptance where applicable;
- green CI;
- merge;
- explicit product acceptance.

The project execution order should remain stable unless a real blocker or an
approved Change Proposal requires deliberate modification.

---

# 14. Final Product Shape

VOKA V1 is intended to become:

**A Voice-First AI Sales Operating System that turns natural commercial intent,
company knowledge, deterministic engineering rules, documents, and eventually
drawings into reviewable commercial operations — while preserving financial,
tenant, and historical integrity.**

The product should feel simple to the user even when the system underneath is
complex.

The target user experience is:

**Speak → Understand → Review → Quote → Execute → Collect → Report**

---

# 15. Immediate Next Action

At establishment of this document:

1. Complete remaining Authentication UX manual acceptance.
2. Close Authentication UX.
3. Begin Commercial Delivery Closure — Email + WhatsApp.
4. Continue through this document in sequence.

Do not jump ahead simply because a later feature is more exciting.

---

