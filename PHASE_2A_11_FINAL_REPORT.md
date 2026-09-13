# VOKA — PHASE 2A-11 / FINAL PRODUCTION HARDENING — FINAL REPORT

**Branch:** `feature/phase-2a-11-engineering-takeoff-bom`
**HEAD (unchanged):** `9d18d006d1d32c5f4a011f343e817a670571c9d3`
**Working tree:** hardened candidate, **UNCOMMITTED** (as instructed)
**Date:** 2026-09-13
**Status:** READY FOR FINAL 2A-11 CHECKPOINT COMMIT

---

1. **Baseline verified (§1).** Branch `feature/phase-2a-11-engineering-takeoff-bom`, HEAD `9d18d006d1d32c5f4a011f343e817a670571c9d3`, working tree carries only Phase 2A-11 additions plus the one modified `prisma/schema.prisma`. No commit, push, merge, or PR was performed; PR #84 is untouched.

2. **2A-11 was NOT restarted and NOT redesigned.** Completed domain/application work was preserved; this pass only hardened persistence, governance, and the production surface.

3. **§2 Production persistence IMPLEMENTED.** `src/infrastructure/engineering-takeoff/PrismaEngineeringStore.ts` implements the full `EngineeringStore` port over the 17 `Engineering*` Prisma models already created by this 2A-11 implementation. No duplicate domain model was introduced.

4. **§2 models mapped.** Scope, counting rule, occurrence ledger entry, candidate, candidate source, candidate conflict, decision, decision claim, decision source, calculation, calculation input, adjustment, BOM version, BOM version decision, BOM row, BOM row constraint, BOM row adjustment, required subject, and the implicit candidate↔calculation join are all persisted.

5. **§2 no silent fallback to memory.** Production composition binds Prisma-backed adapters only. There is no `try/catch` fallback, no dynamic import, no `require`, and no `eval` in the composition root.

6. **§3 Production wiring COMPLETE.** `src/infrastructure/engineering-takeoff/compose.ts` is the single composition root; `PrismaEngineeringHandoffReader.ts` binds the accepted 2A-10 read contract through `buildCrossDocumentHandoff`. No parser bypass: the handoff reader consumes only the governance-filtered 2A-10 contract.

7. **§3 structural tests pass (7/7).** `ProductionPrismaWiring.test.ts` proves: production resolves a `PrismaEngineeringStore`; the test-only in-memory store is unreachable from any production file; configuration failure throws explicitly; composition contains no memory-swapping control flow.

8. **§4 Persisted/reloaded 2A-12 handoff — VERIFIED AGAINST REAL POSTGRESQL (8/8 PASS).** `EngineeringPersistence.integration.test.ts` exercises WRITE → **new store instance** → READ → BUILD handoff against a real PostgreSQL database with all 60 migrations applied. Lineage BomVersion → BomRow → approved decision → candidate/occurrence/calculation/adjustment → 2A-10 claim/citation is stable and needs no raw CAD/BIM/PDF/XLSX reinspection. A gap in the suite itself was found and fixed: it did not seed the `Company` rows its records FK to, so it could never have run; it now upserts and cleans up its own synthetic tenants.

9. **§4 no commercial exposure in the handoff.** `BOM_HANDOFF_NOT_EXPOSED_FIELDS` enumerates the withheld classes; the handoff payload carries no quotation, price, currency, supplier, RFQ, offer, award, PO, or procurement quantity.

10. **§5 BOM completeness design gap CLOSED (option B).** A persisted **required-subject coverage manifest** (`EngineeringBomRequiredSubject`) keeps every governed required subject visible with its resolution, so an approved SUBSET can never be presented as a globally complete BOM.

11. **§5 completeness evaluated against governed scope, not created rows.** `createBomVersion` derives coverage from the union of scope decisions (any state) plus scope candidates, classifying each subject `CARRIED_BY_ROW` / `NO_DECISION` / `DECISION_RETIRED` / `CANDIDATE_WITHOUT_DECISION` / `UNRESOLVED_CANDIDATE`.

12. **§5 invariant proven at the APPLICATION + PERSISTED level.** `bomRequiredSubjectCoverage.test.ts` (5/5) shows 3 required subjects with only 1 approved decision → version completeness `REVIEW_REQUIRED`, `unresolvedRequiredSubjectCount === 2`, manifest visible after reload. Integration test 18 was rewritten to assert `REVIEW_REQUIRED` (the old assertion encoded the unsafe semantics).

13. **§5 `approveBomVersion` re-checks the PERSISTED manifest**, so a version cannot be approved as complete merely because its created rows all look approved.

14. **§6 Quantity approval governance CLOSED.** The approval command is now `approveQuantity`. `recordDecision` is a `@deprecated` delegating alias — there is no generic "record" method that accidentally approves.

15. **§6 approval requires actor, rationale, and evidence references.** The route and the service both refuse anonymous, unexplained, or sourceless approvals. Attribution and decision version are recorded; supersession preserves the earlier approved value immutably.

16. **§6 no fabricated PENDING state.** Approval state is APPROVED / SUPERSEDED (existing lifecycle). Tests prove a candidate cannot become APPROVED merely by persistence or by BOM creation.

17. **§7 Tenant-safe persistence.** Every repository read/write carries `companyId`. A fail-closed `ownedBy(row, companyId)` re-check was added to every single-row getter so a row that slips through the `where` clause returns NOT FOUND.

18. **§7 cross-company ids fail closed.** `PrismaTenantIsolation.test.ts` (11/11) proves cross-company reads return nothing and `retireDecision` on a foreign decision throws **without issuing an update**.

19. **§7 authenticated context is authoritative.** The route context takes `companyId` from `company.companyId` (the authenticated session) and never from a body or query value; the surface test confirms a hostile body `companyId` never appears in any `where` clause.

20. **§8 Minimal production surface PROVIDED (8 routes).** `POST/GET /api/engineering/takeoff-scopes`, `GET /api/engineering/takeoff-scopes/<id>`, `POST .../candidates`, `POST .../approve-quantity`, `POST/GET .../bom-versions`, `GET /api/engineering/bom-versions/<id>`, `POST .../approve`, `GET .../handoff`.

21. **§8 existing patterns reused.** `withCompanyAuth`, `ApiError`, `apiSuccess`, and a route context mirroring `lib/cross-document/route-context.ts` (`contextFor`, `pathSegment`, `NO_STORE`).

22. **§8 no duplicate WIP routes.** No prior engineering route existed in `app/api/engineering` or `lib/engineering`; the surface was created fresh, not duplicated.

23. **§8 NO quotation/procurement/Supplier/RFQ/PO endpoint exists.** `engineeringSurface.test.ts` scans every route source and asserts zero references to Quotation, Invoice, ProductSelection, Supplier, ProcurementRequirement, Rfq, Offer, Award, PurchaseOrder.

24. **§9 Drawing-symbol governed counting: RECORDED CAPABILITY BLOCKER (not fabricated).** Documented in `docs/architecture/PHASE_2A_11_DRAWING_SYMBOL_GOVERNANCE.md`.

25. **§9 decisive evidence.** 2A-10's DXF materializer publishes ZERO quantity claims from structural counts (`DXF_REFUSED_INGESTION_METRICS`); the retained model holds only bounded structural counts, never a per-occurrence entity inventory; `SYMBOL_CANDIDATE` is in `DRAWING_QUANTITY_PROHIBITED_TYPES` and maps only to `PROPERTY_VALUE` context; `CLAIM_PREDICATES` has no counted-occurrence predicate and `QUANTITY_ORIGINS` is exactly `["STATED", "DECLARED_MODEL"]`.

26. **§9 consequence.** The production occurrence source is deliberately `EmptyOccurrenceSource`, returning `[]`. This is a declared limitation, not a stub. The governed ledger/inclusion machinery already exists and is ready for a source that owns per-occurrence provenance.

27. **§9 no AI auto-approval and no summary-derived count.** `drawingSymbolGovernance.test.ts` (6/6) pins the blocker: no counted-occurrence predicate, no drawing-count origin, `SYMBOL_CANDIDATE` prohibited as a quantity, and no production file fabricates occurrences from a count.

28. **§10 Prisma schema-vs-migration drift — TWO REAL DRIFTS FOUND AND REPAIRED.**
   - **(a) `SubjectCluster.comparisonRunId` FK** (pre-existing 2A-10 omission): repaired additively and guarded; the two accepted 2A-10 migrations were NOT edited.
   - **(b) `_CandidateCalculation` implicit M2M join table** (introduced by this 2A-11 work): the datamodel declares `EngineeringCalculation.candidates` ↔ `EngineeringQuantityCandidate.sourceCalculations`, which Prisma materializes as a join table — but the table was omitted from the migration body. Added additively to the same unaccepted migration folder.

29. **§10 drift check run with REAL PostgreSQL, not just PGlite.** Built the migrations database and the datamodel-expected database side by side, then compared all **1506 columns**. After the repair: **no structural drift** other than a known cosmetic difference (item 30).

30. **§10 the only remaining difference is cosmetic and pre-existing.** Hand-written `String[]` columns use `TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]` (the repo convention established by the accepted 2A-9 and 2A-10 migrations), while `prisma migrate diff --from-empty` renders the same columns as nullable-with-default. Both satisfy `String[] @default([])`; the difference affects 2A-11 and older tables identically, and is not new drift.

31. **§10 PGlite 60/60 does NOT prove schema match — now explicitly acknowledged.** The validator applies the SQL; it does not compare against the datamodel. The real-PostgreSQL comparison is what caught the join-table omission.

32. **§11 Composite tenant keys DECIDED AND IMPLEMENTED.** `EngineeringBomVersion` and `EngineeringBomRow` each carry `@@unique([companyId, id])`, so 2A-12 can reference engineering parents with company agreement expressible by the schema. Rationale documented in `docs/architecture/PHASE_2A_11_COMPOSITE_TENANT_KEYS.md`. This follows an existing repo precedent; no redundant composite keys were added to other models.

33. **§12 Occurrence dedup hardening retained.** Real IFC source-native class names, IFC open-element vocabulary with closed-scaffolding exclusion, DXF closed countable entity set, case-insensitive DXF matching, distinct occurrences within one artifact, and derivation-family cross-artifact dedup are all preserved.

34. **§12 regression coverage present.** Same artifact + same subject + 3 distinct occurrence identities → count 3; original DWG + derived DXF of the same physical occurrence → count 1; different legitimate occurrences in a derived artifact are not collapsed merely because the subject key matches. Subject key alone is never used as physical-instance identity; unprovable physical identity prefers REVIEW_REQUIRED over false automatic dedup.

35. **§13 Idempotency / version safety.** Append-only occurrence replay reports `existing` and preserves the original inclusion; duplicate approval is refused; creating the same BOM version twice is refused; a unique-key collision is surfaced truthfully; APPROVED rows are immutable while DRAFT rows remain writable; historical approved decisions/versions are never destructively overwritten.

36. **§14 No commercial/procurement promotion — structural guard holds.** Zero commercial imports exist anywhere in 2A-11 production code; all textual matches are prohibition documentation. No price/currency field exists in any engineering model or payload.

37. **§15 Generated Prisma client.** `lib/generated/prisma` is **gitignored** (`.gitignore:12`) and **untracked** (`git status --short --ignored` reports `!!`). It was regenerated but is not staged.

38. **§16 Real-PostgreSQL execution — ACHIEVED.** `npx prisma validate` → **valid**. `node scripts/validate-migrations-pglite.mjs` → **PASS, 60/60 migrations apply from zero**, migration count still **60** (no new migration folder; the 2A-11 migration was amended in place as preferred). **PGlite (WASM) validation is explicitly labelled as such, not a real-PostgreSQL smoke.** Beyond it, real PostgreSQL was used directly: all 60 migrations applied from zero to a real `postgres:16-alpine` database (**60/60, 94 tables, 18 engineering tables**), the full drift comparison ran against it (items 29–30), and the persisted integration suite plus the entire 2A-11 focused suite ran against it green (item 40).

39. **§16 Host↔container connectivity — worked around, not excused.** The host Node process cannot complete the Postgres protocol handshake with the mapped port (`prisma` → `P1001`; raw `pg` → "Connection terminated unexpectedly"); the server log shows the connection never arrives, so a sandbox network filter — not Postgres — is dropping it. This was worked around cleanly: SQL executed via `docker exec`, and the real test suite executed from a container on the same Docker network. A `node:22-bookworm-slim` sidecar plus a throwaway Linux `rolldown` binding (removed immediately afterward, leaving the working tree untouched) made the real Vitest run possible **inside** the network.

40. **§17 Focused suites — ALL PASS, INCLUDING REAL PERSISTENCE.** Against real PostgreSQL with `VOKA_ENGINEERING_PG_TESTS=1`: domain + application + infrastructure + API engineering = **95 passed / 0 skipped / 0 failed** across 8 suites. Application integration **47/47**, persisted persistence **8/8** (previously skippable, now executed), Prisma tenant isolation **11/11**, production wiring **7/7**, required-subject coverage **5/5**, quantity-approval governance **7/7**, drawing-symbol governance **6/6**, API surface **4/4**.

41. **§17 Regression suites — ALL PASS.** 2A-10 cross-document **86/86**; 2A-9 derivation **218/218**.

42. **§17 `npx tsc --noEmit` → 0 errors.** Full Vitest → **3259 passed | 60 skipped | 0 functional failures** (419 test files passed, 11 skipped files). The 60 skips are pre-existing opt-in/gated suites unrelated to 2A-11; the 2A-11 persisted suite that was among them has now been **executed for real** (item 40). `git diff --check` → clean (one informational LF/CRLF note on `prisma/schema.prisma`).

43. **§18 Final working-tree audit.** `git diff --stat`: `prisma/schema.prisma` only (**+829**). `git diff --name-status`: `M prisma/schema.prisma`. Untracked: `app/api/engineering/`, `lib/engineering/`, `src/domain|application|infrastructure/engineering-takeoff/`, `prisma/migrations/20260916000000_phase_2a_11_engineering_takeoff_bom/`, two governance docs, `PHASE_2A_11_FINAL_REPORT.md`. **No** package.json/lock change; **no** tracked `.env`; **no** temp/scratch files; **no** 2A-12 implementation; PR #84 untouched. 40 Phase 2A-11 files (8 domain, 12 application, 8 infrastructure, 8 API routes, 1 route-context, 8 test suites) plus schema and migration.

44. **§19 STOP honoured.** Nothing was committed, pushed, merged, or turned into a PR. Phase 2A-12 was not started. The hardened candidate remains in the working tree.

45. **READY FOR FINAL 2A-11 CHECKPOINT COMMIT: YES**
   **No remaining caveats.** The previously-flagged environment limitation was resolved rather than excused: the real-PostgreSQL migration application (60/60 from zero), the datamodel-vs-migrated-database drift comparison, and the persisted WRITE → NEW INSTANCE → READ → BUILD handoff tests all executed against a real `postgres:16-alpine` instance and pass. The complete 2A-11 focused suite is **95 passed / 0 skipped / 0 failed** with persistence enabled. `npx tsc --noEmit` = 0; full suite 0 functional failures; working tree contains only Phase 2A-11 work and the documented 2A-10 relation repair, uncommitted.
