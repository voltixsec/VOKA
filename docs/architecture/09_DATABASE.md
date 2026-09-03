# 09 DATABASE

> This document is part of the VOKA Master Blueprint.

Primary Reference:

[VOKA_MASTER_BLUEPRINT.md](../VOKA_MASTER_BLUEPRINT.md)

This file contains implementation details for this section only.

Status: Living Document

<!-- ADR-011-UCL-DATABASE -->

## Universal Commercial Library Data Boundary

The future Universal Commercial Library must not be modeled as additional
tenant CatalogItem rows.

Global commercial knowledge and tenant-owned operational catalog data have
different ownership, lifecycle, scale and consistency requirements.

Future Universal Library persistence must support:

- global commercial identity;
- hierarchical taxonomy;
- Brand and Manufacturer identity;
- model / family / variant relationships;
- multilingual names and aliases;
- typed external identifiers;
- extensible specifications and attributes;
- source provenance;
- confidence / verification metadata;
- duplicate and entity-resolution state;
- deprecation and replacement history;
- tenant adoption references.

Company Catalog remains independently usable when Universal Library services are
unavailable.

Search storage may evolve from indexed PostgreSQL retrieval to full-text,
trigram, vector or external search infrastructure without changing the tenant
CatalogItem contract.

The permanent scaling rule is server-side large data with bounded retrieval,
not eager client loading.


## 2026-09-03 Universal Item Type Persistence Split

`UniversalCatalogItem.type` uses:

`UniversalItemType = PRODUCT | SERVICE | SYSTEM | SOLUTION | SHIPPING | LABOR | DISCOUNT | CUSTOM`

Tenant CatalogItem and commercial-document line persistence continue to use:

`CatalogItemType = PRODUCT | SERVICE | SHIPPING | LABOR | DISCOUNT | CUSTOM`

These enums MUST remain separate.

Adding a Universal Library knowledge classification must not accidentally widen
Company Catalog or commercial-document contracts.

The migration introducing this boundary converts only
`UniversalCatalogItem.type` from the historical shared enum to
`UniversalItemType`.

The existing commercial `CatalogItemType` remains in place.
