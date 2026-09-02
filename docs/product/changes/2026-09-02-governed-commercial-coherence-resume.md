# Governed Commercial Coherence — checkpoint completion

Date: 2026-09-02. Status: implemented locally for CTO review; not live-accepted.

This resumes the owner's approved correction, not a new conversational architecture or roadmap station.
The governing invariant remains: conversation truth → Strict governed truth → engineering truth → Workspace Sales BOM → Quotation Items.

## Verified starting point

- Branch: `feature/pre-staging-product-coherence`.
- HEAD: `a9fc82aa7869b0094b980f523e437df7983b8add`.
- Working tree was clean. The local origin-tracking ref matched HEAD; no network fetch or remote verification was performed.
- The checkpoint already contained shared commercial projection, separate selection/engineering/pricing dimensions, packaging/rule snapshots, quotation metadata mapping, and provisional cabinet/accessory/service semantics.
- Four TypeScript errors and the unfinished 340-camera regression were reproduced. No Prisma generated-client or exceljs blocker was found in the current typecheck.

## Completed corrections

- Structural replacement lineage survives product-provenance changes. Reconciliation retains explicit child lines while refreshing generated recorder/storage rows; inconsistent split totals require review.
- The selection reducer handles named approval and evidence-backed semantic approval/rejection patches. Candidate-card approval IDs are derived from selection facts, not independently patched or accumulated forever.
- Exact model matching takes precedence over an ambiguous shared brand. Replacing a selection removes stale capability/price/evidence fields; reapproving the same NVR retains user-corrected capabilities.
- Structural lines retain their generic identity for rejection/reselection. The existing shared commercial projector now compiles and preserves material names/specifications throughout handoff.
- HDD capacity feeds the existing CCTV calculator. Incompatible storage selections cannot silently increase the confirmed recorder architecture. Later fact changes replace calculations and mark incompatible engineering as conflict, independently of product selection and price.
- Explicit recorder count and bays are accepted through the existing fact reducer and provider proposal contract. The API model and conversational/research architecture are unchanged.
- Approval claims are rendered against actual governed selections. Research price evidence remains distinct from selling price. AI BOM proposals cannot inject approved-product or price metadata.
- Retention-change shortcuts are not offered as CCTV suggestion chips. The runtime regression explicitly records authority research as unavailable and preserves the fallback snapshot; no Kuwait retention regulation is asserted.

## Persistence-message root cause

Git history identifies the exact old message in `prepare-handoff`: a non-QUOTATION `document.target` produced `NOT_YET_CONNECTED` with “persistence is not connected to the clean conversation runtime yet.” The resumed checkpoint had already renamed that error to `DOCUMENT_TARGET_UNAVAILABLE`.

Quotation persistence is wired through the signed handoff route, `CreateQuotationFromCommercialHandoff`, `PrismaCommercialHandoffQuotationPort`, and canonical `CreateQuotationUseCase`. No database execution was performed in this task. Other document targets remain unsupported by this particular handoff. Their Draft readiness is now false, including hydrated UI sessions. Failed handoffs show localized guidance/retry text instead of raw server implementation messages.

## Exact offline acceptance fixture

Actual ConversationRuntime/Strict Brain execution with mocked provider/tool boundaries proves:

- Kuwait, supply and installation, customer and attention; 340 4MP IP cameras remain 170 Bullet + 170 Dome across continuation and approval turns.
- Independent Hikvision camera selections retain model, subtype, quantity and market evidence without confirmed selling prices.
- DS-9664NI-I16 remains selected; explicit correction to 16 bays and six recorders yields 96 bays. A previous eight-bay calculation is replaced.
- The fallback snapshot is 30 days, 8 Mbps, zero reserve: 882 TB and 49 generic 18TB drives.
- WD Purple 8TB would need 111 drives and is rejected against 96 bays. It remains an alternative, not approved current architecture.
- A compatible 16TB selection recalculates to 56 disks. A later 60-day user correction produces 98 generic 18TB disks and an explicit bay conflict, not stale 49-disk truth.
- Cabinet remains one provisional allowance; accessories are generic estimated, without an invented catalog SKU; installation service does not resell hardware supply.
- The same runtime state passes through the actual handoff handler (mocked signature boundaries), quotation DTO, domain lines, persistence mapping and API serialization with material fields intact.

## Verification and limits

Final local results: **389 tests passed across 52 files**; repository-wide `tsc --noEmit --pretty false` passed; ESLint passed for every changed/new TypeScript file; `git diff --check` passed. HEAD and the local origin-tracking ref remain unchanged at the starting SHA. The worktree is deliberately dirty for CTO review.

Offline tests cover the exact scenario, runtime/selection, engineering, Workspace, handoff/idempotency, signatures, serialization/mapping, tenant isolation, and quotation editor refresh behavior. Repository-wide TypeScript and scoped ESLint are also run. A date-sensitive pre-existing quotation expiry fixture now uses a fixed issue date; the domain's expiry validation is unchanged. The old UI assertion expecting raw server error text is replaced with localized-error plus retry assertions, including Arabic. The approval test now attempts an unsupported provider approval rather than depending on a contradictory AI-only rejection of an explicit user approval.

No paid provider/web calls, database writes, schema/dependency changes, migrations, destructive commands, Git reset/restore/checkout/switch, commit, push, merge or deployment were performed. Live OpenAI interpretation, actual quotation database persistence, proposed customer/terms/notes/refresh acceptance, and live Kuwait authority evidence remain **not verified**. Build and the repository-wide full test suite are outside this task's requested scoped validation.

## Changed-file map

- Runtime/projection: `ConversationRuntime.ts`, `StrictBrain.ts`, `governed-workspace.ts`, `product-selection.ts`, `solution-graph.ts`, `commercial-projection.ts`, `fact-reducer.ts`, `types.ts` under `src/application/conversation-runtime/`.
- Capabilities/calculation: `src/application/agentic-commercial-intelligence/types.ts`, `src/domain/smart-system/CctvSystemTemplate.ts`.
- Provider wiring/messages: `src/infrastructure/ai/openai/OpenAIConversationBrain.ts`, `src/infrastructure/ai/ConversationToolRegistry.ts`.
- UI: `app/dashboard/sales-assistant/page.tsx`, `components/sales-assistant/SolutionWorkspace.tsx`.
- Tests: runtime `GovernedCommercial340.test.ts`, `fixtures/cctv340.ts`, `GovernedFlexibleStrictBrain.test.ts`; handoff `prepare-handoff/__tests__/route.test.ts`; Sales Assistant `clean-runtime-page.test.tsx`; `ConversationPresentation.test.tsx`; `EngineeringQuantityDetails.test.tsx`; quotation `QuotationStateTransitions.test.ts`.
- Documentation: this record. No roadmap station was reordered.
