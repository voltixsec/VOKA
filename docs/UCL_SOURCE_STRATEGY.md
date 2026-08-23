# Universal Commercial Library (UCL) — Source Strategy & Governance

**Last Updated:** 2026-08-23
**Status:** APPROVED STRATEGIC GUIDANCE

---

## 1. Executive Summary

The Universal Commercial Library (UCL) aggregates commercial product identity, technical specifications, taxonomy, and rich metadata to power AI sales drafting, quotation composition, and customer catalog enrichment across VOKA.

To maintain product quality, legal safety, data minimization, and performance invariants, VOKA enforces a strict **multi-source strategy**. No single external dataset serves as the exclusive global catalog. Instead, distinct source types fulfill dedicated commercial roles based on empirical data quality, licensing terms, and technical completeness.

---

## 2. Multi-Source Strategic Roles

```
                      +----------------------------------+
                      |    Tenant Company Catalog        |
                      +----------------------------------+
                                       ^
                                       | (Server-Authoritative Adoption)
                      +----------------------------------+
                      |   Universal Commercial Library   |
                      +----------------------------------+
                                       ^
         +---------------------+-------+-------+---------------------+
         |                     |               |                     |
+-----------------+   +-----------------+   +-------+   +-------------------+
|     Icecat      |   |    Wikidata     |   | ETIM  |   |   Manufacturer    |
| (Supplementary) |   |  (Taxonomy &    |   | (Tech |   | Direct Feeds      |
| Brand/MPN/GTIN/ |   | Manufacturer    |   | Class |   | (Authoritative    |
| Specs/Enrichment|   |  Relationships) |   | Specs)|   | Spec Details)     |
+-----------------+   +-----------------+   +-------+   +-------------------+
```

### Source Matrix & Evaluation Summary

| Source Kinds | Strategic Role | Current Qualification Status | Primary Value | Limitations & Restrictions |
| :--- | :--- | :--- | :--- | :--- |
| **Icecat** | Supplementary Identity & Spec Enrichment | `ICECAT_RECOMMEND_SUPPLEMENTARY_SOURCE_ONLY` | Brand, MPN, GTIN, technical specifications, descriptions | High single-brand bias in Construction (APC 48.5%), high off-market staleness in Lighting (76%), missing commercial lighting specs, open-license AI usage restriction requires legal clarification before production AI deployment. |
| **Wikidata** | Taxonomy & Manufacturer Relationships | `QUALIFIED_WITH_REQUIRED_FIXES` | Hierarchical taxonomy, manufacturer identities, knowledge graph links | Product population dry runs returned 0 results; not suitable for primary product drafting or commercial pricing. |
| **ETIM Classification** | Technical Classification Candidate | PLANNED (Future Evaluation) | Structured electrotechnical product taxonomy and standardized attribute definitions | Requires evaluation for Middle East commercial relevance and mapping to UCL taxonomy. |
| **Manufacturer Feeds** | Authoritative Product Details | PLANNED (Future Evaluation) | Highly accurate, current product specifications directly from manufacturers | Requires dedicated connector adapters per manufacturer format. |
| **EPREL** | Regulated Product Data Candidate | PLANNED (Future Evaluation) | Energy labeling and European product compliance data | Niche regional focus; candidate for supplemental energy metrics. |

---

## 3. Specific Source Strategies

### 3.1 Open Icecat Strategy
- **Role:** Supplementary Identity & Specification Enrichment.
- **Approved Uses:**
  - Standardizing brand names and manufacturer aliases.
  - Resolving MPN (Manufacturer Part Number) and GTIN / EAN barcodes.
  - Enriching technical specification attributes (dimensions, weight, input voltage, power capacity).
  - Providing multi-language product descriptions.
- **Prohibited Uses (Current State):**
  - Sole global catalog source.
  - Primary source for general building & construction catalog population.
  - Production AI extraction source without formal licensing clarification.

### 3.2 Wikidata Strategy
- **Role:** Supplemental Taxonomy, Knowledge, & Manufacturer Relationships.
- **Approved Uses:**
  - Establishing canonical manufacturer entity IDs (QIDs).
  - Validating corporate parent/subsidiary brand relationships.
  - Enriching general product category taxonomies.
- **Prohibited Uses:**
  - Primary product catalog item acquisition.
  - Product-level pricing or commercial offer generation.

### 3.3 ETIM & Standardized Technical Taxonomies
- **Role:** Technical Classification Candidate (Future UCL Milestone).
- **Objective:** Provide standardized attribute definitions (e.g., ETIM class IDs, attribute codes, unit codes) for electrotechnical, HVAC, and plumbing product verticals.

### 3.4 Manufacturer Direct Feeds
- **Role:** Authoritative Product Detail Candidates (Future UCL Milestone).
- **Objective:** Ingest structured CSV/JSON/XML feeds directly provided by trusted regional manufacturers, ensuring 100% current spec accuracy and commercial relevance.

---

## 4. Source Governance & Security Rules

1. **Fail-Closed Acquisition (UCL-6):** Every acquisition request must validate source status, domain origin, and rate limits. Unapproved sources fail immediately.
2. **Data Minimization:** Raw payloads staged in `UniversalIngestionRecord` must be purged according to retention policy; only normalized identity and validated attributes are published to `UniversalCatalogItem`.
3. **No Automatic Tenant Catalog Mutation:** UCL items must never automatically mutate a tenant's Company Catalog. Tenant catalog records are created strictly through explicit server-authoritative adoption (`UniversalItemAdoption`).
4. **Credential Confidentiality:** All API keys, authorization tokens, and credentials (e.g., `ICECAT_API_KEY`, `ICECAT_USERNAME`, `WIKIMEDIA_USER_AGENT_CONTACT`) are strictly managed via server environment variables. They MUST NEVER be committed to source repositories, logged, or returned in client API responses.
