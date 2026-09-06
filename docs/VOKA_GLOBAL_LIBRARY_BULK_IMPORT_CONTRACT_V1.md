# VOKA GLOBAL LIBRARY BULK IMPORT CONTRACT V1

## Status

APPROVED - CONTRACT V1

This contract defines the stable system/admin ingestion boundary for large-scale population of the VOKA Universal Commercial Library.

It extends:
- ADR-011-UNIVERSAL-COMMERCIAL-LIBRARY
- VOKA_GLOBAL_LIBRARY_POPULATION_PLAN_V1

ADR-011 remains the architectural authority.

## 1. Core Principle

Huge Library, Small Working Set.

The Global Library may contain millions of records, but:
- it must not be loaded entirely into the browser
- it must not be loaded entirely into AI context
- it must not be copied wholesale into every Company Catalog

Global UCL is system-level knowledge infrastructure.
Company Catalog remains tenant-owned operational data.

## 2. Scope

Bulk Import V1 supports governed ingestion of:

- DOMAIN
- CATEGORY
- SYSTEM
- MANUFACTURER
- BRAND
- PRODUCT_FAMILY
- PRODUCT_MODEL / ITEM
- SERVICE
- RELATION
- EVIDENCE / SOURCE
- MARKET_RELEVANCE

The external import contract must not mirror Prisma tables directly.

## 3. Supported Input Formats

Supported ingestion formats:

- JSONL
- CSV
- Excel

JSONL is the preferred canonical high-volume format.

CSV and Excel are adapters into the same logical contract.

## 4. Batch Manifest

Batch metadata is separate from record identity.

Recommended manifest fields:

- schemaVersion
- batchId
- sourceNamespace
- sourceVersion
- generatedAt
- observedAt
- notes

batchId must never participate in permanent entity identity.

## 5. Common Record Envelope

Each input record contains:

- schemaVersion
- entityType
- externalKey
- sourceRecordId
- sourceUpdatedAt
- observedAt
- payload
- identifiers
- aliases
- attributes
- marketRelevance
- evidence

Only schemaVersion, entityType, externalKey and payload are structurally required.

Missing optional commercial data must remain null or empty.

Never fabricate missing values.

## 6. Source Identity

The permanent source-scoped identity is:

sourceNamespace + externalKey

The importer resolves sourceNamespace into VOKA's internal UniversalSource.

externalKey maps conceptually to sourceExternalId.

Source identity is separate from transport.

Example:

Source: Open Icecat
Transport: JSONL

## 7. Deterministic Idempotency

The importer computes its own canonical content fingerprint.

Existing VOKA concepts should be reused:

- sourceId
- sourceExternalId
- payloadHash
- stableJsonStringify

Idempotency must not depend on timestamps.

Expected logical outcomes:

- NEW
- UNCHANGED
- CHANGED
- CONFLICTED
- NEEDS_REVIEW
- DEPRECATED_SIGNAL

Repeated identical records must not create duplicates.

## 8. Delta Rules

A changed source record is staged as changed.

It must not automatically overwrite governed published knowledge.

Missing from one batch does not mean deprecated.

There is no automatic destructive deletion.

Deprecation requires:
- explicit trusted source information
- or separate governed source policy

## 9. Permissive Staging

Canonical rule:

Missing does not mean fabricated.
Missing means null or empty plus review when required.

Missing values such as these must not automatically reject a record:

- manufacturer
- brand
- family
- model number
- MPN
- GTIN
- Arabic name
- English name
- description
- specifications
- evidence
- market relevance

Commercial incompleteness is normally a review concern, not an execution failure.

## 10. Hard Failure Boundary

Hard failure is reserved for cases such as:

- unreadable input
- malformed record envelope
- missing source identity
- missing externalKey
- payload that cannot be represented
- database unavailable
- unrecoverable execution failure

## 11. Processing State Is Output

Import input must not control internal processing state.

The source must not provide authoritative values such as:

- PROCESSING
- COMPLETED
- PUBLISHED
- FAILED
- REJECTED
- NEEDS_REVIEW

VOKA owns:

- status
- errorMessage
- retryCount
- processingStartedAt
- processedAt
- matchedItemId
- internal record IDs

## 12. Identifiers

Identifiers should preserve original source values.

Supported existing UCL identifiers include:

- GTIN
- GTIN_8
- GTIN_12
- GTIN_13
- GTIN_14
- EAN
- UPC
- MPN
- MODEL_NO
- EXTERNAL_ID

Logical input shape:

- type
- value
- source

Normalized values are computed internally.

## 13. Attributes and Specifications

Technical specifications remain extensible.

Logical shape:

- code
- name
- value
- unit
- dataType
- group

The contract must not create a giant fixed industry-specific schema.

## 14. Relations

Relations are first-class logical records.

Recommended structure:

entityType = RELATION

payload:
- sourceRef
- relationType
- targetRef
- metadata

Initial relation vocabulary should remain intentionally small.

Examples:

- PARENT_OF
- CHILD_OF
- MANUFACTURED_BY
- BRANDED_BY
- BELONGS_TO_FAMILY
- BELONGS_TO_CATEGORY
- COMPONENT_OF
- REQUIRES
- COMPATIBLE_WITH
- RELATED_TO

Ambiguous relations must not be invented.

## 15. Evidence and Provenance

Evidence may include:

- url
- title
- publisher
- observedAt
- sourceRecordId
- licenseReference
- attribution
- confidence

Malformed or fabricated evidence must not be accepted.

Absence of evidence may still allow staging, but may require review.

Existing UniversalSource and UniversalItemProvenance concepts should be reused.

## 16. Market Relevance

Market relevance is optional ranking metadata only.

Possible fields:

- countryCode
- regionCode
- relevance
- claimType
- confidence
- evidence

Rules:

- country data is optional
- missing country does not block staging
- missing country does not block discovery
- country may influence ranking
- global fallback remains available
- no country-based hard block by default

Do not include:

- company size
- purchase volume
- tenant spending
- marketing segmentation

## 17. Tenant Boundary

Global Bulk Import is System/Admin-only.

Tenant-private commercial data must not enter Global UCL.

Excluded tenant-specific data includes:

- pricing
- cost
- margins
- supplier preference
- negotiated supplier terms
- stock
- warehouse balances
- tax settings
- customer data
- quotation data
- confidential notes
- private commercial terms

These are governance rules, not import payload fields.

## 18. Company Catalog Boundary

Operational adoption remains:

Universal Library -> Company Catalog

A tenant adopts only its relevant working set.

The Global Library is not copied wholesale into tenant storage.

Future safe Company Catalog contribution may flow through governed staging, but this is outside Bulk Import V1 implementation.

## 19. Existing Architecture Reuse

Bulk Import V1 must reuse the existing UCL architecture where appropriate:

- UniversalSource
- UniversalAcquisitionRun
- UniversalIngestionRecord
- NormalizationPipelineService
- IdentityResolutionService
- IngestSourceRecord
- stableJsonStringify
- payloadHash
- provenance
- identifier normalization
- acquisition staging

Bulk Import is an additional ingestion lane, not a second UCL architecture.

## 20. Required Pipeline Evolution

The existing pipeline requires targeted changes.

### Permissive normalization

Current normalization is too strict for bulk population.

Incomplete but representable knowledge must stage rather than be rejected solely because optional commercial fields are missing.

### Publication separation

Required flow:

IMPORT
-> VALIDATE
-> NORMALIZE
-> IDENTITY RESOLUTION
-> STAGE
-> REVIEW / GOVERNANCE
-> PUBLISH

Import success never means automatic publication.

### Multi-entity support

The ingestion path must progressively support more than PRODUCT/ITEM.

It must provide room for:
- systems
- manufacturers
- brands
- families
- services
- categories
- relations
- evidence
- market metadata

## 21. Identity Resolution

Existing conservative identity resolution is a strong foundation.

Preferred order:

1. existing source external reference
2. trusted global identifier
3. manufacturer + MPN
4. manufacturer + model
5. conservative manufacturer/name match
6. no match
7. ambiguous -> NEEDS_REVIEW

Ambiguous candidates must never auto-merge.

## 22. JSONL Strategy

JSONL is preferred for large structured imports because it is:

- streamable
- restartable
- memory efficient
- suitable for nested data
- suitable for millions of records

One logical record per line.

## 23. CSV Strategy

CSV is supported for flat datasets.

Possible companion files:

- records.csv
- identifiers.csv
- attributes.csv
- relations.csv
- evidence.csv

CSV must normalize into the same contract.

## 24. Excel Strategy

Excel is for human preparation and review.

Recommended sheets:

- Records
- Identifiers
- Attributes
- Relations
- Evidence
- Metadata

Excel must not create separate business semantics.

## 25. Streaming and Scale

Bulk ingestion must support:

- bounded chunks
- restartability
- per-record outcomes
- batch summaries
- checkpoints
- partial failures

Exact chunk sizes are implementation details.

## 26. Icecat Position

Open Icecat is one possible governed source.

It is not the Universal Library itself.

Useful lessons from the Icecat pilot include retaining rich fields such as:

- source record ID
- brand
- model
- MPN
- GTIN
- category
- specifications
- specification groups
- marketing metadata
- source URL
- on-market state
- review classification

Icecat-specific fields must not become mandatory for all UCL entities.

## 27. Population UI Direction

The future admin Population UI should expose richer review information than the current minimal screen.

Useful dimensions include:

- source
- manufacturer
- brand
- product/model
- MPN
- GTIN
- category
- domain/system
- source URL
- evidence count
- specification count
- specification groups
- market relevance
- delta state
- review state
- provenance

The old Icecat Pilot Review UI is an approved design reference.

## 28. Initial Implementation Boundary

The first implementation slice should:

1. define stable Bulk Import domain contract types
2. parse JSONL
3. resolve sourceNamespace
4. validate the envelope
5. compute deterministic content fingerprints
6. feed records into existing governed staging
7. preserve source/external identity
8. return NEW / UNCHANGED / CHANGED / NEEDS_REVIEW outcomes
9. never auto-publish
10. add focused tests

CSV and Excel adapters follow afterward.

No Prisma migration is required merely to start Bulk Import V1.

## 29. Approved First Population Campaign

Initial campaign:

Security Systems + CCTV + Access Control + required Networking dependencies

Population pattern:

Domain
-> Systems
-> Manufacturers
-> Brands / Families
-> Models / Items
-> Services
-> Relations
-> Evidence

Other industries remain future campaigns.

## 30. Final Rules

1. Global import is System/Admin-only.
2. The external contract never mirrors Prisma directly.
3. Missing data stays missing.
4. Never fabricate commercial facts.
5. Import never means publication.
6. Source identity remains traceable.
7. Idempotency is deterministic.
8. Timestamps do not define identity.
9. No destructive deletion by default.
10. Tenant-private data stays outside Global UCL.
11. Country relevance is ranking metadata only.
12. Ambiguous identity does not auto-merge.
13. JSONL is preferred for scalable structured bulk ingestion.
14. CSV and Excel normalize into the same contract.
15. Existing UCL ingestion architecture is reused.
16. Icecat is a source, not the library.
17. Huge Library, Small Working Set.

## CTO Decision

Bulk Import Contract V1 is approved as the architectural boundary for the next Global Library implementation slice.

Any expansion beyond this contract requires a separate CTO decision.
