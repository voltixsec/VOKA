# Universal Commercial Intelligence Entry

Date: 2026-08-27
Status: Implemented on `feature/pre-staging-product-coherence`

## Authoritative flow

VOKA's universal entry uses one intelligence path:

`Voice / Text / Attachment` → `Document + Build context` → `AISalesAssistantService` → `AISalesAssistantExtractor` → `SmartSystemBuilderService` → `AISalesAssistantResolver` → `canonical resolved draft` → `ConversationalDraftEngine requirements` → `existing form` → `human review`.

The resolved Sales Assistant proposal is canonical for customer, catalog, unit, pricing, Smart System, provenance, and commercial-line state. The conversational engine does not replace or downgrade those results. It stores the canonical proposal, manages conversation turns and attachments, evaluates only remaining core inputs, and always returns `requiresHumanReview: true` and `executed: false`.

Every follow-up reply re-runs the accumulated context through the same intelligence path before missing fields are recalculated. Smart System missing inputs are required; optional commercial fields remain recommendations and do not block review.

## Selectors

- Document: `AUTO`, `QUOTATION`, `INVOICE`, `CONTRACT`, `SALES_ORDER`.
- Build: `AUTO`, `CATALOG_ONLY`, `SUPPLY_INSTALL_SYSTEM`, `DRAWING`.

`CATALOG_ONLY` disables Smart System interpretation. `SUPPLY_INSTALL_SYSTEM` explicitly selects deterministic system building. `DRAWING` preserves the governed drawing handoff. Selector changes invalidate the previous result; **New Request** clears visible input, persisted conversation, attachment, and handoff state.

## Control boundary

Understand performs analysis but preserves the visible text. Editing that text immediately invalidates the displayed result. `READY_FOR_REVIEW` and `NEEDS_CLARIFICATION` are mutually exclusive. No analysis, voice action, clarification reply, or form handoff creates or approves a commercial document automatically.
