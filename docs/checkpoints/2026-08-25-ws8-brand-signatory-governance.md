# WS8 Brand and Authorized Signatory Governance

Date: 2026-08-25

Status: CODE COMPLETE / DEVICE ACCEPTANCE PENDING

## Delivered

- Preserved the existing curated company document themes and validated logo, letterhead, signature, and stamp uploads.
- Added tenant-owned authorized signatory profiles with bilingual name/title, active/default state, signature asset, and bounded allowed document types.
- Enforced one default signatory per company at database level and tenant ownership at every API read/write boundary.
- Added a settings workspace and useful bilingual signatory management UI.
- Added upload, direct camera capture, transparent canvas drawing, preview, and bounded PNG/JPEG validation for signatures.
- Bound the active default quotation signatory to approval-time brand snapshot V3.
- Kept approval actor identity separate for audit while rendering the snapshotted authorized signatory identity.
- Propagated the immutable signatory snapshot into quotation-derived Sales Order documents.
- Prevented fallback to a different company signature when a selected signatory has no signature asset.
- Preserved backward parsing/rendering for historical V1/V2 brand snapshots.

## Migration

`20260825230000_authorized_signatories` was applied only to the verified local development database `localhost:5432/voka`. No reset, drop, production, or remote database operation was performed.

## Validation

- Focused tests: 24 PASS, followed by 9 PASS after the final signature-capture/safety refinement.
- Full suite: 1205 PASS / 2 skipped.
- Typecheck: PASS.
- Production build: PASS.
- Prisma format/validate/generate: PASS.
- Diff check: PASS.

## Pending physical acceptance

- Camera capture and pointer/stylus drawing require real-device acceptance.
- Automatic photo background removal is not enabled: an unverified transform could alter signature identity. Captured photos are preserved unchanged; canvas output is transparent PNG. A future cleanup adapter must be explicitly acceptance-tested for identity preservation before activation.
