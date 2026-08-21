# UCL-4 — Hybrid Commercial Retrieval Checkpoint & Closeout

Date: 2026-08-21

Status: IMPLEMENTED IN PR / PENDING CTO MERGE

Branch: `feature/ucl-4-hybrid-commercial-retrieval`

Base SHA: `e3622bfd4677bd5a3fe66488fab0a94ee2ba896a`

## Overview

UCL-4 delivers Hybrid Company Catalog + Universal Commercial Library Retrieval.

It provides a single, technology-independent retrieval capability connecting tenant-owned Company Catalog truth with shared Universal Commercial Library knowledge. The capability yields small, ranked candidate sets suitable for both application search and future AI Sales Assistant candidate retrieval.

## Key Architectural Invariants

- **Company Catalog remains tenant commercial truth**: Operational priority is granted to Company Catalog candidates because they carry approved tenant pricing, tax, units, and configuration.
- **Universal Library remains shared knowledge**: Universal items serve as discovery and enrichment candidates only. Mutable Universal records are never used as commercial document authority for Quotations, Contracts, Sales Orders, or Invoices.
- **Duplicate / Adoption Collapse**: Universal items already adopted into an authenticated company's catalog via `UniversalItemAdoption` collapse into the tenant `CatalogItem` candidate.
- **AI Context Efficiency**: AI Sales Assistant receives only bounded, ranked candidates. The complete catalog or Universal Library is never loaded into prompt context or browser memory.
- **Tenant Isolation**: Company Catalog queries strictly enforce authenticated server `companyId` scoping. Foreign tenant CatalogItems can never appear.
- **Deterministic Lexical Ranking**: Lexical/structured ranking prioritizes exact code/SKU matches, exact Universal identifier matches (GTIN, MPN, UPC), exact model/name matches, and Company Catalog origin priority with deterministic tie-breaking.
- **Non-Mutating Operations**: Retrieval is strictly read-only and performs no automatic adoption or catalog persistence.

## Architectural & Data Disclaimers

- **NO EXTERNAL DATASETS INGESTED**: Synthetic test fixtures only.
- **NO REAL GLOBAL CATALOG POPULATION**: Large-scale commercial population is deferred to UCL-6.
- **NO VECTOR / EMBEDDING SEARCH**: Lexical and structured search only; vector search belongs to UCL-5.
- **UCL-5 NOT STARTED**: Semantic search, vector databases, and custom AI embeddings remain deferred to UCL-5.
- **PENDING CTO MERGE**: Implementation is committed on the feature branch pending CTO merge and deployment.

## Delivered Code Surface

- Domain Contract: `features/universal-library/domain/retrieval/CommercialCandidate.ts`
- Deterministic Ranking: `features/universal-library/domain/retrieval/CommercialRankingService.ts`
- Retrieval Repository Interface: `features/universal-library/domain/repositories/HybridRetrievalRepository.ts`
- Prisma Repository: `features/universal-library/infrastructure/prisma/PrismaHybridRetrievalRepository.ts`
- Use Case: `features/universal-library/application/use-cases/RetrieveCommercialCandidates.ts`
- API Route: `GET /api/commercial-retrieval` (`app/api/commercial-retrieval/route.ts`)
- Regression Test Suite: `features/universal-library/__tests__/Ucl4HybridRetrievalRegression.test.ts` (covering all 22 required invariants)
