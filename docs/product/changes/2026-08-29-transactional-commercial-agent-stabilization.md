# Transactional Commercial Agent Stabilization

Status: architecture lock implemented on `feature/pre-staging-product-coherence`

## Permanent invariant

**Agent proposes. Transactional state commits. Deterministic services execute. Draft renders committed state. Human approves.**

Future slices must extend this architecture. They must not introduce a parallel canonical commercial state or direct Agent-to-Draft mutation without a new reviewed architecture decision.

## Two planes

The intelligence/control plane may understand, research, identify missing facts and return a typed `TurnDecision` containing minimal field patches, unresolved facts, research requests, a proposed next question and a readiness proposal. This output has no document-write or approval authority.

The transactional execution plane owns the request-scoped fact ledger, field ownership, precedence, value validation, stale-turn and request checks, deterministic system rules, customer/catalog resolution, Commercial BOM, Terms projection, readiness and Draft handoff. `commitTurnDecision` is a pure reducer: it validates all proposed mutations, commits accepted facts together and records safe accepted/rejected diagnostics without exposing model reasoning.

## Fact ledger and precedence

Each committed fact records value, source, turn identity, confidence and timestamp. Authority is ordered as:

`USER_CORRECTION > USER_EXPLICIT > VERIFIED_DOCUMENT > VERIFIED_DATABASE > TRUSTED_PROFILE > DETERMINISTIC_DERIVATION > RESEARCHED > AI_INFERRED > DEFAULT`.

A lower-authority patch cannot replace a higher-authority fact. Unsupported fields and operations, invalid values, stale turns and cross-request mutations are rejected. A new request creates a new request identity and an empty ledger; continuation is explicit through the existing working draft.

The current ledger covers the commercially sensitive scalar boundary: customer mention, project, attention, validity, structured payment, rendered payment value, delivery, warranty, currency and scope. Existing deterministic DTOs remain canonical for engineering inputs, resolved customer/catalog identities, Commercial BOM and pricing.

## Structured payment and Terms

Explicit numeric payment schedules are parsed into milestones containing percentage and normalized timing. Complete schedules must total exactly 100%. An incomplete schedule remains under review; VOKA never invents the remaining milestone. Arabic numeric wording such as `مية في المية` and `خمسين في المية` is normalized before deterministic parsing.

Explicit user payment becomes `USER_EXPLICIT`; a later explicit correction becomes `USER_CORRECTION`. Defaults apply only when explicit payment is absent. Arabic/English payment wording and Terms are projections from the committed schedule. Generated or company Terms are never parsed back into the ledger and cannot overwrite committed payment.

## System working plan and materialization gate

Known System Profiles and researched `ProvisionalSystemModel` state are preserved. The conversation projects them into a `systemWorkingPlan` containing identity, known and missing inputs, component requirements, verification requirement and commercialization status.

System understanding is not Draft readiness. A provisional system with all conversational inputs but no truthful commercial lines remains `SYSTEM_PLANNED`, requires human review and is blocked from `READY_FOR_DRAFT`. A system reaches materialized state only through meaningful commercial lines produced by the existing deterministic Commercial BOM/catalog-first path or a future explicitly governed lump-sum representation. Unknown customers, missing catalog matches, SKUs and prices retain their existing non-blocking review behavior once meaningful commercial scope exists.

## Readiness and diagnostics

Request state distinguishes `CONVERSATION_UNDERSTOOD`, `NEEDS_INFORMATION`, `SYSTEM_PLANNED`, `COMMERCIAL_MATERIALIZED`, `READY_FOR_DRAFT` and `READY_FOR_APPROVAL`. Existing UI status remains compatible while the finer readiness stage prevents empty Draft handoff.

Test/debug state exposes proposed patches, accepted patches, rejection reasons, the resulting ledger and readiness transition. It contains no private chain-of-thought.

## Golden scenarios

The permanent local CEO dataset begins with 13 scenarios: canonical CCTV, unknown customer, project/attention separation, gypsum, FM-200, vehicle-elevator continuity, 50/50 payment, 40/60 correction, Arabic 100%, English equivalence, new-request isolation, empty-Draft blocking and Terms no-writeback. Every newly discovered manual regression must be added to this dataset.

No schema migration, new system profile, new orchestration framework, deployment or approval automation is part of this stabilization.
