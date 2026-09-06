# Release War Room — Phase 1 local review handoff

Date: 2026-09-06. Owner-authorized stabilization only; no release or session closure.

## 1. Executive result

This section records the initial Phase 1 validation. The bounded CTO review
corrections and their subsequent validation are recorded in section 13.

The reported commercial failures were reproduced: 22 failures and 34 passes in
four files. After correction, the eight targeted files passed all 72 tests.
One additional provenance regression was then added. Full Vitest passed:
288 files, 2061 tests, zero failures; 7 files / 49 tests remain skipped.
TypeScript passed. Production build and final checks are recorded below.
At the time of initial validation, no commit, push, merge, tag, branch deletion,
schema/dependency/environment change, or database operation had been performed.

## 2. Baseline and root causes

Initial worktree was clean on
`feature/pre-staging-product-coherence-2978252134715781250`, HEAD `338a168`.
`git fetch origin --prune` succeeded after filesystem permission escalation.
Integration ref remains `50c0758`. Diff against that ref is empty for the five
requested Sales Assistant, commercial conversation, conversation runtime,
smart-system domain and AI infrastructure paths. These failures predate UCL work.
PR #83 was not modified or merged; live PR mergeability was not rechecked.

Commit `a9fc82a` changed the CCTV engine from a TB component to
`SURVEILLANCE_HDD` with provisional drive packaging. The usable capacity remains
in `specification.requiredUsableTb`. Commit `62337fb` subsequently added governed
drive-capacity/recorder constraints. Neither updated the Sales Assistant's
`commercializeSystemComponent` / `commercial-catalog` capacity-key contract.
The new HDD key bypassed the provisional package and bounded HDD catalog policy.
`AISalesAssistantResolver` also exposed the packaged engine rows as requirements,
so callers looking for capacity facts received undefined.

The four import-blocked suites already inject repositories or database doubles.
Their imports nevertheless load `lib/prisma.ts`, which correctly rejects missing
`DATABASE_URL` at module evaluation. Vitest setup contains jest-dom setup only;
loading real `.env` credentials is not the correct unit-test isolation strategy.
Existing neighboring repository tests explicitly mock `@/lib/prisma`.

## 3. Behavior reconciliation

| Behavior | Before / failing expectation | Rule and evidence | Classification / action |
| --- | --- | --- | --- |
| Storage engineering requirement | Missing capacity key; tests expect 337 TB for 130 cameras | Engine still computes ceil(130 × 8 × 86400 × 30 / 8 / 1e6) = 337; current owner requires engineering facts separate from sale units | A: project capacity at the application boundary |
| Storage commercial package | Generic engine HDD row escaped; tests expect one pending Package | Existing commercialization policy and current owner rule prohibit fabricated drives | A: restore capacity-key routing, null price and review |
| Tenant HDD identity / Arabic capacity | HDD18 and AR18 undefined | Existing commercial-catalog policy validates units and parses Arabic digits | A: reconnect policy; preserve 26 disks for 467 TB / 18 TB |
| Ranked alternatives / explicit selection | No capacity candidates | Existing resolver ranks waste and revalidates selected IDs | A: restore routing; unchanged resolver safety |
| Ambiguity / capped search | Safe unresolved row undefined | Search batches of 51 cannot prove uniqueness | A: restore provisional row, preserve truncation ambiguity |
| Cross-tenant / inactive / stale / fabricated choices | Safe unresolved row undefined | Existing company/activity and current-candidate checks | A: restore policy; no loosening |
| Unknown prices | Expected pending null price row undefined | Current owner rule and pricing path keep subtotal/price unknown | A: restore policy; no zero fallback |
| Reanalysis / field completion | Older storage-key tests cannot find row | Existing completion path regenerates canonical proposal; 337 TB remains valid | A: restore capacity projection; original tests pass unchanged |
| NVR quantity | Quantity remains 3 for 180 cameras | Engine now considers channels, bandwidth and storage bays | Preserve new engine sizing |
| NVR formulaExplanation | Test expects literal `64 channels`; new explanation describes maximum constraints | `a9fc82a` intentionally added recorder constraints; specification still has channelsPerRecorder=64 | B: assert structured channel fact plus current maximum-constraint explanation |
| PoE quantity | No underlying regression | Existing reserved uplink policy, 4 switches for 180 cameras | Preserve; existing tests pass |
| Provenance | Older assertion requires engine key equal to sales key | Raw engine source is now HDD packaging; current owner requires source preservation | B: expect raw HDD key for storage while preserving complete source object |
| Four Prisma import failures | Missing DATABASE_URL before assertions | All four suites inject doubles; adjacent tests mock runtime Prisma module | C: add explicit suite-local module mocks |

This reconciles all 22 original failing cases (14 CommercialBom, 1 CommercialBrain,
4 CommercializationBoundary, 3 FieldCompletion) and all four import-blocked suites.
No failing case was deferred as technical debt.

## 4. Production files changed

- `src/application/ai-sales-assistant/services/commercialize-system-component.ts`:
  shared capacity projection for the current HDD component; original engine
  component remains in `commercialRequirement.source.requirement` unchanged.
- `src/application/ai-sales-assistant/services/AISalesAssistantResolver.ts`:
  expose the same capacity projection in CCTV proposal requirements.

Engine/domain calculations, conversation-runtime governed state, catalog matching,
selection checks, price resolution and UCL implementation were not altered.

## 5. Test-environment files changed

Each adds an explicit runtime Prisma module mock, with existing injected doubles
still executing the assertions. No global database mock or fake URL was added.

- `src/__tests__/Phase64BBlockerFixes.test.ts`
- `src/application/localization/services/__tests__/resolveQuotationGenericLocale.test.ts`
- `src/infrastructure/translation/quotation/__tests__/MultilingualQuotationPersistenceProof.test.ts`
- `src/infrastructure/persistence/prisma/localization/__tests__/PrismaLocalizedContentRepository.test.ts`

Production `lib/prisma.ts` retains its fail-fast missing-URL guard. Environment
files were neither printed nor modified. The full run emitted no missing-URL or
generic-localization-invalidation errors.

## 6. Tests updated and why

- `CommercialBom.test.ts`: storage source identity now expects the real HDD engine
  key; commercial category remains the capacity key. All catalog, pricing, unit,
  ambiguity, tenancy and selection expectations remain intact.
- `CommercialBrain.test.ts`: replace obsolete explanation substring with the
  structured 64-channel assertion and current maximum-constraint explanation.
- `CommercializationBoundary.test.ts`: add one regression proving a 19-drive
  engine estimate for 337 TB becomes one pending commercial package, preserving
  the complete source and leaving the input component untouched.
- `FieldCompletion.test.ts`: unchanged, including the 337 TB expectation.

## 7. Intentionally preserved behavior and authority conflicts

Unknown price stays null. Catalog identity/code/unit and known price survive
matching. Ambiguity and capped searches stay unresolved. Invalid catalog choices
cannot bind. Required capacity and engine provenance remain internal. Explicit
selection remains governed. Existing reanalysis and field-completion assertions
pass. UCL stays frozen.

The current owner request explicitly re-enables Codex for this bounded task,
overriding the reserve-only instruction. The current owner rule permitting Drafts
without customer/attention supersedes the older customer-required statement in
the September 2 focused-correction document. No Draft-readiness code was changed
because this failure cluster did not require it. Historical context-pack branch
and uncommitted-state descriptions are superseded by the verified baseline above.

## 8. Validation

- Initial four-file reproduction: 22 failed / 34 passed.
- Corrected eight-file run: 72 passed / zero failed.
- `npx tsc --noEmit`: PASS, exit 0.
- `npx vitest run`: PASS, exit 0; 288 passed / 7 skipped files,
  2061 passed / 49 skipped tests, 2110 total; 119.35 seconds.
  The reported earlier 2093 total omitted 16 assertions in import-blocked suites;
  restoring those and adding one regression explains the new total.
- `npm run build`: PASS, exit 0; compilation, type/lint checks, page generation,
  optimization and trace collection completed.
- Scoped ESLint (all nine modified TypeScript files): PASS, exit 0, no warnings.
- `git diff --check`: PASS, exit 0.

The seven existing skipped files are six legacy Sales Assistant page suites
(`page`, `proposed-customer`, `locale-composition`, `field-completion`,
`attachment-entry`, `conversation-flow`) and the PostgreSQL customer-code
allocator persistence suite gated by `VOKA_RUN_DB_TESTS=1`. No skip was added or
removed. Real database concurrency was not exercised.

## 9. Remaining release blockers

No remaining failure in the requested automated cluster. Passing this gate does
not establish live provider, persisted database, manual product acceptance or
deployment readiness. The existing skipped coverage remains outside this proof.

## 10. Warnings / technical debt

- Vite warns that CommonJS-loaded `vitest.config.ts` uses ESM syntax unsupported
  by the future native config-loader default.
- Existing UCL population-run route test nests `vi.unmock("process.env")`; Vitest
  warns that it is hoisted and this placement will become a future error.
- Git warns about configured LF-to-CRLF conversion in modified text files.
- Existing application localization code imports concrete Prisma infrastructure;
  unit isolation is fixed locally without a broad dependency refactor.
- Build retained 12 existing warnings: 11 React hook dependency/ref warnings in
  contract, product, quotation, signatory pages and recorded-voice infrastructure;
  one missing `aria-controls`/`aria-expanded` combobox accessibility warning.
  These files were not modified and warnings were not suppressed.

## 11. Git review state

At the time of validation, HEAD and branch were unchanged, and all edits were
unstaged and uncommitted. Nine
TypeScript files above plus this handoff and its context-pack navigation link are
the intended review scope. Validation logs are local ignored `.voka-release-*.log`
artifacts, not proposed source changes. Exact final `git status --short --branch`:

```text
## feature/pre-staging-product-coherence-2978252134715781250...origin/feature/pre-staging-product-coherence-2978252134715781250
 M docs/context/08_RESUME_POINT.md
 M src/__tests__/Phase64BBlockerFixes.test.ts
 M src/application/ai-sales-assistant/__tests__/CommercialBom.test.ts
 M src/application/ai-sales-assistant/__tests__/CommercialBrain.test.ts
 M src/application/ai-sales-assistant/__tests__/CommercializationBoundary.test.ts
 M src/application/ai-sales-assistant/services/AISalesAssistantResolver.ts
 M src/application/ai-sales-assistant/services/commercialize-system-component.ts
 M src/application/localization/services/__tests__/resolveQuotationGenericLocale.test.ts
 M src/infrastructure/persistence/prisma/localization/__tests__/PrismaLocalizedContentRepository.test.ts
 M src/infrastructure/translation/quotation/__tests__/MultilingualQuotationPersistenceProof.test.ts
?? docs/product/changes/2026-09-06-release-war-room-phase-1.md
```

## 12. Recommended commit breakdown (not executed)

1. `fix(ai): restore capacity-based storage commercialization` — two application
   files and three commercial test files.
2. `test: isolate injected persistence suites from runtime Prisma` — four test files.
3. `docs: record release phase one validation` — this report and resume link.

The CTO subsequently approved Phase 1 functionally, subject to bounded capacity
hardening, documentation corrections and revalidation. No commit/push/merge was
authorized by that review.

## 13. Bounded CTO final corrections

At CTO review, `salesEngineeringRequirement` was hardened to accept only a
finite, positive number in `requiredUsableTb`. Missing, null, textual, zero,
negative and non-finite values return the original component by identity.
No coercion, fallback capacity or input mutation is performed. Proven capacity
retains its source/specification/provenance semantics. The projected explanation
uses only available finite positive governed values; it does not append optional
raw prose or interpolate missing values. The original engine explanation remains
available in the untouched commercial source component.

Exactly four files were edited during this correction round:

- `src/application/ai-sales-assistant/services/commercialize-system-component.ts`
- `src/application/ai-sales-assistant/__tests__/CommercializationBoundary.test.ts`
- `docs/product/changes/2026-09-06-release-war-room-phase-1.md`
- `docs/context/08_RESUME_POINT.md`

Twenty new focused test cases cover proven 337 TB projection and source identity;
missing specification/capacity; undefined, null, invalid/numeric strings, NaN,
positive/negative infinity, zero, negative and boolean capacities; and seven
absent/invalid optional-context cases. They assert unchanged input objects,
no fabricated capacity and no undefined/null/NaN tokens in generated explanation.
Existing 337 TB and provisional commercial package assertions were preserved.

The documentation was decoded strictly and saved as UTF-8 without a BOM. No
mojibake or replacement-character markers were found in the checked source text.
The resume point now describes validation historically against baseline `338a168`,
and older local-WIP wording is explicitly anchored to its historical checkpoint.
No future commit hash or publication state is asserted.

Final correction validation:

- Three requested commercial suites: PASS, 61 tests / 3 files, exit 0.
- `npx tsc --noEmit`: PASS, exit 0.
- `npx vitest run`: PASS, exit 0; 288 passed / 7 skipped files,
  2081 passed / 49 skipped tests, zero failures, 2130 total; 98.27 seconds.
- `npm run build`: PASS, exit 0, including 69/69 static pages generated.
  The same 12 pre-existing hook/accessibility warnings were retained.
- `git diff --check`: PASS, exit 0. Configured LF-to-CRLF notices remained.

At this correction checkpoint, no commit, push or merge had occurred. The exact
worktree file list in section 11 includes preserved changes from initial Phase 1;
this correction round did not edit the other seven files in that list.
