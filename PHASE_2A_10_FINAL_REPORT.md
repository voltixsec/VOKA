# Phase 2A-10 — Cross-Document Evidence + Consistency Engine — Final Report

Answers the mandated 50 items. Everything below was executed on this checkout; nothing is claimed that was not run.
**No commit, no push, no PR: the whole phase is left in the working tree for CTO acceptance.**

1. **Result** — Phase 2A-10 implemented and validated on the 2A-9 checkpoint. Cross-document evidence flow is complete
   end to end: 2A-9 lineage → materialized immutable `NormalizedEvidenceClaim`s → document/revision governance →
   conservative subject matching → cross-document findings → human review → `CrossDocumentHandoff` for 2A-11.
2. **Branch** — `arena/01a096dd-voka` (session branch; the old read-only scout branch was not touched).
3. **HEAD** — `d856219508d23413540d3e445d99e24f78b2fa7a`, unchanged (checkpoint base). Working tree carries the work.
4. **Base verification** — `git merge-base --is-ancestor d856219… HEAD` passes; tree was clean at start; baseline
   reproduced before editing: `tsc` = 169 errors, Vitest = 15 failed/385 passed/9 skipped files and
   4 failed/2890 passed/51 skipped tests (all failures = missing generated `lib/generated/prisma/client`).
5. **File list** — 56 changed paths: 1 modified (`prisma/schema.prisma`, +827 lines) and 55 new files —
   8 domain (`src/domain/cross-document/`), 18 application + 6 materializers + 3 tests
   (`src/application/cross-document/`), 7 infrastructure (`src/infrastructure/cross-document/`), 11 API routes
   (`app/api/cross-document/**`), 1 helper (`lib/cross-document/route-context.ts`), 1 migration + `migration.sql`.
6. **Diff stat** — new non-test source 12,263 lines; new tests 885 lines; migration 576 lines; schema 827 added lines;
   `git diff --check` clean. No file deleted, moved, or renamed.
7. **Dependencies** — none added. No new package, no new service, no LLM/embedding/network path.
8. **Schema** — additive block appended to `prisma/schema.prisma`: `NormalizedEvidenceClaim`, `CrossDocumentMaterialization`,
   `ComparisonScope(+Artifact)`, `ComparisonRun`, `SubjectMatch`, `SubjectCluster(+Member)`, `CrossDocumentFinding`,
   `FindingParticipant`, `FindingReviewEvent`, `DocumentIdentity(+Evidence, +EvidenceClaim)`,
   `DocumentRevisionMembership`, `DocumentRelation(+EvidenceClaim)`, `ActiveRevisionDecision(+Selection, +EvidenceClaim)`.
   Json is used only for engine payloads (`policyBounds`, `evidenceSignature`, `materializerVersions`, `artifactStates`).
9. **Migration** — new `prisma/migrations/20260915000000_phase_2a_10_cross_document_evidence/migration.sql`, additive only.
   No 2A-6/2A-7/2A-8/2A-9 migration file was modified; no drop, reset, truncate, or historical rewrite.
10. **PG smoke status** — no real Postgres in this sandbox. Proof is **PGlite (WASM Postgres)**: the full migration chain
    replays **58/58 OK** including the 2A-10 migration, and the constraint suite reports **ALL CONSTRAINTS OK**
    (19 2A-10 tables, 26 enums, 52 FKs from 2A-10 tables; duplicate claim id and claim FK rejected; partial unique
    index on `confirmedIdentityKey` = 1; `observedFamilyKey` index NOT unique = 1; duplicate finding fingerprint per
    scope rejected; duplicate participant rejected; DERIVED_FROM and RATE/AMOUNT/CURRENCY findings rejected by enum,
    decision v1 re-insert rejected / v2 appends; identity deletion nulls the participant reference, evidence survives).
    Honest caveat: `npx prisma validate|generate|migrate diff` cannot run offline (schema-engine download blocked),
    so the schema is proven by the migration replay + typecheck, not by `prisma validate`.
11. **DerivationReader binding** — `PrismaDerivationReader` reads the real 2A-9 `ArtifactDerivation`
    (`listByOriginalArtifact` / `listByDerivedArtifact` / `listForArtifacts`) into `DerivationReadModel`; no new
    `familyId`, no write, no mutation of any 2A-9 row.
12. **Family-root behavior** — family root is always `ArtifactDerivation.originalArtifactId`; `LineageCollapse` folds a
    successful derivation's derived artifact into its original's family, so RVT-vs-its-own-IFC and DWG-vs-its-own-DXF
    never compare as two sources; a fidelity gap yields `DERIVATION_FIDELITY_REVIEW` instead of a normal discrepancy.
    Failed/pending derivations stay history and never fold.
13. **Claim architecture** — persisted immutable `NormalizedEvidenceClaim` with sections
    subject/assertion/context/provenance/document/derivation/engine; deterministic `clm_<sha256>` id over
    company+artifact sha256+channel+predicate+subject+locator+literal (identity excludes
    `documentIdentityId`/`documentRevisionMembershipId`/`revisionContext`/decision id); `status = OBSERVED_NOT_APPROVED`,
    `purpose = CROSS_DOCUMENT_COMPARISON_ONLY`. No parser-native object copy is persisted.
14. **Re-open policy** — governed re-open only through `SourceArtifact.storageRef` + SHA-256 verification against
    `contentSha256`: `VerifiedArtifactBytes` is `OK | UNAVAILABLE | HASH_MISMATCH`, and a mismatch is a terminal hard
    stop that yields no claim and no re-parse. No native record is ever fabricated.
15. **Adapters (all)** — `PrismaSourceArtifactReader` (company-scoped list/find + verified bytes through the accepted
    `LocalSourceArtifactStorage`, whose `storageRef` grammar `^[a-f0-9]{2}/[a-f0-9]{64}$` blocks traversal),
    `PrismaDerivationReader`, `PrismaCrossDocumentStore` (immutable claims via exists-then-create, engine flags and
    human review state in separate methods), `InMemoryCrossDocumentStore` (deterministic test store),
    `LocalEvidenceMaterialization` (bytes → accepted analyzer → dispatcher), `compose.ts` (composition root).
16. **IFC materialization** — element instances are never counted as quantities and no geometry is computed; a declared
    IFC quantity materializes as `DECLARED_MODEL` evidence, never as verified data; PARTIAL/truncated coverage
    suppresses absence and produces `EVIDENCE_COVERAGE_INCOMPLETE` instead.
17. **Units** — verbatim or null; no conversion, FX, multiplication, or rounding. Resolution uses only the small closed
    `UNIT_SYNONYM_GROUPS` table (m2/m²/sqm, nos/no./each/ea/pcs, …EN+AR). IFC units join only through that record's
    explicit `unitLocator` (no inheritance/inference; unknown ⇒ `unitLiteral` null, `unitDeclared` false, limitation
    disclosed). `$INSUNITS`/project units never become subject quantity units (`DOCUMENT_LEVEL_UNIT_SOURCES`).
18. **Identity** — evidence-derived identity suggestion (`suggestDocumentIdentity`, `groupSuggestedIdentities`) with
    observed-family keys; identity evidence never confirms a merge. Governance confirms explicitly.
19. **Ambiguity** — `observedFamilyKey` is deliberately non-unique; the only guarded unique key is the nullable
    `confirmedIdentityKey` (partial index, governance-confirmed only). Competing candidates stay separate.
20. **Revision** — append-only `DocumentRevisionMembership` + versioned `ActiveRevisionDecision`
    (`UNDECIDED | ACTIVE_REVISION_SELECTED | BLOCKED_INCOMPATIBLE_ACTIVES`); superseded documents stay queryable;
    addenda never mutate base evidence.
21. **Relations** — `REVISION_OF | SUPERSEDES | ADDENDUM_TO | REFERENCES | SAME_FAMILY` with relational evidence-claim
    join rows; `DERIVED_FROM` is refused by `buildDocumentRelation` because 2A-9 owns lineage.
22. **Active revision** — the engine may only *identify candidates*; only an audited human command selects. Incompatible
    actives block comparison readiness (`BLOCKED_INCOMPATIBLE_ACTIVES`); the engine never compares both as current.
23. **Relational integrity** — core memberships are join tables/FKs (`DocumentIdentityEvidenceClaim`,
    `DocumentRelationEvidenceClaim`, `ActiveRevisionDecisionSelection`, `ActiveRevisionDecisionEvidenceClaim`,
    `SubjectClusterMember`), not `String[]`. `companyId` on every durable row; all reads/writes company-scoped;
    cross-tenant participant writes fail closed.
24. **Scope** — `ComparisonScope` + `ComparisonScopeArtifact` with per-artifact declared role, revision policy
    (default `ACTIVE_ONLY`), predicate/role filters, and centralized engine bounds.
25. **Roles** — document roles organize the review only: `severityForFindingKind(kind)` takes the kind alone, so no role
    can select a winner, suppress a source, or change severity. A role-reorder test proves fingerprint, kind, severity,
    and English statement are byte-identical under swapped roles.
26. **Matching** — deterministic tiers T0→T5 with only T0–T3 comparable; `SAME_SUBJECT` is required to compare; prefix
    heuristics are refused (`isPrefixOnlyKey`, so SD-1 ≠ SD-12); strong-identifier conflict vetoes a weak match
    (`VETO_NAMESPACES` = GLOBAL_ID/EQUIPMENT_TAG/MANUFACTURER_MODEL); layer/system/location alone only corroborates;
    ambiguity blocks value comparison; every durable match stores its explanation (tier, keys, corroborators,
    blockers, reasons, matcher/explanation versions).
27. **Cluster durability** — `SubjectCluster` ids are deterministic over (company, scope, namespace, matchKey), so a
    cluster survives re-runs; members are relational rows.
28. **Lineage collapse** — one family = one voice; no self-comparison inside a family; warnings (channel A) and fidelity
    limitations (channel B) are kept separate and never merged.
29. **Quantity comparison** — comparison may state only that the sources state different values; no correct/winner/
    approved/delta/average/highest/lowest/majority/preferred source, and no arithmetic result is stored. Quantity
    origins are exactly `STATED` and `DECLARED_MODEL`.
30. **Numeric policy** — `valueNumber` is persisted only where the source model itself supplied it (XLSX
    `BoqLineCandidate.quantityNumber`, IFC `IfcQuantityEvidence.value`, with `valueNumberOrigin = SOURCE_SUPPLIED`);
    a PDF/OCR literal "24" stays a string and never lowers source reliability. Proven by
    `MaterializationPolicy.test.ts`. Formulas are never evaluated; rate/amount/currency never produce findings.
31. **Finding identity vs evidence signature** — `buildFindingFingerprint` (`voka:2a-10:finding:v1`) covers company,
    scope, kind, predicate, cluster, participant family keys and subject keys — never the current values; values live
    in `buildEvidenceSignature` (`voka:2a-10:signature:v1`) plus `engineFlags.evidenceChanged`. Proven: changing 26→28
    keeps the same finding id and adds no duplicate.
32. **Participants** — written as the finding's CURRENT evidence projection (set, not appended), so a two-source
    disagreement never renders as three sides; historical claims stay queryable by id. Prior behavior (append) was
    replaced during this pass and the change is documented in both stores.
33. **Staleness / idempotency** — re-running over identical evidence is idempotent (`newFindingCount 0`,
    `reproducedFindingCount 1`); a non-reproduced finding is flagged stale and **never deleted**, with a truthful
    reason by precedence `SCOPE_CHANGED > ARTIFACT_BYTES_CHANGED > CLAIMS_SUPERSEDED > ENGINE_VERSION_CHANGED >
    NOT_REPRODUCED` (claims are compared by immutable hash and artifact state, so "the bytes changed" and "the value
    moved" stay distinguishable).
34. **Review lifecycle** — engine may change engine flags only; it can never move the human state. States
    `OPEN | ACKNOWLEDGED | NEEDS_INFORMATION | RESOLVED | DISMISSED`, with `RESOLVED/DISMISSED → OPEN` the only
    reopen, always explicit, reasoned, and appended as a `REVIEW_EVENT` before the state update.
35. **Resolution is not approval** — the review response carries `recordsApprovedQuantity: false`,
    `recordsWinningSide: false`, `recordsCorrectValue: false`, `mutatesEngineeringOrCommercialData: false`; no
    approved quantity, winner, or downstream object exists.
36. **EN/AR** — exhaustive `Record<Token, {en, ar}>` tables for every mandated enum (finding kinds, predicates, roles,
    identity kinds, relations, readiness, active-revision statuses, review states, match classes/tiers, quantity
    origins, unit dimensions, stale reasons, revision contexts, reading channels, coverage, lineage roles, subject
    namespaces, severities) with bilingual fallbacks and no raw enum leakage. Arabic limitation fallback is
    exact map → pattern map → generic Arabic. Source literals, units, and locators are never translated. The engine
    test reads one finding in both locales: different text, Arabic script present, no winner language in either.
37. **Performance / bounds** — all bounds live in `CROSS_DOCUMENT_BOUNDS` in `ComparisonPolicy.ts` (400 claims/artifact,
    20,000/scope, 6,000 matches, 2,000 findings, candidate-pair and participant caps, `maxLocatorCharacters`);
    candidate pairs come from (bucket, namespace, matchKey) index maps — never all-to-all N²; every truncation is
    recorded as a limitation. A governance test fails the build on 4+ digit inline constants in the engine files or a
    bound declared outside the policy.
38. **Handoff** — `CrossDocumentHandoff` exposes exactly what 2A-11 needs: claims (incl. `STATED_QUANTITY` slices with
    origin and source numeric view), matches, clusters, findings, coverage, revision decisions, lineage, staleness,
    block reasons, citations, and an explicit `notExposed` list — and nothing downstream.
39. **Security** — no shell, no native converter, no remote fetch, no embeddings/LLM, no path traversal via
    `storageRef`; DXF XREFs and IFC external references are never followed; hidden PDF text never becomes comparison
    evidence; page numbers are never invented.
40. **Read contract** — `readSurface` + `ReadModels` are stable and typed for 2A-11; findings/claims/lineage/handoff
    reads are company-scoped and bounded.
41. **API surface** — 11 routes under `app/api/cross-document/**` (scopes create/list, scope detail + revision-policy
    patch, run, findings, claims, lineage, handoff, finding detail, finding review, document detail, active-revision
    read/write). Write roles OWNER/ADMIN/SALES; reads also allow VIEWER; responses are `no-store`.
42. **New tests** — 3 files / 17 tests, all passing: `ComparisonEngine.test.ts` (6),
    `MaterializationPolicy.test.ts` (5), `ImportGovernance.test.ts` (6).
43. **Focused tests** — import governance scans 30+ real files and proves no promotion-lane import (Requirement, BOM,
    QuotationLine, ProductSelection, Supplier, ProcurementRequirement, RFQ, Offer, Award, PO, takeoff, legacy
    `BoqCandidateParser`), no un-negated approval/winner token, no RATE/AMOUNT/CURRENCY finding family, no inline
    numeric bounds; materialization proves the PDF-literal rule, native-vs-OCR separation, DXF-never-a-quantity, IFC
    declared-model-only, and unreadable-artifact honesty; the engine test proves no-resolution, idempotency,
    identity-stability, no-deletion, role-independence, determinism, and EN/AR statements.
44. **TypeScript** — final `npx tsc --noEmit` = **169** errors, exactly the baseline count, **delta 0**; no new error in
    any 2A-10 file.
45. **Full Vitest** — final run: **15 failed / 388 passed / 9 skipped files** and **4 failed / 2907 passed / 51 skipped
    tests**. Baseline was 15 / 385 / 9 and 4 / 2890 / 51: failures unchanged, +3 passing files and +17 passing tests,
    all 4 remaining test failures are the pre-existing missing-`lib/generated/prisma/client` environment failures.
46. **`git diff --check`** — clean (no whitespace errors introduced).
47. **Risks / pending (truthful)** — (a) `prisma validate|generate|migrate diff` cannot run offline, so schema proof is
    migration replay + typecheck; (b) `PrismaCrossDocumentStore` runtime was not exercised against a live Postgres and
    its relation-name mapping is only type-checked; (c) the `HASH_MISMATCH` hard-stop branch and the IFC
    `PARTIAL ⇒ EVIDENCE_COVERAGE_INCOMPLETE` path are implemented but not yet covered by a focused test;
    (d) participant-set semantics were changed from append to current-projection in this pass (documented, tested);
    (e) no full Engineering Workspace UI was built (out of scope by mandate).
48. **2A-11 not started** — nothing from 2A-11 exists: no takeoff, no quantities, no BOM, no products, no quotation,
    procurement, RFQ, award, or PO object, and no downstream consumer was written.
49. **STOP condition honored** — no commit, no push, no PR, no branch switch; work left in the working tree at HEAD
    `d856219508d23413540d3e445d99e24f78b2fa7a`.
50. **READY FOR FINAL CHECKPOINT COMMIT: YES** — implementation and validation are complete at zero TS delta with all
    17 new tests green, migration chain 58/58 and constraints OK under PGlite, and `git diff --check` clean. The four
    pending items in (47) are disclosed for CTO acceptance rather than silently claimed.
