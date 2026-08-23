# V1 Smart Sales Assistant End-to-End Proof & Hardening

Date: 2026-08-24
Author: Jules (Senior Staff Engineer)

## Summary
Hardened and verified the end-to-end V1 Sales Assistant journey for VOKA. The flow seamlessly connects natural language prompts (text or voice) to intent detection, deterministic Smart System calculation, structured draft generation, review/confirmation safety, and the canonical quotation workflow.

## Flow Architecture
```
USER TEXT OR VOICE
        ↓
AI SALES ASSISTANT
        ↓
INTENT / SMART SYSTEM DETECTION
        ↓
DETERMINISTIC SMART SYSTEM BUILDER
        ↓
REVIEW / CONFIRMATION WHEN REQUIRED
        ↓
EDITABLE COMMERCIAL DRAFT
        ↓
EXISTING CANONICAL QUOTATION WORKFLOW
```

## Proof & Boundary Validation

### 1. CCTV Proof (Flow A)
- **Prompt:** `"عايز أعمل عرض سعر توريد وتركيب سيستم 8 كاميرات لفيلا"`
- **Behavior:** Detects CCTV system intent (`CCTV`). Preserves requested camera count (`8`, `USER_PROVIDED`), project context (`villa`, `USER_PROVIDED`), and installation intent (`true`, `USER_PROVIDED`).
- **Calculations:** Deterministically calculates NVR sizing (8 channels), required storage capacity (13 TB retention calculation), PoE switch ports, Cat6 cable rolls, RJ45 accessories, wall-mount rack cabinet, and commissioning labor.
- **Supply-Only Safeguard:** Prompts like `"عايز عرض سعر 8 كاميرات"` do NOT auto-inject installation or hijack system templates; they remain on the canonical product quotation flow.

### 2. Gypsum Board Proof (Flow B)
- **Prompt:** `"عايز عرض سعر توريد وتركيب واجهات جبس بورد لمساحة 2000 متر"`
- **Behavior:** Detects Gypsum Board system intent (`GYPSUM_BOARD`). Preserves area (`2000 m²`, `USER_PROVIDED`).
- **Calculations:** Applies deterministic formulas for gypsum board sheets (730 sheets), metal C-Studs, U-Runner tracks, drywall screws, joint tape, compound, wall anchors, and installation labor. Exposes 5% wastage default assumptions transparently.
- **Incomplete / Invalid Safeguards:**
  - `"عايز سيستم جبس بورد"` → Returns `NEEDS_CONFIRMATION` with missing input `areaM2`.
  - `"جبس بورد -200 متر"` → Returns `INVALID_INPUT` and safety warning.

### 3. Voice Transport Boundary
- **Transport:** Speech recognition occurs exclusively via standard browser APIs (`useVoiceInput` / `BrowserSpeechRecognizer`).
- **Data Boundary:** Transcribed speech text enters the *same* text processing pipeline as manually typed text.
- **Invariants:** No audio files or transcripts are persisted or transmitted to backends. Voice is an input transport only and never triggers automatic quotation persistence. Fully transport-agnostic for future Android clients submitting text to `POST /api/ai/sales-assistant/draft`.

### 4. Zero Fabrication Policy
- **Safety:** AI providers are strictly barred from inventing material counts, product specifications, or engineering parameters.
- **Server Authority:** When a system is detected, the server's deterministic template (`ISystemTemplate`) calculates quantities and provenances. AI output for engineering quantities is bypassed.

### 5. Editable Commercial Draft & Quotation Continuity
- Generated drafts (`SalesAssistantDraftProposal`) map directly into session state for `/dashboard/quotations/new`.
- Reuses canonical quotation calculation (`QuotationCalculator`), pricing, tax rates, and customer repositories without duplicating quotation persistence logic.

## Future Android Client Reuse Path
The application contract (`AISalesAssistantRequest`) accepts plain text prompts (`prompt: string`) and locale metadata (`sourceLocale?: "ar" | "en"`). An Android client running native speech-to-text can send the resulting transcript to `POST /api/ai/sales-assistant/draft` and receive the exact same structured draft proposal payload.

## Verification
- Unit & Adversarial Tests: 15/15 PASS (`SmartSystemBuilderAdversarial.test.ts`).
- Full Vitest Test Suite: 1000/1000 PASS across 148 test files.
