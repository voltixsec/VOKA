# ADR-011 — Universal Commercial Library Architecture

Date: 2026-08-20

Status: APPROVED

Decision owner: VOKA CEO / CTO architecture

## Context

VOKA currently has a canonical company-scoped Product and Service catalog.

Phase 5 established tenant-safe CatalogItem records, bilingual catalog values,
shared and tenant-owned Units, bounded catalog search and pagination, Price List
integration, historical commercial snapshots, and safe Product / Service reuse.

That catalog solves the canonical master-data problem for one company.

It does not solve the larger product objective of allowing VOKA to understand,
discover and suggest commercial products and services across industries,
countries, manufacturers and languages at global scale.

VOKA therefore requires a separate Universal Commercial Library.

The Universal Commercial Library is not a replacement for the Company Catalog.

It is a shared commercial knowledge layer that can eventually contain millions
of normalized commercial concepts, products, models, variants, services,
commodities, bundles and aliases without requiring every tenant to own every
global record.

## Decision

VOKA SHALL maintain two distinct commercial catalog layers.

### 1. Universal Commercial Library

A shared global commercial knowledge layer.

It may contain:

- generic commercial concepts;
- products;
- services;
- manufacturers;
- brands;
- product families;
- models;
- variants;
- bundles and kits;
- commodities;
- commercial categories and taxonomy;
- multilingual names;
- aliases and synonyms;
- manufacturer part numbers;
- GTIN;
- EAN;
- UPC;
- SKU-like external identifiers where source semantics are known;
- units and measurement semantics;
- technical attributes;
- specifications;
- structured metadata;
- source provenance;
- source confidence;
- normalization and entity-resolution metadata.

Universal records are not tenant-owned commercial master data.

They represent discoverable commercial knowledge.

### 2. Company Catalog

The existing tenant-safe VOKA Catalog remains the authoritative catalog used by
a company in real commercial operations.

A company may adopt a Universal Library item into its own Company Catalog.

After adoption, the company owns its commercial configuration including, where
applicable:

- internal item code;
- preferred names;
- descriptions;
- active status;
- unit;
- tax configuration;
- sale price;
- Price List participation;
- company-specific aliases;
- company-specific notes;
- company-specific commercial defaults.

The Universal Library MUST NOT become a back door around tenant ownership.

## Commercial Document Boundary

Quotation, Contract, Sales Order and future Invoice lines MUST NOT directly
depend on mutable Universal Commercial Library records.

The required flow is:

Universal Commercial Library
    ->
Company adoption / canonical CatalogItem
    ->
Quotation / Contract / Sales Order / Invoice
    ->
immutable or historically authoritative commercial snapshots

Commercial documents continue to trust server-owned Company Catalog,
Pricing, Tax and Unit rules.

Historical documents MUST remain stable even when:

- the Universal Library changes;
- manufacturer information changes;
- categories change;
- aliases change;
- a Company Catalog item changes;
- a Company Catalog item is later deactivated.

## Universal Commercial Identity

The architecture MUST NOT assume that every commercial thing in the world can
be represented as one flat SKU record.

Commercial identity may exist at several levels:

Category
    ->
Commercial concept
    ->
Brand / Manufacturer
    ->
Product family
    ->
Model
    ->
Variant

Examples include:

- Cement as a generic commodity;
- Portland Cement Type I as a normalized commercial concept;
- a manufacturer-specific cement product;
- a specific packaging variant;
- CCTV camera as a concept;
- a manufacturer and series;
- a model;
- a lens / storage / region variant;
- installation as a Service rather than a Product.

The implementation may evolve incrementally, but the data architecture MUST
preserve the ability to distinguish these concepts.

## Product and Service Semantics

Products and Services remain semantically distinct.

The Universal Commercial Library may represent both.

Service records may include:

- installation;
- maintenance;
- commissioning;
- inspection;
- design;
- freight;
- consulting;
- labor;
- recurring services;
- other commercially sellable work.

A Service MUST NOT be forced into a physical-product identity model.

## Taxonomy

The Universal Library requires a hierarchical commercial taxonomy.

The taxonomy MUST support:

- parent / child categories;
- multiple commercial industries;
- product categories;
- service categories;
- cross-industry reuse;
- stable internal identifiers;
- multilingual labels;
- aliases;
- future external taxonomy mappings.

External classification systems may be mapped to VOKA taxonomy but MUST NOT
become the sole internal identity model.

## Brands and Manufacturers

Brand and Manufacturer are separate concepts.

One manufacturer may own multiple brands.

A product may reference:

- manufacturer;
- brand;
- both;
- neither when the item is generic or unknown.

Tenant-created brands MUST NOT silently mutate global brand identity.

## Models and Variants

The architecture must permit separation between:

- product family;
- model;
- variant.

Variant dimensions may include:

- size;
- capacity;
- voltage;
- color;
- packaging;
- region;
- material;
- finish;
- power;
- storage;
- dimensions;
- other category-specific attributes.

Not every item requires all levels.

## Attributes and Specifications

The Universal Library SHALL support extensible structured attributes.

Attributes must not require adding a database column for every possible
commercial specification in the world.

Examples:

Camera:
- resolution;
- lens;
- sensor;
- PoE support;
- IP rating.

Cable:
- conductor count;
- conductor material;
- cross section;
- voltage rating;
- length.

Cement:
- type;
- strength class;
- packaging weight.

The implementation may use normalized attribute definitions, typed values,
JSON-backed projections, or a hybrid design after implementation discovery.

The architecture decision is that category-specific specifications must remain
extensible.

## Multilingual Commercial Names

The Universal Library is multilingual.

Arabic and English remain first-class VOKA languages.

The architecture must allow additional languages later without redesigning
commercial identity.

A Universal item may have:

- canonical name;
- Arabic name;
- English name;
- localized names;
- transliterations;
- aliases;
- abbreviations;
- historical names;
- manufacturer naming variants.

Aliases are search and entity-resolution metadata.

They are not automatically authoritative Company Catalog names.

## External Identifiers

Universal records may store multiple external identifiers.

Examples:

- GTIN;
- GTIN-8;
- GTIN-12;
- GTIN-13;
- GTIN-14;
- EAN;
- UPC;
- manufacturer part number;
- model number;
- external source IDs;
- recognized industry identifiers.

Identifier type and source MUST be retained.

A raw identifier string without its semantics MUST NOT be assumed globally
unique.

## Provenance

Global commercial knowledge must be traceable to its source.

Universal Library ingestion SHALL preserve provenance sufficient to answer:

- where did this value come from;
- when was it observed;
- which source supplied it;
- whether it was imported, curated or inferred;
- whether another source confirms it;
- how confident VOKA is in the normalized result.

Possible sources include:

- manufacturer data;
- distributor data;
- public structured datasets;
- licensed commercial datasets;
- tenant-contributed mappings where legally permitted;
- controlled manual curation;
- AI-assisted normalization.

AI-generated information MUST NOT silently become trusted global fact.

## Confidence and Verification

Universal records may carry quality and confidence states.

Conceptually, data may be:

- unverified;
- source-verified;
- cross-source verified;
- curated;
- deprecated;
- conflicted.

Confidence applies to knowledge quality.

It MUST NOT replace server validation for Company Catalog commercial rules.

## Deduplication and Entity Resolution

Large-scale ingestion will create duplicates.

VOKA SHALL therefore treat entity resolution as a first-class library concern.

Matching signals may include:

- normalized manufacturer;
- brand;
- model;
- part number;
- GTIN;
- names;
- aliases;
- structured attributes;
- packaging;
- category;
- source relationships.

Potential duplicates MUST NOT be destructively merged solely because an AI
model believes they are equivalent.

High-confidence deterministic identity has priority.

Ambiguous matches remain separate candidates until resolved.

## Tenant Adoption

A Universal Library result becomes operational for a tenant only through an
explicit adoption boundary.

Conceptually:

UniversalCommercialItem
    ->
AdoptUniversalCommercialItem
    ->
CatalogItem

Adoption may copy or map safe descriptive data while company-owned commercial
fields remain tenant-controlled.

The Company Catalog record may retain a reference to the Universal identity for
future discovery and enrichment.

The Company Catalog MUST remain usable if the Universal Library is temporarily
unavailable.

## Company Overrides

Tenant-specific information MUST NOT mutate the global library.

A company may override within its own Catalog:

- display name;
- description;
- internal code;
- unit;
- pricing;
- tax;
- commercial notes;
- preferred aliases;
- active state.

Global knowledge and tenant commercial truth remain separate.

## Bundles and Kits

The architecture SHALL allow future commercial bundles.

A bundle may represent:

- CCTV system package;
- access-control package;
- maintenance package;
- installation kit;
- product plus service package;
- industry-specific quotation template.

Bundle composition must be retrievable without forcing all components into the
AI context.

Company adoption may create company-specific bundle configuration.

## Search Architecture

The Universal Library MUST be searchable without loading it into the browser.

The following rules are mandatory:

1. No full-library browser fetch.
2. No dropdown containing the entire Universal Library.
3. Search results are bounded.
4. Pagination or cursor-based continuation is mandatory.
5. Search inputs are debounced where appropriate.
6. Queries use database/search indexes.
7. Long result lists may use UI virtualization.
8. Images are lazy-loaded and thumbnail-sized where possible.
9. Search payloads expose only the fields needed by the current experience.
10. Large result counts MUST NOT imply large client-side memory usage.

The user experience should remain approximately constant whether the searchable
library contains ten thousand items or tens of millions.

## Retrieval Architecture

Universal Library retrieval is a dedicated capability.

Initial implementation may use PostgreSQL.

Expected evolution:

Stage 1:
- indexed structured filters;
- normalized textual search;
- bounded pagination.

Stage 2:
- PostgreSQL full-text search;
- trigram/fuzzy matching where justified;
- stronger ranking.

Stage 3:
- semantic embeddings;
- vector retrieval;
- hybrid lexical + semantic ranking.

Stage 4:
- dedicated search infrastructure if scale requires it.

The application boundary should prevent higher-level consumers from depending
directly on one search technology.

## AI Retrieval Contract

The AI Sales Assistant MUST NOT receive the entire Universal Library.

Required flow:

User commercial intent
    ->
Retrieval query
    ->
small ranked candidate set
    ->
AI reasoning/proposal
    ->
human review
    ->
Company Catalog adoption or commercial draft action

Typical AI retrieval should operate on tens of candidates, not millions of
records.

The retrieval layer may combine:

- tenant Company Catalog matches;
- Universal Library matches;
- historical company usage;
- semantic similarity;
- exact identifiers;
- taxonomy;
- manufacturer;
- contextual commercial intent.

Company Catalog candidates should normally have operational priority because
they already carry tenant-approved commercial configuration.

AI remains proposal-only unless an explicitly approved workflow says otherwise.

## Retrieval Ranking

Search ranking may consider:

- exact identifier match;
- exact company item match;
- exact manufacturer/model match;
- normalized name match;
- alias match;
- taxonomy proximity;
- company usage frequency;
- company recency;
- semantic similarity;
- verified-source confidence;
- locale relevance.

Ranking logic must remain testable and observable.

## Caching

Caching is allowed and expected.

Potential cache targets include:

- popular search queries;
- taxonomy nodes;
- manufacturer metadata;
- item projections;
- thumbnails;
- retrieval candidate results.

Caching MUST NOT bypass tenant authorization.

Global cache keys and tenant-scoped cache keys must be distinguishable.

## Ingestion Pipeline

Universal data SHALL enter through a controlled ingestion pipeline.

Conceptual stages:

Source
    ->
Raw ingestion
    ->
Validation
    ->
Normalization
    ->
Identifier extraction
    ->
Taxonomy mapping
    ->
Entity resolution
    ->
Quality/confidence evaluation
    ->
Search indexing
    ->
Published Universal Library projection

Raw source data SHOULD remain distinguishable from canonical normalized data.

This allows future reprocessing when normalization logic improves.

## Moderation and Quality

Global data must support correction without corrupting tenant history.

The architecture should eventually provide:

- conflict detection;
- duplicate review;
- source disagreement handling;
- deprecation;
- replacement relationships;
- correction history;
- auditability.

Deletion should not be the default correction strategy for globally referenced
commercial knowledge.

## Licensing and Source Rules

Being technically accessible does not imply that commercial data may legally be
copied into VOKA.

Every ingestion source must have an explicit source policy.

VOKA SHALL track enough provenance to support:

- licensing review;
- source attribution requirements;
- removal requests;
- source-specific refresh;
- source-specific deletion where legally required.

Scraped or third-party content MUST NOT be treated as unrestricted VOKA-owned
data merely because it is publicly visible.

## Versioning and Evolution

The Universal Library is mutable knowledge.

Commercial documents are historical records.

Therefore:

- Universal metadata may evolve;
- identity corrections may occur;
- aliases may be added;
- classifications may improve;
- source confidence may change;

but historical Quotation, Contract, Sales Order and Invoice snapshots must not
be rewritten because global knowledge changed.

## Performance Rule

Universal Library size MUST NOT determine browser payload size.

The core performance rule is:

Large server-side library.
Small bounded retrieval.
Small client payload.
Small AI context.

No future implementation may replace this rule with eager global loading.

## Availability Rule

The Universal Library is an enrichment and discovery capability.

Failure of the Universal Library MUST NOT make an already-adopted tenant
CatalogItem unusable.

Core tenant quotation and commercial operations must continue against canonical
Company Catalog data.

## Security Boundary

Universal read access and tenant write access are separate concerns.

Global discovery MUST NOT:

- expose another tenant's private catalog;
- expose another tenant's pricing;
- expose another tenant's tax configuration;
- expose another tenant's commercial activity;
- allow browser-supplied tenant ownership;
- mutate tenant CatalogItems without authorized application flow.

## Architectural Relationship

The target relationship is:

Universal Commercial Knowledge
        |
        v
Universal Retrieval Layer
        |
        +--------------------+
        |                    |
        v                    v
Company Catalog Search   AI Candidate Retrieval
        |                    |
        +---------+----------+
                  |
                  v
          Tenant Adoption
                  |
                  v
            CatalogItem
                  |
          +-------+-------+
          |       |       |
          v       v       v
      Quotation Contract Sales Order
                          |
                          v
                       Invoice

All consequential commercial records remain downstream of tenant-owned,
server-authoritative commercial data.

## Implementation Strategy

ADR-011 approves the architecture.

It does NOT authorize immediate creation of millions of records.

Implementation shall proceed in bounded phases.

Recommended sequence:

Phase UCL-1:
- global identity foundation;
- taxonomy;
- source/provenance model;
- tenant adoption boundary;
- bounded retrieval contract.

Phase UCL-2:
- multilingual aliases;
- identifiers;
- brand/manufacturer model;
- structured attributes.

Phase UCL-3:
- ingestion and normalization pipeline;
- deduplication;
- confidence model.

Phase UCL-4:
- AI retrieval integration;
- Company Catalog + Universal hybrid search.

Phase UCL-5:
- semantic/hybrid retrieval;
- scale testing;
- caching;
- advanced ranking.

Phase UCL-6:
- large external datasets;
- source governance;
- continuous enrichment.

Each phase requires its own implementation review and release gate.

## Consequences

Positive:

- VOKA can grow toward extremely broad commercial coverage.
- Company Catalog remains lightweight and tenant-specific.
- AI receives relevant candidates instead of an enormous prompt.
- commercial history remains safe.
- search technology can evolve independently.
- global knowledge may improve without rewriting tenant records.

Trade-offs:

- global identity resolution is complex;
- source quality varies;
- taxonomy requires governance;
- ingestion requires licensing discipline;
- duplicate management becomes a permanent system responsibility;
- semantic retrieval will eventually require additional infrastructure.

These costs are accepted because collapsing global commercial knowledge and
tenant operational catalog data into one table would create significantly
greater correctness, security, scaling and lifecycle problems.

## Non-Goals Of This ADR

ADR-011 does not choose:

- the final external data suppliers;
- the final vector database;
- the final dedicated search engine;
- exact embedding models;
- exact large-scale ingestion schedule;
- a production migration;
- automatic tenant adoption;
- automatic AI purchasing or sales decisions.

Those require separate implementation decisions.

## Permanent Rule

Universal Commercial Library is shared commercial knowledge.

Company Catalog is tenant commercial truth.

Commercial documents use tenant commercial truth and preserve historical
snapshots.

The entire global library is never loaded into the browser or sent to the AI.
