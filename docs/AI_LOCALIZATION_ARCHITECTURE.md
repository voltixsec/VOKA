# VOKA — AI Localization Architecture

## Principle

Commercial Save and AI localization are separate operations.

User data must never fail to save merely because the AI provider is slow or unavailable.

---

## Save path

Client
→ PATCH quotation
→ validate
→ persist quotation
→ return success

Target latency:

milliseconds / low seconds.

No AI inference in this blocking path.

---

## Localization path

After successful Save:

→ schedule localization
→ create one batched TranslationPort request
→ provider performs localization
→ re-read quotation
→ stale-version/signature check
→ persist translated fields

---

## Language switch

Language switch does not call AI.

It reads:

- Arabic stored variant
- English stored variant

with controlled legacy fallback.

---

## Failure behavior

AI failure:

- commercial Save remains successful
- translated target may remain missing/old according to invalidation rules
- operational failure is logged
- job may be retried later

---

## Concurrency rule

Slow translation from Save A must never overwrite newer Save B.

Use stale signature/version protection before persisting AI output.

---

## Provider rule

Quotation/domain logic depends only on TranslationPort.

Providers are infrastructure:

- Ollama
- OpenAI
- Gemini
- Google
- future providers

---

## Current local development model

`qwen3:8b`

Chosen because the 4B benchmark was faster but violated translation/JSON correctness.

Current local configuration target:

- context 2048
- keep alive 15m
- bounded output 450
- background timeout 600 seconds

---

## Future optimization

Primary optimization is not replacing one batched request with multiple requests.

Keep one batch per localization job.

Reduce batch contents by translating only missing/invalidated target fields.

Long-term:

reuse localized catalog/customer data so repeated quotation generation requires less AI work.
