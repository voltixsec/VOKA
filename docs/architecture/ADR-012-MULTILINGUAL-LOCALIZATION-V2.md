# ADR-012: Multilingual Localization V2 / OpenAI Production Architecture (Phase A)

## Status
Accepted / Phase A Foundation Delivered (Phase B Generic Persistence Migration Pending)

## Context
VOKA V1 localization logic was historically coupled to bilingual Arabic-English (`"ar" | "en"`) switching and legacy local/cloud models (Ollama, Gemini, Google). Fields such as `subjectAr`/`subjectEn`, `briefAr`/`briefEn`, `notesAr`/`notesEn`, and `itemNameAr`/`itemNameEn` were hardcoded in Prisma entities and application translation services.

To expand VOKA into global commercial markets supporting arbitrary BCP-47 locales (`ar`, `en`, `fr`, `de`, `hi`, `es`, etc.) without altering commercial domain logic each time, a clean provider-neutral translation boundary and model strategy were required.

## Decisions

### 1. Provider-Neutral Translation Boundary
Domain and application layers depend exclusively on `TranslationPort`.
`OpenAITranslationAdapter` was implemented under `src/infrastructure/translation/openai/OpenAITranslationAdapter.ts`.
Legacy providers (`OllamaTranslationAdapter`, `GeminiTranslationAdapter`, `GoogleCloudTranslationAdapter`) are retained for complete backward compatibility.

### 2. Extensible BCP-47 Locale Architecture
`TranslationLocale` in `src/application/translation/ports/TranslationPort.ts` was evolved from `"ar" | "en"` to standard BCP-47 string representation with validation (`isValidLocale`) and canonical normalization (`normalizeLocale`).

### 3. OpenAI Responses API & Model Configuration
The native fetch API is utilized with structured JSON Schema output (`response_format: { type: "json_schema", ... }`).
Supported model family: `gpt-5.6-sol` (primary recommendation for high-value commercial documents), `gpt-5.6-terra`, and `gpt-5.6-luna` (recommendation for high-volume UCL translation).

Configuration via environment variables:
- `OPENAI_API_KEY`
- `VOKA_TRANSLATION_PROVIDER=openai`
- `VOKA_TRANSLATION_OPENAI_MODEL=gpt-5.6-sol`

### 4. Commercial Protected Token Strategy
Commercial & technical tokens must not be corrupted by translation.
`ProtectedTokenValidator` extracts and verifies SKUs, MPNs, GTINs, quantities, currency values (`KD 1,250.500`, `USD 250`), percentages, technical units (`4MP`, `8TB`, `220V`, `IP67`), URLs, and emails.
If protected tokens are mutated or lost in model output, the adapter safely rejects the translation.

### 5. Asynchronous Localization Invariant (No AI on Language Toggle)
Changing UI display language reads persisted translations from database snapshots.
UI language toggling MUST NOT initiate live OpenAI API requests. live translation runs strictly via background localization jobs or draft creation events.

## Phase B Generic Persistence Migration Proposal

### Proposed Additive Entity Model (`LocalizedContent`)
To transition from hardcoded bilingual fields (`...Ar` / `...En`) to generic multi-locale persistence without breaking historical snapshots or existing document approvals:

```prisma
model LocalizedContent {
  id              String   @id @default(cuid())
  entityType      String   // e.g. "QuotationHeader", "QuotationLine", "CatalogItem"
  entityId        String   // ID of target entity
  fieldKey        String   // e.g. "subject", "brief", "notes", "itemName"
  locale          String   // e.g. "ar", "en", "fr", "de"
  sourceLocale    String   // e.g. "ar"
  text            String
  status          String   // "VALID" | "STALE" | "FAILED"
  sourceHash      String
  provider        String?  // "openai" | "ollama" | "gemini"
  model           String?  // "gpt-5.6-sol"
  translatedAt    DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@unique([entityType, entityId, fieldKey, locale])
  @@index([entityType, entityId])
}
```

### Migration & Backward Compatibility Strategy
1. **Additive Schema Creation:** Deploy `LocalizedContent` in Phase B without deleting existing `...Ar` / `...En` columns.
2. **Dual-Write Phase:** Background localization job writes both `...Ar`/`...En` legacy fields and new `LocalizedContent` records.
3. **Read Fallback:** Domain repositories attempt to read from `LocalizedContent` for requested locale; fallback to legacy `...Ar`/`...En` fields if generic record is missing.
4. **Historical Snapshot Preservation:** Approved document snapshots (Contracts, Sales Orders, Quotation Deliveries) retain their immutable JSON payloads.

## Model Recommendations

- **High-Value Commercial Documents (Quotations, Contracts, Customer Deliveries):** `gpt-5.6-sol` due to highest fidelity, strict protected-token retention, and precise terminology.
- **High-Volume Catalog / UCL Normalization & Translation:** `gpt-5.6-terra` or `gpt-5.6-luna` due to lower latency, high throughput, and cost efficiency.
