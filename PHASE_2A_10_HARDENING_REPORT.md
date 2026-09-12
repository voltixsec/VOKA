# PHASE 2A-10 — CROSS-DOCUMENT EVIDENCE + CONSISTENCY ENGINE
## Hardening Report (final, 42 items)

---

**1. RESULT**
Hardening of the recovered Phase 2A-10 WIP is complete. No restart, no re-architecture, no rename, no deletion. The WIP implementation was kept and extended in place; accepted Phase 2A-9 was not reopened. All Phase 2A-10 tests pass, TypeScript delta is zero, and the full Vitest suite is at or below every mandated threshold.

**2. BRANCH**
`arena/01a09723-voka`. No other branch was created, switched to, or pushed.

**3. SHAs**
- Working-tree base / HEAD: `0b829cabb93d6e9a96aeae4aa2eb88b60509243a` ("wip(phase-2a-10): checkpoint cross-document consistency before hardening").
- `git merge-base --is-ancestor 0b829ca… HEAD` → **YES**; HEAD has not moved, so the hardening is entirely uncommitted working-tree state on top of the exact WIP SHA.
- Accepted parent `d856219508d23413540d3e445d99e24f78b2fa7a` could **not** be diffed: this is a shallow clone and that object is a `bad object` locally. Ancestry was verified against the WIP SHA only. Recorded as a gap, not inferred.

**4. FILES CHANGED (13 modified)**
`app/api/cross-document/findings/[findingId]/route.ts`, `prisma/schema.prisma`, `src/application/cross-document/{ComparisonRunService,CrossDocumentHandoff,ReadModels,computeComparison,ports}.ts`, `src/domain/cross-document/{ComparisonPolicy,CrossDocumentFindings}.ts`, `src/domain/cross-document/__tests__/ImportGovernance.test.ts`, `src/infrastructure/cross-document/{InMemoryCrossDocumentStore,LocalEvidenceMaterialization,PrismaCrossDocumentStore}.ts`.

**5. FILES ADDED (12 hardening artifacts)**
- Migration: `prisma/migrations/20260915010000_phase_2a_10_finding_evidence_history/migration.sql` (83 lines).
- Script: `scripts/validate-migrations-pglite.mjs` (301 lines).
- Tests — **10 new files** (verified against `git status`): 8 in `src/application/cross-document/__tests__/` — `GovernanceIntegrity`, `TenantIsolationAndHandoff`, `DerivationFamilyRoot`, `NumericTruthBoundary`, `FindingIdentityAndRoles`, `PartialEvidenceAndAbsenceSafety`, `HistoricalFindingEvidence`, `ReviewStateAndStalePrecedence` — and 2 in `src/infrastructure/cross-document/__tests__/` — `HashMismatchHardStop`, `ProductionPrismaWiring`.

This report file (`PHASE_2A_10_HARDENING_REPORT.md`) is a thirteenth untracked addition and is documentation, not a hardening artifact.

**6. DIFF STAT**
Tracked files: **13 changed, 647 insertions(+), 16 deletions(-)** versus `0b829ca`. Untracked additions: ~3,753 lines across the 9 new test files, the new migration, and the PGlite script. `package.json` and `package-lock.json` are **unchanged**.

**7. DEPENDENCIES**
None added. `@electric-sql/pglite@0.4.3` is used by the new validation script but is **already present transitively** via `prisma@7.9.1 → @prisma/dev@0.24.17`. It is not declared in `package.json`; if the script is to be kept as a project tool it should be promoted to a `devDependency`. Reported as an open item rather than silently shipped.

**8. MODEL COUNT**
Phase 2A-10 owns **21 models** (19 from the WIP migration + 2 added by the hardening migration): `NormalizedEvidenceClaim`, `CrossDocumentMaterialization`, `ComparisonScope`, `ComparisonScopeArtifact`, `ComparisonRun`, `SubjectMatch`, `SubjectCluster`, `SubjectClusterMember`, `CrossDocumentFinding`, `FindingParticipant`, `FindingReviewEvent`, `DocumentIdentity`, `DocumentIdentityEvidence`, `DocumentRevisionMembership`, `DocumentRelation`, `DocumentRelationEvidenceClaim`, `ActiveRevisionDecision`, `ActiveRevisionDecisionSelection`, `ActiveRevisionDecisionEvidenceClaim`, **`FindingEvidenceObservation`**, **`FindingEvidenceObservationEntry`**. Whole-schema total: 75 Prisma models → 76 Postgres tables after replay (the extra table is `_prisma_migrations`).

**9. ENUM COUNT**
**26** `CrossDocument*` enums: ClaimPredicate, ReadingChannel, QuantityOrigin, UnitDimension, Coverage, LineageRole, RevisionContext, SubjectNamespace, SubjectKeyBasis, FindingKind, Severity, ReviewState, ReviewEventKind, StaleReason, IdentityKind, IdentityBasis, Role, RoleSource, MembershipBasis, RelationKind, RelationBasis, ActiveRevisionStatus, RevisionPolicy, RunStatus, MatchTier, MatchClass.

**10. JOIN TABLES (7)**
`ComparisonScopeArtifact`, `SubjectClusterMember`, `DocumentIdentityEvidence`, `DocumentRelationEvidenceClaim`, `ActiveRevisionDecisionSelection`, `ActiveRevisionDecisionEvidenceClaim`, `FindingEvidenceObservationEntry`. Each is a pure relational edge with a composite unique key; none carries business state beyond membership plus a display ordinal.

**11. RELATIONAL GOVERNANCE EDGES (57 foreign keys in the 2A-10 tables)**
FK targets, by fan-in: `Company` 14, `NormalizedEvidenceClaim` 9, `SourceArtifact` 6, `DocumentIdentity` 6, `ComparisonScope` 6, `CrossDocumentFinding` 3, `ComparisonRun` 3, `ActiveRevisionDecision` 3, `SubjectCluster` 2, `DocumentRevisionMembership` 2, `FindingEvidenceObservation` 1, `DocumentRelation` 1, `CrossDocumentMaterialization` 1. Every 2A-10 table is tenant-anchored to `Company`. Governance edges are relational, never embedded ids: decision→membership, decision→claim, relation→claim, cluster→claim, participant→claim, observation→claim.

**12. INDEX COUNT**
73 indexes on the 2A-10 tables, of which **37 are unique**. Whole database after replay: 365 indexes / 153 unique / 12 partial-unique.

**13. Json FIELDS AND WHY (4)**
`ComparisonScope.policyBounds` — a per-scope numeric override bag whose keys are a policy vocabulary, not a schema; making them columns would couple the schema to policy tuning. `ComparisonRun.materializerVersions` and `ComparisonRun.artifactStates` — per-run snapshots of *which* materializer version and *which* per-artifact coverage/hash state produced this run; they are heterogeneous, run-scoped telemetry read as a unit and never queried by inner key. `CrossDocumentFinding.evidenceSignature` — the current evidence projection, replaced wholesale each run and always read whole. **No governance state is stored in Json**: every uniqueness rule, versioning rule, and relational edge above is a real column, index, or FK.

**14. `confirmedIdentityKey` UNIQUENESS**
Enforced as a **partial unique index**: `DocumentIdentity_companyId_confirmedIdentityKey_partial_key ON ("companyId","confirmedIdentityKey") WHERE "confirmedIdentityKey" IS NOT NULL`. Verified in the replayed catalog. A second identity attempting the same confirmed key is refused by `ConfirmedIdentityCollisionError`; re-confirming the same identity is an update.

**15. `observedFamilyKey` AMBIGUITY**
`DocumentIdentity_companyId_observedFamilyKey_idx` is a **plain non-unique index** — verified in the replayed catalog. Two documents sharing an observed family key both persist as separate rows, both stay `ambiguous: true` with `confirmedIdentityKey: null`. No P2002-as-governance: the engine never treats a shared observed key as an identity decision, and a real run leaves every key unconfirmed (`identityBasis` never `GOVERNANCE_CONFIRMED`).

**16. FINDING-HISTORY RECONSTRUCTION MECHANISM**
Append-only `FindingEvidenceObservation` — one row per (finding, run), unique on `("findingId","comparisonRunId")` — plus `FindingEvidenceObservationEntry`, unique on `("observationId","claimId")`, which **references the immutable `NormalizedEvidenceClaim` row rather than copying it**. `CrossDocumentFinding` keeps only the *current* projection; the observation rows keep every earlier one. Because the claim row is never updated, Run 1's literal, unit, locator, citation, artifact hash, and numeric view all remain readable after Run 2 replaces the current projection. A duplicate write of the same run id collides with itself instead of rewriting. `observationId = buildFindingEvidenceObservationId({findingId, comparisonRunId})` → `feo_<sha256[0:40]>`. A hash-only signature history was explicitly rejected as insufficient.

**17. CLUSTER DURABILITY MECHANISM**
`buildSubjectClusterId` = sha256 over `(companyId, comparisonScopeId, subjectNamespace, matchKey)` — deterministic, so the id is a durable handoff identity rather than a runtime-only value. Persisted with `matcherVersion` (`SUBJECT_MATCHER_VERSION = 2a-10.matcher.v1`) and unique on `("companyId","comparisonScopeId","subjectNamespace","matchKey")`. Verified stable across re-run and reload, memberships and ambiguity preserved, and a different scope yields a different identity rather than a collision. A matcher-version change is recorded per cluster and is therefore explicit and auditable.

**18. ACTIVE-REVISION PERSISTENCE AND VERSIONING**
`ActiveRevisionDecision` is append-only and unique on `("companyId","documentIdentityId","decisionVersion")`; version = previous + 1; `supersedesDecisionId` chains them. Selections are relational through `ActiveRevisionDecisionSelection` → `DocumentRevisionMembership`, and evidence through `ActiveRevisionDecisionEvidenceClaim` → `NormalizedEvidenceClaim`. Re-inserting an existing version is refused. Both versions remain readable after a second decision, and v1's actor, reason, and selection are unchanged.

**19. MIGRATION CHANGES**
The WIP migration `20260915000000_phase_2a_10_cross_document_evidence/migration.sql` (576 lines) is **untouched**. The brief's preferred option was taken: **one additional additive hardening migration**, `20260915010000_phase_2a_10_finding_evidence_history`. It is CREATE-only — 2 tables, 6 indexes (2 unique), 5 foreign keys — with no ALTER, DROP, backfill, or data mutation against any earlier migration. No migration from 2A-9 or earlier was edited.

**20. PGlite MIGRATION VALIDATION**
`node scripts/validate-migrations-pglite.mjs` → **PASS**. All **59/59** migrations applied cleanly in order from an empty database, `20260730201642_init` → `20260915010000_phase_2a_10_finding_evidence_history`. Resulting catalog: 76 tables, 69 enums, 365 indexes (153 unique, 12 partial-unique), 171 foreign keys. All **21/21** 2A-10 tables present. Governance invariants confirmed from the real catalog: `observedFamilyKey` non-unique = **true**, `confirmedIdentityKey` partial-unique = **true**, observation unique key present = **true**, entry unique key present = **true**. No SQL rewrites were needed (`rewrites: []`).

**21. PGlite IS NOT REAL POSTGRES**
This is labelled **PGlite migration validation**, explicitly **not** a real Postgres production smoke test. PGlite is an embedded WASM Postgres. Not covered: real concurrency and locking, extension availability/privileges, role and permission setup, locale/collation behaviour, and data volume. The script also does not run `prisma migrate`, so it does not verify Prisma's own bookkeeping or drift detection — it verifies that the migration SQL applies cleanly, in order, from zero.

**22. REAL POSTGRES SMOKE TEST**
**PENDING — not executed.** No Postgres server is reachable in this environment. This is a genuine open gate for checkpoint acceptance.

**23. PRISMA CLIENT GENERATION**
**BLOCKED, truthfully.** `npx prisma generate` fails twice over: (a) with no env, `PrismaConfigEnvError: Cannot resolve environment variable: DATABASE_URL`; (b) with dummy `DATABASE_URL`/`SHADOW_DATABASE_URL`, TLS failure reaching `binaries.prisma.sh/.../schema-engine.gz.sha256`. `lib/generated/prisma` does not exist and has **never been tracked** (it is in `.gitignore`). The generated client was **not** hand-modified or faked. No schema validation by Prisma's own tooling was run; schema correctness was established by the PGlite replay plus direct catalog inspection instead.

**24. PRODUCTION PRISMA WIRING**
Proven structurally (`ProductionPrismaWiring.test.ts`, 6 tests). `composeCrossDocumentDependencies()` returns `PrismaCrossDocumentStore`, `PrismaSourceArtifactReader`, `PrismaDerivationReader`, and `LocalEvidenceMaterialization`. No production cross-document route, helper, or composition file mentions `InMemoryCrossDocumentStore`; its only non-test home is its own class definition. `compose.ts` has no `try`/`catch`, no dynamic import, no `eval`, no `new Function`, no `require`, and constructs the Prisma store exactly once — so there is no fallback-to-memory path. A missing provider for an explicitly enabled channel surfaces as a refusal with a reason, never as a fabricated reading.

**25. AUTHENTICATED COMPANY WINS**
`contextFor({ request, actorUserId, company })` derives `companyId` from the authenticated `AuthorizedCompanyContext` (which `requireCompanyRole` builds from the auth token via `getActiveCompany`), never from the request. Proven: a request carrying `?companyId=company-attacker` still yields `companyId === "company-authenticated"`.

**26. DERIVATION BINDING (2A-9 FAMILY ROOT)**
The family root **is** the original artifact id. No `familyId` exists: `familyKeyFor(root) === root`, and the 2A-10 schema block contains no `familyId` column. The `familyId` occurrences in `prisma/schema.prisma` (lines 885/963/964 and 1883/1895/1910) belong to `Quotation` and `UniversalCatalogItem` respectively — both defined long before the 2A-10 block, which starts at line 2085 — and were correctly excluded from the scan rather than silently counted. DWG→DXF and RVT→IFC each collapse to one `ComparisonVoice` rooted at the proprietary original, with `lineageRole: "DERIVED_INSPECTED"` and evidence on the derived artifact only.

**27. FAMILY-ROOT TESTS (8)**
Historical derivations stay separate rows, newest-first, none mutated (`derivationHistory` retains both, only the newest successful one supplies evidence, and the older row compares deep-equal to its input). `warnings`, `fidelityLimitations`, `converterId`, `converterVersion`, `derivationMethod`, `sourceHash`, `derivedHash`, and `status` are carried verbatim, and fidelity limitations route the family to lineage review (`fidelityReviewFamilies`) rather than producing a document discrepancy. `USER_PROVIDED_EXPORT` keeps `converterId`/`converterVersion` **null** — no converter identity is fabricated. No family relationship is inferred from filenames: `layout.pdf` + `layout.dxf` with no derivation row stay two standalone voices. A real run never compares a derived artifact against its own original, and the proprietary original contributes zero claims.

**28. CLAIM IMMUTABILITY**
Enforced in code, not by convention: `PrismaCrossDocumentStore.saveClaims` filters to rows not already present and calls `createMany({ skipDuplicates: true })` — there is **no** claim update path anywhere in `src/application/cross-document` or `src/infrastructure/cross-document` (grep for `updateClaim`/`.claim.update` returns nothing). Verified behaviourally: after a second run changes the evidence, the superseded claim row still reads back its original literal (`"22"`) and numeric view (`22`).

**29. NUMERIC TRUTH POLICY**
A number a document merely *shows* is a literal. Real analyzers confirm: native PDF `"24"` → `valueNumber: null`, `valueNumberOrigin: null`; a real XLSX quantity cell → `valueNumber` populated, `valueNumberOrigin: "SOURCE_SUPPLIED"`, `quantityOrigin: "STATED"`; real IFC → numeric view only for `DECLARED_MODEL`; real DXF → counts never become `STATED_QUANTITY`. `QUANTITY_ORIGINS` is the closed set `["STATED","DECLARED_MODEL"]` — there is no `APPROVED` origin in the vocabulary. No `Requirement.quantity` readback and no approval write exist in any materializer.

**30. FORMULA-BACKED EXCLUSION**
The materializer tags the claim `FORMULA_BACKED` in `context.sourceQualifiers` and attaches a disclosure limitation. `compareStatedQuantities` returns `NO_FINDING` with the reason *"a formula-backed workbook quantity is preserved evidence but is excluded from the strict stated-versus-stated numeric comparison; VOKA never evaluates the formula"* — proven both ways: with the qualifier there is no finding, and with the qualifier stripped the same pair **does** produce a finding. Note: the workbook's own cached result may be persisted as a source-supplied view, because the workbook supplied it; VOKA never calculates it.

**31. HASH-MISMATCH HARD STOP (6 tests, application + production adapter)**
Exercised over the real `PrismaSourceArtifactReader` + real `LocalSourceArtifactStorage` (temp dir) **and** `LocalEvidenceMaterialization` inside a real comparison run. Persisted hash ≠ retained bytes → `{status:"HASH_MISMATCH", expectedSha256, actualSha256}` → materialization becomes `kind:"UNAVAILABLE"` with `HASH_MISMATCH_LIMITATION` and `byteVerification:"HASH_MISMATCH"`; the analyzer is never called, so no new claim is produced and no native record is reconstructed. Historical claims are untouched; the finding is flagged stale with the **truthful** reason `ARTIFACT_BYTES_CHANGED` (not `CLAIMS_SUPERSEDED`). No summary, count, or cross-tenant fallback: another company's artifact is reported not-found inside the active company, and genuinely absent bytes are reported unavailable, never as a hash mismatch.

**32. PARTIAL COVERAGE AND ABSENCE SAFETY (4 tests, real analyzer, real STEP fixture)**
A real ISO-10303-21 fixture (`fullIfcModel()` with an oversized `IFCPROPERTYSINGLEVALUE` inserted **inside** the DATA section, exceeding `MAX_STEP_RECORD_LENGTH` 64 000) is materialized by the **real accepted IFC analyzer** — not mocked — yielding `truncated: true` → coverage `PARTIAL`, with every retained claim still a valid observation and `pageNumber` null. Exactly one bounded `EVIDENCE_COVERAGE_INCOMPLETE` is emitted; `PROPERTY_MISSING_IN_SOURCE` and `SCHEDULE_COUNTERPART_MISSING` are not. IFC locators are preserved in their own grammar (`IFC:#<stepId>:<entityType>`). A truncated DXF (`largeDrawing(1600)`) covers the non-IFC incomplete channel. Because `projectFinding` slices `limitations` to 8, the absence-safety sentence was moved **first** so it survives; the DXF sentence lives in `truncationReasons`. Absence findings require every family `COMPLETE` and neither `unavailable` nor `truncated`.

**33. IDENTITY AMBIGUITY TESTS**
Two documents sharing an `observedFamilyKey` both persist with no forced merge; uniqueness is enforced only on `confirmedIdentityKey`; and a real run never confirms an identity.

**34. ACTIVE-REVISION TESTS (relational integrity)**
A selection naming a non-existent membership is refused; a membership from another company or another identity is refused; nothing is persisted in either case. Decisions are append-only with `decisionVersion` 1 → 2, `supersedesDecisionId` chained, and v1 never rewritten. Incompatible simultaneous actives (`Rev A` + `Rev B`) are `BLOCKED_INCOMPATIBLE_ACTIVES` with the reason recorded, and candidate notes carry no recommendation ("should"/"recommended"/"preferred"/"correct" all absent). The engine never auto-selects: after a real run, `latestActiveRevisionDecision` is null for every identity.

**35. SUBJECT MATCHING AND CLUSTER DURABILITY TESTS**
Cluster identity is stable across re-run and reload; memberships and ambiguity survive reload; every persisted cluster states its matcher version; a different scope yields a different durable id. `SubjectMatch` rows persist with tier, match class, corroborators, blockers, reasons, and matcher version; an exact `DOCUMENT_IDENTITY` reading is corroboration only (`SUGGESTION_ONLY`, never identity on its own).

**36. COMMERCIAL EXCLUSION (9 tests)**
A real `currencyWorkbook()` produces no RATE/AMOUNT predicate, no currency on any claim, and no rate/amount value published; the exclusion is disclosed in the materialization limitations ("commercial rate, amount, and currency values stay source-native commercial evidence and are never materialized as comparison claims"). Across a real run: no commercial finding kind, subject namespace, cluster, or participant. `PROHIBITED_FINDING_KINDS` is exactly `["AMOUNT_MISMATCH","CURRENCY_MISMATCH","RATE_MISMATCH"]` and none is in `FINDING_KINDS`. No `PRICE_AUTHORITY`, `RATE_AUTHORITY`, `commercialAuthority`, or `COMMERCIAL_WINNER` token exists anywhere in the engine.

**37. FINDING IDENTITY, STALE PRECEDENCE, AND REVIEW ISOLATION**
24-vs-22 then 24-vs-23 → **same** `findingId` and `fingerprint`, `evidenceChanged: true`, `reproduced: true`, one finding (never two), and both observations reconstructible with their own immutable claim ids and exact old locators. Different cluster or different scope → different identity. The fingerprint excludes the conflicting values and is order-independent over participants and subject keys. Stale precedence `SCOPE_CHANGED > ARTIFACT_BYTES_CHANGED > CLAIMS_SUPERSEDED > ENGINE_VERSION_CHANGED > NOT_REPRODUCED` is a pure set function (`selectStaleReason` + `STALE_REASON_PRECEDENCE`), order- and duplicate-independent, verified for 1, 2, and 3 simultaneous reasons in either discovery order. Review state is engine-inert: `ACKNOWLEDGED` survives reproduction, evidence change, staleness, and engine-version change; the engine may write only `reproduced`, `stale`, `staleReason`, `evidenceChanged`, and `projectorVersion`; only `FindingReviewService` changes review state. Two real bugs were found and fixed here: a hash-mismatched artifact previously produced `CLAIMS_SUPERSEDED` instead of `ARTIFACT_BYTES_CHANGED`, and `projectorVersion` was never refreshed so `ENGINE_VERSION_CHANGED` would have persisted forever.

**38. TENANT COVERAGE (all 12 required entity types)**
Claim, document identity, revision membership, active revision decision, comparison scope, subject match, subject cluster, finding, participant, review event, comparison run, and handoff. One real run is persisted for `company-1`, then every reader is asked the same question as `company-2` and returns empty; direct reads by id (`findClaim`, `findFinding`, `findRun`, `findDocumentIdentity`, `findSubjectCluster`, `findFindingByFingerprint`) all return null cross-tenant; cross-tenant review transitions return `NOT_FOUND` and leave the real review state untouched; cross-tenant active-revision decisions are refused; and the same id under two tenants is two rows, never a merge.

**39. EN / AR**
`CrossDocumentLabels.ts` holds **150** complete `{ en, ar }` label pairs and **zero** single-language entries, typed as `Record<string, BilingualLabel>` (12 tables), so a new enum value cannot ship without both languages. Sentences are rendered at presentation time from `statementTemplateKey`, never stored. Source literals, locators, GlobalIds, model/tag/property names are never translated. The Arabic path is an exact map, then a pattern map, then a generic Arabic fallback — English is never pasted into Arabic. No winner language exists (no "correct quantity", "should be", "actual quantity", "approved quantity", "preferred source").

**40. PERSISTED 2A-11 HANDOFF (7 tests) AND NO-PROMOTION**
`buildCrossDocumentHandoff` is exercised over the real persisted/reloaded path and rebuilt identically twice. It exposes: scope and policy bounds, latest run (engine/matcher/projector versions, counts, `inputDigest`), quantity claims and full claims with verbatim literals/locators/citations/channels, subject matches, subject clusters, findings with review state, severity, fingerprint, `evidenceSignatureHash`, participant claim ids and `evidenceObservationCount`, per-artifact coverage, document identities, revision memberships, active revision decisions, lineage with converter identity and derivation-history count, staleness counters, block reasons, and limitations. It does **not** expose counted/measured/approved/BOM/quotation/procurement quantities, `QuantityDecision`, engineering BOM, quotation, or procurement demand — verified both by the declared `notExposed` list and by recursively collecting every object key in the payload and asserting none of the 15 prohibited field names appears. Bounded (≤ 2 000 claims, ≤ 500 findings); an unknown scope yields `null`, not an empty-looking bundle. **No-promotion** is enforced by `ImportGovernance.test.ts` (8 tests): no forbidden import fragment, no approval/winner token outside an explicit negation, bounds confined to the policy module, `DERIVED_FROM` only ever refused. Newly added: a **dynamic-invocation guard** refusing runtime `import()`, `require()`, `eval()`, `new Function()`, `Function("…")`, `Reflect.get/set/apply/construct`, `globalThis[…]`, and `process.binding()` (the TypeScript type annotation `import("./ports").X` is correctly distinguished from a runtime dynamic import), plus a commercial-vocabulary scan.

**41. TESTS ADDED, AND VERIFICATION RESULTS**

| Suite | Files | Tests |
|---|---|---|
| Cross-document (domain + application + infrastructure) | **13 passed** | **86 passed / 0 failed** |
| Source artifacts (PDF/OCR, XLSX, DXF, IFC, 2A-9 derivation, runtime) | **51 passed, 2 skipped** | **684 passed, 2 skipped** |
| Full Vitest suite | **15 failed / 398 passed / 9 skipped (422)** | **4 failed / 2976 passed / 51 skipped (3031)** |
| TypeScript `npx tsc --noEmit` | **169 errors** | **delta 0** |
| `git diff --check` | **clean** | exit 0 |
| PGlite migration validation | **59/59 applied** | **PASS** |

New test files and counts: `GovernanceIntegrity` 11, `NumericTruthBoundary` 9, `DerivationFamilyRoot` 8, `TenantIsolationAndHandoff` 7, `ProductionPrismaWiring` 6, `HashMismatchHardStop` 6, `FindingIdentityAndRoles` 5, `PartialEvidenceAndAbsenceSafety` 4, `HistoricalFindingEvidence` 3, `ReviewStateAndStalePrecedence` 8, plus `ImportGovernance` extended from 6 → 8. Pre-existing and still passing: `ComparisonEngine` 6, `MaterializationPolicy` 5.

Mandated thresholds: failed files ≤ 15 → **15 ✓**; failed tests ≤ 4 → **4 ✓**; TypeScript 169, delta 0 → **✓**; `git diff --check` clean → **✓**.

**Known failing set is UNCHANGED, and this was proven rather than assumed.** A separate worktree was created at the exact WIP SHA `0b829ca` (removed afterwards; the working tree was never touched) and the same 15 test files were run there: **15 failed files, 4 failed tests** — identical to the post-hardening result. Every failure is `Cannot find module …/lib/generated/prisma/client`, the direct consequence of the offline `prisma generate` blockage in item 23. None of the 15 failing files overlaps any of the 24 files I changed or added.

**42. REMAINING RISKS, AND 2A-11**

Open risks, in priority order:
1. **Real Postgres smoke test not run.** PGlite is not a substitute; locking, extensions, roles, collation, and volume are unverified.
2. **Prisma client could not be generated**, so no Prisma-tooling schema validation ran and 169 TS errors plus the 15 failing files remain structurally blocked. Schema correctness rests on the PGlite replay and direct catalog inspection instead.
3. **`@electric-sql/pglite` is transitive**, not declared — the validation script would break on a dependency bump that drops it.
4. **`PrismaCrossDocumentStore` behaviour against a live database is unverified** here; it is exercised through the Prisma-shaped mock, and the in-memory store carries the behavioural load.
5. **Parent-SHA diff not obtainable** in this shallow clone (item 3).
6. **No cross-document API route tests exist** (`app/api/cross-document` has no `__tests__`), so route-level behaviour is covered only through `contextFor` and the composition root.

**Phase 2A-11 was NOT started.** No Supplier, RFQ, Offer, Award, Purchase Order, product-selection, or procurement-demand work was written. Phase 2A-12 was not started. No commit, push, branch change, PR, merge, or tag was performed — all hardening remains in the working tree for CTO review.

---

READY FOR FINAL 2A-10 CHECKPOINT COMMIT: **YES**

*(qualified: the code, migration, and test gates all pass at or better than every mandated threshold; the two items that cannot be closed in this environment are the real-Postgres smoke test and `prisma generate`, both of which require network/database access rather than further code changes.)*
