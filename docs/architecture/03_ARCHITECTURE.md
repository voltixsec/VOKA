# 03 ARCHITECTURE

> This document is part of the VOKA Master Blueprint.

Primary Reference:

[VOKA_MASTER_BLUEPRINT.md](../VOKA_MASTER_BLUEPRINT.md)

This file contains implementation details for this section only.

Status: Living Document

<!-- ADR-011-UNIVERSAL-COMMERCIAL-LIBRARY -->

## Universal Commercial Library Boundary

ADR-011 introduces a permanent separation between VOKA's shared global
commercial knowledge and each tenant's operational Company Catalog.

The Universal Commercial Library is a global discovery and retrieval layer.

The existing Company Catalog remains the tenant-owned canonical source used by
Pricing, Tax, Quotations, Contracts, Sales Orders and future Invoices.

The allowed direction is:

Universal Library -> tenant adoption -> Company Catalog -> commercial document

Commercial documents must not directly depend on mutable Universal Library
records.

Universal Library access must use bounded indexed retrieval. The browser and AI
must never receive the complete global library.

See `docs/ADR-011-UNIVERSAL-COMMERCIAL-LIBRARY.md`.
