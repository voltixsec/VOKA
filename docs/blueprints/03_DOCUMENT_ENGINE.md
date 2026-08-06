# 03 DOCUMENT ENGINE

Status: Active for Sprint 10A

Parent: [VOKA Master Blueprint](../VOKA_MASTER_BLUEPRINT.md)

## Purpose

The Document Engine turns approved VOKA business data into deterministic,
bilingual documents without moving document-rendering concerns into the Domain.
AI may prepare content, but generated documents remain human-reviewed artifacts.

## Architecture boundary

- Domain and application behavior expose document-ready business data through
  inward contracts.
- Rendering implementations belong to infrastructure and may depend on PDF,
  font, QR, storage, or delivery libraries.
- API routes authenticate, authorize, resolve the active company, and call an
  application use case. They do not assemble layouts or calculate totals.
- Renderers consume immutable snapshots and never query Prisma directly.
- Every quotation lookup and generated artifact is tenant-scoped.
- Generated totals come from the persisted quotation; the renderer never
  recalculates commercial values.

## Sprint 10A - Quotation Documents

Status: Approved on 2026-08-05

Scope:

1. A document snapshot contract for company and quotation data.
2. A branded quotation PDF in Arabic and English with RTL support.
3. Embedded fonts suitable for both languages.
4. A QR code containing an approved, non-secret quotation reference or URL.
5. Authenticated PDF generation and download.
6. Browser print support from the quotation workspace.
7. Focused unit, route, tenant-isolation, and rendering tests.

Acceptance criteria:

- Only an authenticated member of the owning company can generate a quotation
  document.
- Cross-company access remains indistinguishable from a missing quotation.
- Product and service lines, persisted totals, currency, dates, notes, and terms
  render correctly in Arabic and English.
- Arabic output is readable and correctly directed; English output remains LTR.
- The response is a valid PDF with a safe filename and no-store caching.
- QR payloads contain no credentials, tokens, or private tenant identifiers not
  already approved for customer sharing.
- TypeScript, Prisma validation, tests, production build, and GitHub Actions pass.

## Branding constraint

The current Company model contains name, locale, currency, and timezone, but no
logo, address, phone, legal identity, or tax-registration fields. Sprint 10A must
not add implicit Prisma changes. The first implementation uses the available
company identity behind a branding contract. Persistent extended branding
requires a separately reviewed schema and migration decision.

## Sprint 10B - Sharing

Status: Approved direction; implementation follows Sprint 10A review

- Email delivery.
- Human-approved WhatsApp integration foundation.
- Delivery status and audit trail.
- Retry and provider-failure handling without duplicate sends.

Public links, autonomous sending, Sales Orders, Invoices, Payments, full AI/Voice
execution, and Import/Export remain outside Sprint 10A.

