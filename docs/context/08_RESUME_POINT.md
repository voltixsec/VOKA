# Resume Point

Verified on: 2026-08-20 (Asia/Kuwait)

## Current Verified State

- Canonical branch: `main`.
- Current canonical main baseline: `20c83d9c034189cbf40f907840fdaa81847c100b`.
- Official baseline before Phase 6.2: `d19d2bd2e306a7db066532ff873e9af5ed3a8349`.
- Phase 3 Proposal Composer UX is closed through PR #31.
- Phase 4.1 Approved Quotation to Sales Order Draft is closed through PR #33.
- Phase 4.2 Sales Order Confirmation & Cancellation is closed through PR #38.
- Phase 4.3 Sales Order Operational Workspace is closed through PR #39.
- Phase 5 Canonical Catalog Integration is closed through PR #40.
- Phase 6.1 Text AI Sales Assistant / Structured Commercial Draft is closed and merged through PR #42 after green Quality CI.
- Phase 6.2 Voice Input Transport is **CLOSED / MERGED** through PR #44 at `0c94f521d07d4a2f78f4eb5d67c60e27ce686772` after green Quality #79.
- Phase 6.3 AI Model Routing is **CLOSED / MERGED** through PR #46 at `8ad47179408e2753f1ece92aedb8d0e5ab0641d8` after green Quality #83.
- Phase 6.4A Localization Integrity is **CLOSED / MERGED** through PR #48 at
  `32823da495d7564c810b1479bb0133b11741e905`.
- Phase 6.4B Customer Master Data is **CLOSED / MERGED** through PR #50, with
  bilingual Customer UX completion through PR #51 at
  `fceba986768d09a69cb1c74fd7c90d62f2c53feb`.
- Phase 6.4C Delivery Configuration & UX is **CLOSED / MERGED** through PR #52
  at `a95dd42d32fed7022f006d1f4489c8715261dea9`.
- Phase 6.4D Dense Quotation Composer UX is **CLOSED / MERGED** through PR #54
  at `20c83d9c034189cbf40f907840fdaa81847c100b`.
- Phase 6.4 Product Integrity & Stabilization is formally closed.

## Phase 4 Commercial Downstream Boundary

Sales Orders now support:

- creation from APPROVED quotation snapshots;
- immutable historical commercial values;
- DRAFT, CONFIRMED and CANCELLED lifecycle states;
- confirmation and cancellation audit snapshots;
- tenant-safe lifecycle concurrency;
- Sales Order PDF generation;
- inherited immutable approved-document branding;
- multi-page document pagination;
- internal operational activity notes;
- tenant-scoped list/detail/activity APIs and UI.

Mutable customer, catalog, pricing or tax master data must never silently
rewrite historical quotation or Sales Order snapshots.

## Phase 5 Delivered Boundary

Phase 5 established canonical reusable commercial catalog data.

Delivered:

- semantically distinct PRODUCT and SERVICE catalog records;
- tenant-safe catalog CRUD/deactivation behavior;
- reusable Arabic and English item names and descriptions;
- reusable tenant/shared Units with Arabic and English values;
- bounded catalog search and pagination;
- Product/Service operational management UI;
- quotation Create/Edit catalog selection parity;
- reuse of persisted bilingual catalog values without unnecessary AI work;
- draft-time Price List lookup with Catalog sale-price fallback;
- legitimate zero Price List prices remain zero;
- tenant-safe Unit lookup and tenant-first/shared fallback behavior;
- company-scoped Unit symbol uniqueness;
- database-enforced uniqueness for shared Units with nullable company ownership;
- historical quotation and Sales Order snapshot safety after master-data changes.

Existing canonical Customer snapshot behavior remains authoritative and was
preserved; Phase 5 did not rewrite historical customer snapshots.

## Phase 6.1 Delivered Boundary (Merged through PR #42)

Phase 6.1 established the VOKA Text AI Sales Assistant for structured commercial drafting.

Delivered:

- Natural language sales request extraction (Arabic & English) into structured intent;
- Ollama infrastructure provider (`OllamaSalesAssistantAdapter`) with application-facing abstraction (`AISalesAssistantPort`);
- Untrusted AI output validation (`validateExtractedSalesIntent`) with deterministic heuristic parser fallback (`AISalesAssistantExtractor`);
- Candidate Customer matching against active tenant customers with strict ambiguity handling (`MATCHED`, `AMBIGUOUS`, `MISSING`);
- Active tenant Catalog item resolution with strict ambiguity handling (`MATCHED`, `AMBIGUOUS`, `MISSING`, `CUSTOM`);
- Server-owned canonical pricing via `PricingService` with zero PriceList price preservation;
- Non-authoritative `requestedPrice` capture for intent tracking;
- Server-owned tax rate and totals calculation reusing `QuotationCalculator`;
- Human approval boundary: proposal generation performs NO automatic persistence and NEVER creates Customer or Quotation records automatically;
- "Apply to Quotation" populates the existing quotation Create composer via temporary client transfer for explicit human editing and normal Save;
- Authenticated `POST /api/ai/sales-assistant/draft` route with tenant scoping and role authorization (`OWNER`, `ADMIN`, `SALES`);
- Responsive Arabic RTL and English LTR UI workspace (`/dashboard/sales-assistant`).

## Phase 6.2 Delivered Boundary (Closed / Merged through PR #44)

Phase 6.2 adds natural Voice Input Transport over the existing Phase 6.1 commercial drafting pipeline.

Delivered:

- Browser speech recognition abstraction (`src/infrastructure/voice/browser/`) exposing `BrowserSpeechRecognizer` and `useVoiceInput`;
- Bilingual natural voice capture supporting Arabic (`ar-KW`) and English (`en-US`) regional defaults mapped to app locale;
- Smart prompt concatenation: recognized voice input merges into existing prompt text without replacing typed content;
- Explicit user control: microphone control requires user click to start/stop listening; speech completion does NOT trigger automatic proposal generation or database mutations;
- Complete accessible UI state handling: `IDLE`, `LISTENING`, `PROCESSING`, `READY`, `UNAVAILABLE`, `PERMISSION_DENIED`, `ERROR` rendered with ARIA live regions and status semantics;
- Absolute privacy enforcement: zero audio persistence, zero backend audio uploads, zero audio schema/migration additions, zero transcript logging;
- Full fallback capability: text input remains 100% usable if voice API is unavailable or permission is denied;
- Comprehensive automated test suite: unit tests for browser speech recognizer, hook, and full integration tests covering all 16 prompt requirements without requiring real microphones.

CORE INVARIANT:

VOICE CAPTURES INTENT.
AI PROPOSES.
SERVER VALIDATES.
HUMAN SAVES.

## Phase 6.3 Delivered Boundary

Phase 6.3 adds cloud-primary/local-fallback model routing without changing application or domain authority.

Delivered:

- primary Ollama Cloud model support using `minimax-m3:cloud`;
- local fallback using `qwen3:1.7b`;
- independent Sales AI and Translation model configuration;
- cloud-compatible generation profiles without `format: "json"`, forced `num_ctx`, or low `num_predict` ceilings;
- local structured-output behavior retained where compatible;
- fallback on provider/network/timeout/HTTP/empty/invalid JSON failures;
- fallback on truncated `done_reason=length`;
- Sales semantic validation failure gets local AI fallback opportunity before deterministic heuristic extraction;
- Translation exact-key validation and fallback;
- no schema, migration, dependency or paid-provider requirement.

Final validation:

- focused: 42/42 PASS
- full: 106 files / 708 tests PASS
- TypeScript PASS
- lint PASS
- production build PASS
- diff check PASS
- GitHub Quality #83 PASS

Canonical Phase 6.3 merge: `8ad47179408e2753f1ece92aedb8d0e5ab0641d8`

## Phase 6.4 Delivered Boundary

Phase 6.4 closed the stabilization sequence across localization integrity,
Customer master data, delivery configuration/readiness UX and the dense
Quotation composer.

Canonical Phase 6.4 close: `20c83d9c034189cbf40f907840fdaa81847c100b`

## Phase 7 Approved Architecture

[ADR-010: Commercial Document Lifecycle](../ADR-010-COMMERCIAL-DOCUMENT-LIFECYCLE.md)
is approved.

Quotation-first is the recommended guided workflow, not a mandatory technical
dependency. Contract and Invoice may each be created directly when the business
process requires it. Quotation, SalesOrder, Contract, Invoice and Payment are
first-class aggregates with distinct business meaning.

Conceptual origins are `DIRECT`, `QUOTATION`, `SALES_ORDER` and `CONTRACT`.
Origin is provenance, not ownership of a downstream aggregate's lifecycle.

Historical Quotation, SalesOrder, Contract and Invoice meaning must not be
silently rewritten or repriced from current Customer, Catalog, Unit, TaxRate,
Price List or branding master data. Existing approved-Quotation and SalesOrder
snapshot guarantees remain authoritative.

Phase 7 delivery is sequenced as:

- 7A — Commercial Document Foundation;
- 7B — Contracts;
- 7C — Invoices;
- 7D — Payments & Receivables;
- 7E — Document Conversion / Orchestration.

This architecture synchronization does not implement Phase 7 schema,
migrations, domain code, APIs, UI or payment accounting.

## Continuing Guardrails

- Clean Architecture + DDD + dependency inversion.
- Domain stays independent of Next.js, Prisma, HTTP, browser speech APIs and AI providers.
- `companyId` always comes from authenticated server context.
- Cross-tenant resources use the established safe not-found boundary.
- Browser/client values are never canonical tax or totals authority.
- Approved quotation and Sales Order snapshots remain historical and immutable.
- AI produces proposals/drafts; consequential actions require human approval.

## Next Session Start Point

Phase 6.4 is closed and merged on canonical `main`.

Start the next development session with `CTO START SESSION`.

The next product frontier is **Phase 7A — Commercial Document Foundation**.

Before implementation, translate ADR-010 into bounded CTO-approved acceptance
criteria and decide only the concrete Phase 7A representation needed for:

- provenance/origin representation;
- common lifecycle and authorization boundaries;
- tenant-safe repository/application contracts;
- immutable historical snapshots;
- idempotency and duplicate prevention where conversion exists;
- backward compatibility with existing Quotation and SalesOrder behavior.

Do not assume Quotation is mandatory and do not promise an unsupported
conversion matrix.

Active development workflow: CTO + local Terminal + Jules.
GitHub is the durable source of truth across devices and Jules sessions.
