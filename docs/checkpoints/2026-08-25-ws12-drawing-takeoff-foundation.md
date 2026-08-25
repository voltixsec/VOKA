# WS12 — Drawing Takeoff Foundation

## Delivered

- Tenant-scoped PDF takeoff sessions for the bounded CCTV / Low Voltage V1 slice.
- 15 MB limit, PDF extension/MIME/header validation, and SHA-256 idempotency without persisting raw drawing bytes.
- Reviewable takeoff lines with explicit quantity provenance, evidence, confidence, and human-confirmation audit fields.
- Positive bounded quantity validation, unresolved-quantity safety, and optimistic version conflicts.
- Authenticated role-gated APIs and bilingual operational UI.
- No pricing, catalog mapping, quotation publication, or inferred engineering quantity is fabricated.

## External pending

- A governed drawing parsing/recognition provider and its credentials are not configured. Automated extraction remains explicitly `EXTERNAL_PENDING`.
- Raw drawing retention requires an approved private object-storage policy; V1 stores only safe source metadata and hash.
- Conversion into a quotation remains gated until a confirmed catalog/pricing mapping flow is implemented; confirmed takeoff data is not silently published.
- Real-device and representative CCTV PDF acceptance remains pending an approved sample drawing and operator.

## Validation

- Prisma format, validate, generate: PASS.
- Local-only migration on `localhost:5432/voka`: PASS.
- Focused policy tests: 5 PASS.
- Full suite: 1223 PASS / 2 skipped.
- Typecheck: PASS.
- Production build: PASS (pre-existing warnings only).
- Diff check: PASS.
