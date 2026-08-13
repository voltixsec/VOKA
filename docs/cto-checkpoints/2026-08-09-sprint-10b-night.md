# VOKA — CTO Night Checkpoint

Date: 2026-08-09
Original development branch: feature/sprint-10b-proposal-composer
Checkpoint branch: checkpoint/2026-08-09-0112-sprint-10b

## Sprint

Sprint 10B — Proposal Composer / Quotation Localization

## Product localization decisions

- UI/document output is one language at a time: Arabic OR English.
- Language switch must never call AI.
- AI/localization runs on Save.
- Both Arabic and English variants are stored.
- TranslationPort remains provider-independent.
- Development provider is Ollama / Qwen.
- One batched translateMany() request per quotation Save.
- People, company and place names are transliterated.
- Business text is semantically translated.
- IDs, SKU, models, brands, quantities, prices, percentages, currencies, phones and emails stay unchanged.

## Localization status

Working:

- Subject localization
- Brief localization
- Project localization
- Attention/person localization
- Notes localization
- Terms localization
- Company Settings localization
- Arabic / English detail-page switching
- Localized UI fields
- QuotationLine database columns exist
- QuotationLine domain types contain localized fields
- Prisma mapper contains localized line fields

## Remaining bug

Quotation Lines localized values are not persisted after saving the quotation.

Observed API result after Save:

- itemNameAr = null
- itemNameEn = null
- unitNameAr = null
- unitNameEn = null

while quotation header localized fields persist correctly.

## Proven working pipeline pieces

Direct localizeQuotationDraft test returned:

- Black Cement / Bag
- White Gypsum / Bag
- 800g Mesh Sheet / Sheet

Direct domain pipeline probe proved:

1. localized lines are correct before replaceLines()
2. localized lines remain correct after replaceLines()
3. PrismaQuotationMapper.toPersistence() contains:
   - itemNameAr
   - itemNameEn
   - unitNameAr
   - unitNameEn

PATCH route currently:

rawBody
-> localizeQuotationDraft(rawBody)
-> localizedDto
-> UpdateQuotationUseCase.execute()

UpdateQuotationUseCase currently calls:

quotation.replaceLines(dto.lines)

Therefore DO NOT restart investigation tomorrow from:

- AI provider
- Qwen prompt
- UI
- Prisma schema
- migration
- QuotationLine type
- replaceLines
- Prisma mapper

These have already been proven.

## Exact next debugging step

Runtime trace during ONE quotation Save at:

[V0KA-LINES][AFTER-LOCALIZER]
[V0KA-LINES][AFTER-REPLACE]
[V0KA-LINES][AFTER-DISCOUNT]

If all three contain localized line values, inspect repository write / transaction runtime immediately after mapper output.

Do not do another broad audit.

## Test quotation

Quotation:

QT-353799

ID:

cmsku7tvn00025wt15n2l311x

Expected English line display:

Black Cement
300 Bags x USD 1.25

White Gypsum
300 Bags x USD 2.75

800g Mesh Sheet
1200 Sheets x USD 0.46

## PDF decisions

- Arabic title: عرض سعر
- Centered subject.
- Arabic label: البيان
- Maximum exactly two pages.
- No third page.
- No special discount boilerplate.
- No customer acceptance section.
- Page 2 repeats company/header identity.
- Signature / electronic approval on final page.
- PDF renderer must not invoke AI.
- Pipeline:
  Voice/Web -> AI extraction -> Draft -> Human Approval -> Snapshot -> PDF

## Scope types

- SUPPLY_ONLY
- SUPPLY_AND_INSTALLATION
- INSTALLATION_ONLY
- SERVICE
- MAINTENANCE
- CONSULTATION
- CUSTOM

## Performance issue to handle after correctness

Qwen Save localization is currently too slow.

Do not optimize until Quotation Lines localization is confirmed end-to-end.

Future options include:

- timeout protection
- smaller/faster local model
- localization job architecture

without violating the rule that language switching reads stored translations and does not call AI.

## Git rule

This is a WIP checkpoint only.

Do NOT merge this checkpoint directly to main.

Continue development from this checkpoint tomorrow, finish Quotation Lines localization, validate AR <-> EN end-to-end, then clean the history / prepare the proper Sprint 10B commit and PR.

## Tomorrow priority

1. Finish Quotation Lines persistence bug.
2. Verify Arabic -> English -> Arabic switching without AI calls.
3. Verify database localized line fields are non-null.
4. Continue Arabic/English PDF work.
5. Address Qwen Save latency.
6. Final Sprint 10B validation.
## Night checkpoint typecheck

PASS
