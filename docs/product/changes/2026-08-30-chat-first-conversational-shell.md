# Chat-First Conversational Shell

**Status:** Approved product change implemented on `feature/pre-staging-product-coherence`

**Date:** 2026-08-30
**Decision owner:** CEO / project owner

## Product invariant

> **Conversation is the interface. Transactional commercial state is the hidden authority.**

VOKA's Sales Assistant presents one persistent Arabic/English conversation for text and voice. Users may provide information in any useful order, ask questions, correct earlier facts, defer a commercial choice, request a recommendation, attach evidence later, or continue with expressions such as `كمل` and `مش عارف`. Missing commercial fields and deterministic readiness remain visible in the live result, but they do not control or replace the conversation.

The permanent flow is:

`Natural conversation → conversational intelligence → typed proposals/fact patches → transactional reducer → canonical state → governed research/deterministic engineering/catalog/commercial tools → grounded assistant response → live structured projection`

The authority invariant remains:

`AGENT PROPOSES → REDUCER COMMITS → TOOLS EXECUTE → DRAFT RENDERS → HUMAN APPROVES`

The assistant never mutates Draft state directly. It receives the committed projection and may choose natural wording, but it cannot create facts, prices, quantities, customer identities, compliance claims, approvals, or engineering certainty.

## Conversation and memory

- User and assistant turns are retained together in the request-scoped working draft.
- Intelligence receives the accumulated relevant user context, current turn, committed facts, retained system model, evidence, corrections, document intent and selected entities.
- Assistant turns are display/history context and never increment the transactional fact-ledger turn counter.
- Free text is interpreted as a complete conversational turn. It is not silently assigned to the currently displayed field.
- Explicit clarification controls and explicitly selected summary fields may submit targeted answers.
- Natural corrections recompute the validated proposal and use the existing fact precedence. `USER_CORRECTION` remains stronger than all other sources.

## Governed tool progression

Each turn is bounded to at most four internal stages in this slice:

1. semantically decide the conversational behavior from history, committed facts and current context;
2. create a validated canonical proposal;
3. reuse or invoke governed research and run available deterministic system/catalog/commercial logic;
4. phrase a grounded response from committed truth and project the live result.

Known verified systems such as CCTV use their versioned deterministic profile and do not invoke public research. Unknown systems may use `CommercialSystemResearchPort`; retained research and evidence are reused across ordinary continuation turns. A material system correction may invalidate the retained provisional model. Research remains evidence, never customer-specific truth or approval authority.

## Safety boundaries

- FM-200 agent quantity and cylinder sizing are never inferred from the product name or public research. Protected volume/dimensions or trusted drawing evidence remain necessary for sizing.
- Vehicle Elevator SUV intent is retained as an explicit vehicle-class fact without inventing a rated load.
- Public evidence cannot approve compliance, exact proprietary BOMs, products, prices, quantities or documents.
- Response generation is downstream of the reducer. Unsupported numeric/price claims and internal workflow terminology fall back to a deterministic grounded response.
- Draft readiness and approval readiness remain deterministic and separate from the ability to continue chatting.
- Tenant isolation, repositories, schemas, migrations and the transactional commercial brain are unchanged by this slice.

## User interface

The Sales Assistant hierarchy is now:

1. persistent conversation timeline;
2. shared text/voice composer and attachment entry;
3. contextual clarification or evidence actions when useful;
4. live structured result projected from canonical state.

The result distinguishes `CONFIRMED`, `PROVISIONAL`, `DEFERRED`, `NEEDS_CONFIRMATION`, `PRICE_REQUIRED` and `VERIFIED`. Pending values use neutral presentation; the former giant red required-fields loop is removed.

## Regression contract

The dedicated Chat-First CEO Golden Scenario suite contains 25 cases covering conversational continuation, correction, contextual recommendations, research invocation/reuse, Vehicle Elevator, FM-200, CCTV, customer/payment/defer behavior, voice/text parity, response grounding, precedence, structured projection and deterministic readiness. Existing golden, transactional, research, payment and UI suites remain authoritative regressions.

## Known bounded limitations

- Attachments share the conversation and are retained as evidence metadata; full drawing/PDF semantic extraction remains owned by the approved Drawing Intelligence boundary.
- Unknown engineered systems can reach a truthful provisional configuration, but commercial lines are not fabricated when no deterministic rule/catalog representation exists.
- Provider response generation falls back safely when unavailable or when grounding checks fail.
- Live internet source availability and quality remain provider/configuration concerns and require deployment acceptance; automated tests use mocks.

## Execution-plan position

This accepted change strengthens the Intelligence Layer and Sales Assistant acceptance inside the existing Workstream 3/4/6 boundaries. It does not add, remove or reorder any V1 workstream.
