# ADR-012: Multilingual Localization V2 / OpenAI

## Status

Accepted — Phase A foundation complete; Phase B generic persistence implemented and verified.

## Context

VOKA's persisted quotation localization remains bilingual Arabic/English. Global localization needs a provider-neutral boundary that accepts standards-based BCP-47 language tags without adding a closed locale list or weakening commercial integrity.

## Phase A decisions

1. Application and domain code depend on `TranslationPort`; OpenAI, Ollama, Gemini and Google Cloud remain infrastructure choices.
2. Locale values are strings validated and canonicalized with the runtime's `Intl.getCanonicalLocales`. Examples include `ar`, `en-US`, `fr-FR`, `zh-CN`, `zh-TW` and `hi-IN`; no application-owned allowlist defines the supported languages.
3. OpenAI translation uses `POST /v1/responses`. The request uses `instructions`, typed `input_text` content and strict JSON Schema at `text.format`. Responses are read from message `output_text`; refusals, incomplete responses, malformed payloads and schema mismatches fail safely.
4. Commercial identifiers, quantities, currency values, percentages, technical specifications, URLs and email addresses must survive exactly and case-sensitively. Validation failure rejects the translation and is not retried.
5. Only transient network/timeout failures, HTTP 429 and server errors are retried. Authentication, validation and other client failures are not.
6. `VOKA_TRANSLATION_PROVIDER` selects the translation provider independently of the legacy `VOKA_AI_PROVIDER`. OpenAI requires `OPENAI_API_KEY`; `VOKA_TRANSLATION_OPENAI_MODEL` selects its model.
7. UI language toggling reads persisted localization and does not make live model calls.

Chinese (`zh-CN`) and French (`fr-FR`) tests prove the generic Phase A boundary; they do not claim generic database persistence.

## Phase B generic persistence design & decisions

1. **Additive Schema Model (`LocalizedContent`)**:
   - Stores generic BCP-47 locale variants cleanly in PostgreSQL table `LocalizedContent`.
   - Fields: `id`, `companyId` (nullable), `resourceType`, `resourceId`, `fieldKey`, `locale`, `sourceLocale`, `text`, `status` (`PENDING` | `VALID` | `STALE` | `FAILED`), `sourceHash`, `provider`, `model`, `translatedAt`, `createdAt`, `updatedAt`.
   - Compound unique index: `[companyId, resourceType, resourceId, fieldKey, locale]`.
2. **Tenant Isolation vs Global UCL Ownership**:
   - Tenant-owned resources require `companyId` derived strictly from server-side context.
   - Global Universal Commercial Library (UCL) resources store `companyId = null`, preventing tenant ownership contamination and ensuring clear boundary isolation.
3. **Deterministic Source Hashing & Field-Level Invalidation**:
   - Pure SHA-256 hash (`computeSourceHash`) tracks source freshness.
   - Changing source content marks target variants as `STALE` only for the modified field, preserving valid translations for unchanged fields and unaffected locales.
4. **Dual-Write & Read Fallback Strategy**:
   - `QuotationLocalizationJobRunner` dual-writes translated variants to both legacy fields (`subjectAr`/`subjectEn`/etc.) and generic `LocalizedContent` rows (`ar`, `en`, `fr-FR`, `zh-CN`, etc.).
   - Reads try `VALID` generic localized variant first, falling back to legacy AR/EN fields, and finally to source text. STALE translations are never served as VALID.
5. **Historical Snapshot Immutability**:
   - Approved Quotations, Sales Orders, Contracts, and generated document snapshots remain strictly immutable. Generic localization only affects master/editable content before approval snapshot creation.
6. **No AI on Language Toggle Invariant**:
   - UI language switches read persisted generic `LocalizedContent` rows without making network or AI model calls.

## Consequences

- Existing bilingual persistence and document-integrity behavior remain unchanged.
- New language tags can pass through the provider-neutral translation boundary without source-code locale unions.
- A locale is not production-persistable merely because the Phase A adapter can translate it.
- Model recommendations require measured, explicitly authorized benchmarks; the repository must not fabricate benchmark results when credentials or live authorization are absent.
