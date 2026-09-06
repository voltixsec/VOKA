# VOKA GLOBAL LIBRARY POPULATION PLAN V1

## Status
**DRAFT** - Operational blueprint extending ADR-011 for large-scale Universal Commercial Library population

## Context

VOKA's Universal Commercial Library (UCL) requires a comprehensive operational plan to scale from the architectural foundation established in ADR-011. This document captures the approved execution strategy for building a library that can eventually contain millions of commercial concepts, products, systems, and services while maintaining strict tenant boundaries and operational governance.

The foundation is ADR-011's approved architecture:
- **System-level shared library** distinct from Company Catalog
- **Hidden from normal tenant users** as an administrative/population mechanism  
- **Tenant adoption boundary** - Universal Library feeds Company Catalog, not vice versa
- **Permanent scaling invariant** - "Huge Library, Small Working Set"

## Approved Decisions

### 1. Global Universal Library

**Approved Scope:** System-level shared library
- Hidden from normal tenant users as administrative/population mechanism
- Intended to contain very large-scale commercial knowledge across industries
- Company Catalog remains separate and tenant-owned
- Supports discovery, browsing, and AI candidate retrieval

**Approved Population Target:** Millions of products, systems, and services
- **First Campaign Only:** Security Systems + CCTV + Access Control (initial campaign)
- **Required Networking dependencies:** PoE, switches, cabling
- All other commercial domains remain deferred future examples

**Core Architecture Invariant:** "Huge Library, Small Working Set" - library size does NOT determine browser payload size

### 2. Huge Library, Small Working Set

**Approved Operational Principle:** Never copy the entire Universal Library into a tenant catalog
- Tenant activity/domain selection shapes retrieval and relevance, not duplicate large datasets
- Universal records adopted into Company Catalog only when operationally needed
- Browser payload remains small regardless of library size

**Implementation Constraint:** Library size does NOT determine browser payload size
- Large server-side library
- Small bounded retrieval
- Small client payload
- Small AI context

### 3. Company Activity / Domain Context

**Approved Domain Modeling:** Company may eventually have one or multiple business activities/domains
- Activity selection is context and ranking guidance, not a hard restriction
- Cross-domain dependencies must remain discoverable
- Example: CCTV/security may require networking/PoE equipment from IT/networking domain
- Global fallback must remain possible

**Approved Relationships:** Preserve graph-like relationships
- system uses item
- system uses service
- system depends on system/domain
- item belongs to family
- family belongs to manufacturer/brand
- compatible-with / replacement / accessory relationships

### 4. Market / Country Relevance

**Approved Market Data:** Country or market information is metadata/ranking context only
- Must NOT become a hard permission or blocking filter
- Sales Assistant may use company/user country to prefer locally relevant products first, then expand globally
- Missing market data must NEVER block discovery

### 5. Company Catalog

**Approved Tenant Operations:** Normal users manage only their Company Catalog
- Company Catalog may import/export company-owned data through tenant-safe workflows
- Internal Global Library bulk population is admin/system-only
- Company Catalog retains linkage to Universal identities where applicable
- Company Catalog must remain usable if Universal Library is temporarily unavailable

**Approved Contribution Boundary:** No direct publication from tenants
- Universal Library adopts content from provider/AI discovery only
- Future tenant contribution path requires safe knowledge staging through administrative workflow
- Never directly publish tenant data globally
- No tenant pricing, supplier relationships, margins, stock, private notes, tax/commercial configuration propagation

### 6. Future Company Systems

**Approved Future Concept:** Architectural room for tenant/company-owned Systems
- Large contractor may maintain reusable company systems composed of many products/services
- This is an **approved future concept**, not current implementation requirement
- Does not affect current Universal Library population strategy

### 8. Bulk Population

**Approved Bulk Import Contract:** Add admin/system ingestion lane for large datasets
- Support stable VOKA import contract decoupled from raw Prisma table layout
- CSV acceptable for flat bulk records
- JSONL/structured formats for complex relationships/evidence
- Excel acceptable for human preparation but not canonical format
- Bulk import flows through governed staging, normalization, deduplication, publication boundaries from ADR-011

**Approved Data Formats:** Support multiple bulk input formats
- CSV for simple tabular data
- JSONL for complex structured data with relationships
- Excel for human preparation/review (not production format)

### 9. Population Shape

**Approved Library Structure:** Support diverse commercial concepts
- Domain / Activity
- System
- Manufacturer
- Brand
- Product Family
- Product / Model / Item
- Service
- Category / Taxonomy
- Relations
- Evidence / Provenance
- Market relevance metadata

**Approved Architecture:** Do NOT force all concepts into single flat SKU model
- Preserve hierarchical commercial identity (Level 1: Category, Level 2: Brand, Level 3: Product Family, Level 4: Model, Level 5: Variant)
- Support both Product and Service semantics
- Multiple external identifier types (GTIN, MPN, SKU, etc.)

**Approved Population Strategy:** Bounded campaigns only
- **Campaign 1:** Security Systems + CCTV + Access Control + required Networking dependencies
- All other commercial domains remain future examples or deferred expansion
- Each campaign requires separate implementation approval and governance gating

### 10. Scale and Updates

**Approved Growth Strategy:** Initial large bulk seeding with delta-oriented updates
- Initial campaigns build substantial coverage
- Continuous updates should be delta-oriented rather than rebuilding full library
- Preserve identity and provenance signals for detecting new, changed, unchanged, conflicted, deprecated knowledge
- Weekly/periodic updates focus on incremental discovery and enrichment

**Approved Update Patterns:** Track changes without full rebuilds
- Detect new entries vs. modified vs. unchanged vs. conflicted
- Support gradual enrichment of existing records
- Maintain historical provenance for auditability

### 11. AI/Web Role

**Approved AI Role:** AI and web research remain discovery/enrichment tools, not direct publication authority
- Population is permissive staging - missing information remains null/empty
- Provider/search output must respect source/licensing policies
- OpenAI/current discovery integration remains available as governed population path
- Bulk import is additional lane, not replacement

**Approved Discovery Rules:** Keep OpenAI discovery integration available
- Must use web_search and evidence grounding
- Provider citations validate evidence URLs
- No fake/mock/demo production data
- Reject arbitrary prose output (e.g., "Here are several real-world commercial IP CCTV surveillance systems...")

### 12. Future Drawing / BOQ Module

**Approved Consumer:** Future Drawing/Plan Decomposition module may consume Universal Library
- May require broad construction coverage (civil, steel, adhesives, waterproofing, HVAC, mechanical, plumbing, electrical)
- This is a **future consumer**, not current implementation scope
- Do NOT design or implement Drawing module now

### 13. Current Priority

**Immediate Implementation Sequence:**
1. **A.** stabilize Global Library schema/contract
2. **B.** define Bulk Import Contract v1
3. **C.** implement governed bulk ingestion
4. **D.** test with bounded real dataset
5. **E.** scale population campaign-by-campaign
6. **F.** add continuous delta enrichment later

## Non-Goals / Deferred Work

### Deferred Implementation Areas

**NOT Part of Current Scope:**
- Large-scale ingestion from all global datasets (bounded campaigns only)
- Advanced semantic vector retrieval (PostgreSQL full-text first)
- Automatic AI-based tenant adoption decisions
- Drawing/BOQ module implementation
- Voice-first AI purchasing workflows
- Advanced export formatting for external systems
- Analytics module (Competitor Analysis, Supply Chain Insights, etc.)
- Caching implementations
- PostgreSQL full-text search as committed implementation choice
- Any fixed future implementation technologies

### Architectural Invariants

**Permanent Rules From ADR-011:**
- **Security Boundary:** Universal read access and tenant write access are separate
- **Performance Rule:** Library size does NOT determine browser payload size
- **Availability Rule:** Universal Library failure does NOT make tenant operations unusable
- **Commercial Document Boundary:** Historical documents must remain stable
- **Retrieval Architecture:** No full-library browser fetch
- **Search Architecture:** Search results are bounded

## Target Data Flow

```
Universal Library Population
    |
    v
Admin/System Ingestion
    |
    v
Source Data (CSV, JSONL, etc.)
    |
    v
Staging Area
    |
    v
Validation & Normalization
    |
    v
Identifier Extraction
    |
    v
Taxonomy Mapping
    |
    v
Entity Resolution
    |
    v
Quality/Evaluation
    |
    v
Search Indexing
    |
    v
Published Universal Library
    |
    v
Tenant Adoption Boundary
    |
    v
Company Catalog
    |
    v
Commercial Documents (Quotation, Invoice, etc.)
```

## Scale Principles

### Retrieval Performance

**Hard Requirements:**
1. **Bounded Search:** No full-library browser fetch
2. **Pagination:** Cursor-based or numbered pagination mandatory
3. **Client Payload:** Browser payload must remain small regardless of library size
4. **AI Context:** AI receives limited candidates, not millions of records
5. **Caching:** Cache popular queries, taxonomy nodes, thumbnails, results
6. **Index Optimization:** Fast exact identifier matching

### Storage Architecture

**Design Principles:**
1. **Hierarchical Identity:** Preserve commercial concept hierarchy
2. **Extensible Attributes:** Support category-specific specifications without database schema changes
3. **Provenance Tracking:** Maintain source, confidence, modification history
4. **Conflict Resolution:** Handle duplicate/conflicting records
5. **Historical Stability:** Commercial documents immune to global changes

## Security / Tenant Boundary

### Access Control

**Universal Library Access:**
- Read: Admin/system users, AI assistant, discovery endpoints
- Write: Admin/system users via ingestion pipeline only
- No direct tenant modifications

**Company Catalog Access:**
- Full tenant control
- Can adopt Universal Library items
- Can override display names, pricing, commercial notes
- Cannot mutate global library

### Data Separation

**Hard Boundaries:**
- **Global Library:** Shared commercial knowledge, no tenant ownership
- **Company Catalog:** Tenant commercial truth, server-authoritative
- **Commercial Documents:** Downstream of Company Catalog, historical snapshots
- **No Back Doors:** Universal Library cannot bypass tenant adoption

## Population Campaign Strategy

### Initial Campaign Structure

**Phase 1 - Foundation:**
1. Security Systems domain
   - CCTV cameras and related equipment
   - Access control systems
2. Network dependencies
   - PoE switches and cabling
   - Network infrastructure

**Phase 2 - Expansion:**
1. HVAC and Mechanical systems
2. Electrical and Plumbing systems
3. Construction materials (cement, steel, etc.)

**Phase 3 - Services:**
1. Installation and maintenance services
2. Consulting and design services
3. Supply chain and logistics

### Campaign Execution Model

**Each Campaign Includes:**
- Source identification and licensing review
- Controlled bulk ingestion
- Entity resolution and deduplication
- Quality evaluation and confidence scoring
- Search indexing and publication
- Tenant adoption pathway

### Scale Management

**Growth Controls:**
- **Campaign-by-Campaign Approach:** One focused domain at a time
- **Bounded Datasets:** Each campaign has defined scope and size
- **Continuous Updates:** Delta enrichment rather than wholesale rebuilds
- **Governance Gates:** Each campaign requires approval before expansion

## Future Consumers

### Drawing/BOQ Module (Future)

**Approved Consumer:** Future Drawing/Plan Decomposition module may consume Universal Library
- May require broad construction coverage (civil, steel, adhesives, waterproofing, HVAC, mechanical, plumbing, electrical)
- This is a **future consumer**, not current implementation scope
- Do NOT design or implement Drawing module now

### AI Assistant Evolution (Future)

**Approved Enhancement Areas:**
- **Hybrid Retrieval:** Combine catalog, Universal Library, historical usage, semantic similarity
- **AI Recommendations:** Based on ranked candidates, not global library
- **Voice Integration:** Voice-first queries into Universal Library
- **Contextual Suggestions:** Domain-specific recommendations

### Analytics Module (Future)

**Approved Use Cases:**
- **Market Analysis:** Global commercial knowledge trends
- **Category Intelligence:** Cross-industry commercial patterns
- **Competitor Analysis:** Manufacturer and brand comparisons
- **Supply Chain Insights:** Dependency and relationship mapping

## Immediate Next Steps

### Critical Implementation Dependencies

**Must Resolve Before Coding:**

1. **Bulk Import Contract v1**
   - Input format specifications (CSV, JSONL, etc.)
   - Schema validation rules
   - Ingestion pipeline boundaries
   - Error handling and retry logic

2. **Data Normalization Standards**
   - Commercial identity hierarchy mapping
   - Manufacturer/brand disambiguation
   - Multilingual name handling
   - External identifier semantics

3. **Entity Resolution Algorithms**
   - Duplicate detection rules
   - High-confidence matching priority
   - Conflict resolution strategy
   - Audit trail requirements

4. **Quality Evaluation Framework**
   - Confidence scoring methodology
   - Source verification process
   - Cross-source validation
   - Curated vs. automated vs. unverified states

### Infrastructure Requirements

**Technical Preparation:**
1. **Search Infrastructure**
   - PostgreSQL full-text search setup
   - Indexing strategy for fast identifier lookups
   - Caching layer for popular queries

2. **Ingestion Pipeline**
   - Staging area creation
   - Validation and normalization services
   - Bulk processing capabilities
   - Error handling and recovery

3. **API Endpoints**
   - Discovery search with tenant context
   - Admin ingestion controls
   - Candidate retrieval for AI
   - Browse/pagination interfaces

### Testing Strategy

**Validation Requirements:**
1. **Unit Tests:**
   - Schema validation
   - Normalization rules
   - Entity resolution algorithms
   - Confidence scoring

2. **Integration Tests:**
   - End-to-end ingestion flow
   - Search and retrieval functionality
   - Tenant adoption boundary
   - Commercial document creation

3. **Performance Tests:**
   - Search response times
   - Memory usage with large datasets
   - Concurrent ingestion capacity

## Open Implementation Questions

### Technical Questions Requiring Resolution

**Uncertainty Areas:**
1. **Taxonomy Design:**
   - Hierarchical category structure
   - Cross-industry category mapping
   - Language-specific category names

2. **Search Technology:**
   - PostgreSQL vs. dedicated search engine
   - Vector similarity implementation
   - Hybrid retrieval strategy

3. **AI Integration:**
   - Retrieval ranking algorithm
   - Candidate filtering for AI context
   - Voice search integration

4. **Data Governance:**
   - Source licensing requirements
   - Content moderation process
   - Removal request handling
   - Attribution requirements

### Business Questions Requiring Clarification

**Uncertainty Areas:**
1. **Tenant Contribution:**
   - Contribution validation process
   - Safe knowledge criteria
   - Tenant approval workflow

2. **Commercial Intelligence:**
   - Market relevance calculation
   - Country-based relevance weighting
   - Price and availability signals

3. **Industry-Specific Features:**
   - HVAC-specific attributes
   - Electrical-specific specifications
   - Construction industry terminology

## Conclusion

This VOKA Global Library Population Plan V1 extends ADR-011's architectural foundation with concrete operational guidance for building a large-scale Universal Commercial Library. The plan maintains strict adherence to ADR-011's principles while providing a clear implementation roadmap for the current milestone.

The strategy balances architectural rigor with practical execution, ensuring:
- **Tenant separation preserved** through strict adoption boundaries
- **Library scale managed** through campaign-by-campaign approach
- **Performance maintained** through bounded retrieval design
- **Security enforced** through clear access control patterns
- **Future compatibility ensured** through architectural flexibility

Implementation will proceed through the immediate next steps outlined above, resolving critical dependencies before advancing to bulk ingestion and population campaigns.

---

**Document Status:** DRAFT OPERATIONAL BLUEPRINT  
**Authority:** Extends ADR-011, must not contradict ADR-011
**Scope:** Current Universal Library population milestone
**Next Action:** Resolve critical dependencies before implementation