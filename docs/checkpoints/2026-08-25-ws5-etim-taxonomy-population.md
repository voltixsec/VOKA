# WS5 ETIM Taxonomy Population

Date: 2026-08-25

Status: **TAXONOMY_POPULATED / PRODUCT_POPULATION_EXTERNAL_SOURCE_PENDING**

## Delivered

- Added source provenance to Universal Categories: governed source, external identity, source version, and source URL.
- Added a local-development-only, explicit-apply ETIM CSV importer with bounded file counts, hierarchy validation, UTF-8/UTF-16LE support, quoted-field parsing, and idempotent upserts.
- Registered ETIM International as an APPROVED governed taxonomy source with ODC Attribution 1.0 licensing, commercial/redistribution allowance, required attribution, and taxonomy-only governance notes.
- Imported official ETIM 10.0 English master taxonomy from ETIM International's official release download.

## Local population result

- ETIM groups: 159
- ETIM product classes: 5,640
- Total Universal Categories: 5,799
- Second apply returned the same counts, proving idempotent source identity and no duplicate growth.
- Representative identities verified: `EC000003` RCCB, `EC000019` Coaxial cable, and `EC000025` Dimmer.

## Boundaries

- Taxonomy is not presented as product/manufacturer truth.
- No product, price, manufacturer, brand, Company Catalog, adoption, or tenant data was created.
- Wikidata product acquisition was not repeated.
- Open Icecat pilot data was not published because its documented production/AI licensing decision remains unresolved.
- The downloaded ETIM archive remained temporary and was not committed.

## Source and attribution

- Source: ETIM International, ETIM 10.0 English master release.
- Licence: Open Data Commons Attribution License 1.0.
- Required attribution is persisted on the governed source and category descriptions.

## Validation

- Focused ETIM/UCL tests: 14 passed.
- Typecheck: PASS.
- Prisma validate/generate: PASS.
- Local migration applied without reset/drop/destructive operation.
- Diff check: PASS.

## External source register

- Product population still requires an approved manufacturer-authoritative or contractually approved commercial dataset.
- Open Icecat may only be reconsidered after legal/commercial clarification for production generative-AI use.
- Wikidata remains suitable only for later taxonomy/relationship enrichment, not another product dry run.

## Next action

Proceed to WS6 Smart System Coverage Expansion while manufacturer-authoritative product feeds remain external-pending.
