# VOKA — V1 Product Experience, Branding & Product Closure Requirements

**Document Status:** Authoritative Roadmap & Product Requirements (DOCS ONLY)
**Authoritative Base Commit:** `728480f23ff90c342dd3007f12e9f09b42201b5c`
**Scope:** VOKA V1 Product Closure Roadmap Consolidation

---

## Executive Overview

This document formally captures the remaining V1 product-closure work for VOKA, establishing CTO-approved product requirements across 10 mandatory workstreams. These requirements complement existing architectural decisions (ADR-009, ADR-010, ADR-011, ADR-012) and govern the final engineering slices required before VOKA achieves release and pilot readiness.

---

## Workstream 1: OpenAI Production Connection & Translation Acceptance

### Context & Implementation Reality
- OpenAI is designated as the primary production translation provider for VOKA.
- Multilingual Localization V2 Phase B generic persistence is COMPLETE and merged via PR #72 (`LocalizedContent` model with BCP-47 canonicalization and dual-write support).
- The translation engine operates behind the provider-neutral `TranslationPort` abstraction (`OpenAITranslationAdapter`).
- Code support for `VOKA_TRANSLATION_PROVIDER=openai` and configurable model selection via `VOKA_TRANSLATION_OPENAI_MODEL` is implemented. The final production translation model selection is determined by measured benchmark and empirical translation acceptance testing rather than assumed defaults.

### Production Requirements & Acceptance Gate
1. **Environment & Operations Isolation:**
   - Provider API billing, organization/project setup, and key provisioning remain operational deployment steps.
   - `OPENAI_API_KEY` must remain strictly server-side and must NEVER be committed to source control or exposed to client bundles.
   - Do NOT claim that live OpenAI production credentials are already configured in production environments.
2. **Benchmark & Evaluation Protocol:**
   - Live production benchmark execution must be explicitly authorized by engineering lead/CTO prior to run.
   - Translation candidate models must be measured empirically on latency, cost, and accuracy, not assumed.
3. **Acceptance Criteria:**
   - Real quotation translation acceptance tests (end-to-end translation of multi-line commercial proposals) must pass before the V1 localization gate is considered accepted.
   - **Language Toggling Rule:** UI language switching (Arabic LTR/RTL toggle) must NEVER invoke AI or translation APIs. Switching UI locale only swaps static presentation dictionaries and persisted localized fields (`LocalizedContent`).
   - **Token Integrity Invariant:** Strict protected-token validation (`ProtectedTokenValidator`) remains mandatory. SKUs, MPNs, model numbers, currency amounts, percentages, quantities, technical units, URLs, and emails must be preserved without mutation or translation corruption.

---

## Workstream 2: Commercial Delivery Closure — Email + WhatsApp

### Existing Implementation Reality
- **Resend Email Delivery:** Fully implemented code path (`ResendEmailAdapter`).
- **Meta WhatsApp Cloud API:** Fully implemented code path (`MetaWhatsAppAdapter`).
- **Delivery Orchestration:** Multi-channel delivery capability (`Email`, `WhatsApp`, `Both`) and failed-channel retry logic exist (`QuotationDeliveryService`).
- **Audit Trail:** Delivery audit history and failure tracking are persisted in database audit records.

### V1 Commercial Acceptance Requirements
Before the delivery gate is accepted for V1 release, the following live environment configurations and end-to-end acceptance tests must be satisfied:

#### Email Delivery Slice:
- Production Resend account setup and domain verification.
- Verified sending domain and authoritative `from` address configuration.
- Secure environment credential management (`RESEND_API_KEY`).
- Live PDF attachment generation and delivery verification over SMTP/Resend API.
- Failure/retry behavior verification against invalid recipient addresses.
- Real recipient acceptance test on production-like mail servers.

#### WhatsApp Delivery Slice:
- Meta Business Account and WhatsApp Cloud API live account configuration (do NOT claim live Meta configuration is complete).
- Production phone number and sender setup in Meta Business Manager.
- Secure Meta access token management (`WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`).
- Required approved WhatsApp message templates registered with Meta.
- Real quotation PDF/document link delivery via WhatsApp Cloud API.
- Delivery/failure/retry behavior verification.
- Real recipient acceptance test on actual mobile WhatsApp clients.

#### Required Acceptance Modes:
- Email only
- WhatsApp only
- Both (Email + WhatsApp simultaneous dispatch)

---

## Workstream 3: Product Performance Pass

### Scope
The product performance pass applies holistically to VOKA across the entire application ecosystem, not merely the marketing landing page.

### Required Audit & Optimization Areas
1. **Initial App Load:** Cold boot latency, static asset delivery, and initial document payload size.
2. **Dashboard Rendering:** Primary dashboard layout render times and initial state synchronization.
3. **Navigation Transitions:** Next.js App Router client-side routing transitions between views.
4. **Client Hydration:** React hydration bottlenecks and layout shift prevention.
5. **JS Bundle Weight:** JavaScript bundle analysis, tree-shaking, and code-splitting evaluation.
6. **API Response Latency:** Time to first byte (TTFB) and p95/p99 latency across all `/api/` endpoints.
7. **Prisma / Database Queries:** Query profiling, N+1 query elimination, index coverage, and connection pooling efficiency.
8. **Network Efficiency:** Identification and removal of unnecessary or duplicate network requests.
9. **Asset Loading:** Image optimization, web font loading strategies, and static media caching.
10. **Quotation / PDF Preview:** In-browser PDF generation/render latency and preview caching.
11. **Loading / Skeleton Behavior:** Consistent visual skeleton loaders during async data fetches.
12. **Data Fetching:** Elimination of repeated data fetching via SWR/React Cache deduplication.
13. **Mobile Performance:** Mobile viewport responsiveness, touch responsiveness, and low-bandwidth performance.

### Methodological Principles
- Performance optimizations must be strictly **measurement-driven** using profiling tools (React Profiler, Chrome Lighthouse, Prisma Query Logging, Server Timings).
- Engineering must **diagnose before changing**: do not guess causes of slowness before profiling data is captured.
- Define explicit V1 performance acceptance budgets/targets (e.g., TTFB < 200ms, PDF Preview < 1.5s, Lighthouse Performance > 90) during the dedicated performance slice.

---

## Workstream 4: VOKA Web Brand / Theme System

### Requirements for Centralized Web Theme System
VOKA requires a centralized web theme system managed at the company level:
- **Preset Selection:** Companies may select from a small, curated set of theme presets (e.g., Corporate Navy, Modern Slate, Minimal Tech, Emerald Executive) via compact visual color selectors.
- **Scope:** Theme preferences are stored at the company level (`Company` model setting) and shared across both the tenant dashboard and web interfaces via unified CSS design tokens.
- **Design Tokens:** Controlled token variables for `Primary`, `Accent`, `Background`, `Surface`, and interactive states (`Hover`, `Active`, `Focus`, `Disabled`).
- **Accessibility Safeguard:** Automatic contrast ratio calculation and WCAG AA accessibility enforcement for text and interactive elements over selected theme colors.
- **Clean Architecture:** Elimination of scattered CSS theme patches or inline override hacks.
- **Curated Strategy:** Default theme remains of high professional quality. Presets are intentionally limited to prevent fragmented branding; custom hex inputs remain a potential future enhancement.
- **UI vs. Document Theme Separation:** Document/letterhead PDF themes are managed separately from Web UI themes while adhering to a cohesive overall brand philosophy.

---

## Workstream 5: Landing Page Rebuild / Alignment

### Assessment
The current public landing page is NOT accepted for V1 release and requires a complete visual and content rebuild.

### Target Requirements
- **Visual Alignment:** Cohesive design language, typography, and theme tokens matching the internal VOKA application dashboard.
- **Simplified Copy:** Drastically reduced marketing fluff; clear, crisp primary value proposition focused on speed, accuracy, and commercial clarity.
- **High-Value Benefits:** Highlights key capabilities (Smart Proposals, System Builder, Multilingual Documents, Multi-channel Delivery) without technical jargon overload.
- **Natural Arabic Copy:** Professional, natural Arabic commercial language tailored to regional business expectations, explicitly avoiding literal marketing translations from English.
- **Strong English Copy:** Clear, authoritative English copy matching the Arabic positioning.
- **Simple CTA Structure:** Direct call-to-action paths (e.g., "Request Demo", "Sign In").
- **Quality & Performance:** Mobile-first responsive layout, fast initial page load, fully accessible (WCAG AA), and SEO-ready structure.
- **Brand Messaging Core:** Communicates that VOKA is exceptionally simple and easy to use, making complex commercial document operations effortless.

---

## Workstream 6: Company Logo Experience

### Overview
Company branding settings must support two distinct, complementary workflows for logo acquisition and management.

### Workflows
#### A. Upload Logo
- Direct image asset upload (PNG, JPEG, SVG).
- Real-time client preview.
- Interactive fit, crop, and framing controls.
- Asset validation for transparency, web rendering, and PDF/document compatibility.

#### B. Create Logo (Generator)
- User enters brand/company name and selects simple visual preferences:
  - **Language:** English / Arabic / Bilingual
  - **Style:** Modern / Corporate / Elegant / Tech / Minimal
  - **Composition:** Text / Monogram / Icon + Text
- System deterministically or procedurally generates a small, bounded set of logo options (approximately 4–8 candidates).
- User previews, selects one candidate, and saves it as the active company logo asset.
- **Architectural Isolation:** The generation pipeline must be implemented behind a provider abstraction (`ILogoGeneratorAdapter`), allowing backend generator swapping without breaking branding domain logic.
- *Note:* Do NOT implement this task in the current slice.

---

## Workstream 7: Signature Experience

### Overview
Company and user signature management must support three capture pathways to accommodate diverse commercial workflows:

1. **Upload Signature:** Direct upload of existing image files with background validation.
2. **Draw Signature:** Interactive canvas-based drawing interface with touch and stylus support.
3. **Take Photo Workflow:**
   - User signs physical paper and captures an image via device camera.
   - Automatic signature edge detection and bounding box cropping.
   - Automated paper background removal producing a clean transparent asset.
   - Trim excess whitespace and sharpen line contrast/thickness.
   - Allow user-controlled adjustments (contrast, edge cleanups, thickness).
   - Real-time preview overlaid directly against actual document/letterhead backgrounds.
   - Optional digital styling (black or blue ink simulation, minor scaling, slight alignment rotation).
   - **Integrity Rule:** Software must NEVER alter the underlying shape, form, or visual identity of the signature beyond noise reduction and background isolation.

---

## Workstream 8: Authorized Signatories

### Future Product Concept
To support governance and legal hierarchy in enterprise organizations, VOKA introduces the concept of **Authorized Signatory Profiles**.

### Data Attributes (Future Schema Concept)
- Signatory Full Name (Arabic & English)
- Official Title / Position (Arabic & English)
- Signature Asset Reference
- Active / Inactive Status Flag
- Default Signatory Flag for Company
- Allowed Document Types (e.g., Quotations, Sales Orders, Contracts, Invoices)

### Domain Application
- Used during document approval flows to bind an authorized signatory to official PDF rendering.
- Dynamically populates approval blocks on Quotations, Sales Orders, and Contracts based on organizational delegation policies.
- *Note:* Schema and API implementation are deferred to a future slice.

---

## Workstream 9: Brand Asset Snapshot Invariant

### MANDATORY INVARIANT
Under NO circumstances shall updating company branding assets mutate or alter historically approved commercial documents.

### Invariant Rules
- Modifying company logo, web/document theme, signatures, or authorized signatories applies ONLY to future document drafts.
- Approved Quotations, Sales Orders, Contracts, and generated PDF binary snapshots are **IMMUTABLE**.
- The database record and generated PDF artifact for any approved historical document must permanently retain the exact brand assets, snapshots, logos, and signatures present at the exact time of approval.

---

## Workstream 10: Intended V1 Execution Sequence

Following the completion and merge of Multilingual Phase B persistence (PR #72), the authoritative product-closure execution sequence for V1 is established as follows (incorporating all core functional acceptance gates and new V1 closure workstreams):

1. **OpenAI Production Connection & Translation Acceptance**
2. **Email + WhatsApp Commercial Delivery Closure**
3. **Manual Core Product Acceptance** (Quotations, Sales Assistant, Customers/Products, Sales Orders, Contracts, PDFs, Language Switching)
4. **Voice End-to-End Acceptance** (Real browser microphone validation over transport-agnostic pipeline without audio persistence)
5. **Universal Commercial Library Population** (Governed multi-source population, normalization, classification, localization, publication)
6. **Smart System Coverage Expansion** (Extending versioned deterministic engineering templates)
7. **Product Performance Pass** (Holistic profiling and latency/bundle/query optimization across app)
8. **Brand System / Themes / Logo / Signature** (Centralized theme tokens, Logo generator/upload, Signature capture/cleanup)
9. **Landing Page Rebuild & Dashboard Alignment** (Simplified natural Arabic/English commercial copy, mobile-first, CTA alignment)
10. **Full Product Acceptance**
11. **Release Hardening**
12. **Staging**
13. **Real-user Pilot**
14. **V1 Release**

*Note:* None of these steps may be marked as complete until fully proven through automated tests and manual acceptance verification.
