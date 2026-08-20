# UCL-1 — Universal Commercial Library Foundation Closeout

Date: 2026-08-21

## Baseline & Git Branch

Base Commit: `83cc3b47db8a438a973a3d703e3c53ebaaee528c`
Feature Branch: `feature/ucl-1-universal-library-foundation`

## Scope Delivered

UCL-1 provides the foundational architecture and application layer for VOKA's Universal Commercial Library, decoupling shared global commercial discovery from tenant-owned Company Catalog operational truth.

Delivered capabilities:

1. **Global Commercial Identity Foundation**
   - `UniversalCatalogItem` model representing shared global commercial concepts, products, and services with global IDs, Product/Service kinds, localized names (`name`, `nameAr`, `nameEn`), canonical search representation (`searchName`), localized descriptions (`description`, `descriptionAr`, `descriptionEn`), taxonomy association, and active/deprecated lifecycle state.
   - Global items do NOT contain tenant-specific pricing, tax rates, tenant SKUs, or tenant-specific notes.

2. **Hierarchical Taxonomy Foundation**
   - `UniversalCategory` model supporting root and child categories, arbitrary depth, localized names (`name`, `nameAr`, `nameEn`), and active status.
   - Domain invariants prevent invalid self-parenting relationships.

3. **Source & Provenance Model**
   - `UniversalSource` model recording source identity, source type, external references, URLs, licensing metadata, and verification status (`UNVERIFIED`, `SOURCE_VERIFIED`, `CROSS_VERIFIED`, `CURATED`, `DEPRECATED`).
   - `UniversalItemProvenance` association table linking `UniversalCatalogItem` with `UniversalSource` including observed timestamp and confidence score.

4. **Tenant Adoption Boundary**
   - `UniversalItemAdoption` link table connecting `Company`, `UniversalCatalogItem`, `CatalogItem`, and `User`.
   - Explicit application use case (`AdoptUniversalItem`) converts/adopts a Universal item into the authenticated company's `CatalogItem` system.
   - Company ID is derived strictly from server context (`withCompanyAuth`); client browser parameters cannot determine tenant ownership.
   - Adoption is idempotent: repeated adoption returns the existing adopted `CatalogItem`.
   - Adopted `CatalogItem` records remain independently editable tenant master data.
   - Future Universal Library updates do NOT mutate adopted tenant `CatalogItem` records.

5. **Bounded Retrieval Boundary & Repository**
   - Technology-independent repository interface `IUniversalLibraryRepository` and `PrismaUniversalLibraryRepository` implementation.
   - Search parameters support query text, item type, taxonomy category, active status, bounded limit (hard ceiling capped at 50, default 20), and cursor-based pagination.
   - Deterministic ordering (`createdAt DESC`, `id ASC`).
   - Tenant catalog data NEVER leaks into Universal search results.
   - No full-library endpoints or unbounded queries.

6. **Authenticated API Surface**
   - `GET /api/universal-library/items`: Bounded Universal item search.
   - `GET /api/universal-library/items/[id]`: Fetch single Universal item details with category and provenance.
   - `GET /api/universal-library/categories`: Retrieve taxonomy categories.
   - `POST /api/universal-library/items/[id]/adopt`: Adopt Universal item into authenticated company catalog (`OWNER`, `ADMIN`, `SALES`).

7. **Commercial Document & Tenant Catalog Regression Protection**
   - Historical commercial documents (Quotation, Sales Order, Contract) continue using tenant-owned `CatalogItem` records and server-authoritative snapshots.
   - Existing Company Catalog functionality remains fully functional and unchanged.

## Database Migration

Migration: `20260821000000_ucl_1_foundation`
Schema models added:
- `UniversalCategory`
- `UniversalSource`
- `UniversalCatalogItem`
- `UniversalItemProvenance`
- `UniversalItemAdoption`
- Additive relations on `Company`, `User`, and `CatalogItem`

## Validation Results

- Prisma format: PASS
- Prisma validate: PASS
- Prisma generate: PASS
- TypeScript (`npx tsc --noEmit`): PASS
- Test Suite (`npm test`): PASS (130 test files / 785 tests passed)
- Production build: PASS

## Deferred to UCL-2+

- UCL-2: Brand, Manufacturer, product families, models, variants, multilingual aliases, GTIN/EAN/UPC/MPN identifiers, and structured attribute specifications.
- UCL-3: Large-scale ingestion pipelines, normalization, deduplication, and automated confidence scoring.
- UCL-4: Hybrid Company Catalog + Universal Library AI retrieval integration.
- UCL-5: Semantic / vector retrieval, caching, and custom ranking.
- UCL-6: External commercial dataset ingestion.
