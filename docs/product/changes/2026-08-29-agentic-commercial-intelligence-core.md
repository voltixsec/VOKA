# Agentic Commercial Intelligence Core

Status: implemented foundation on `feature/pre-staging-product-coherence`

## Product boundary

The Sales Assistant is VOKA's conversational commercial intelligence interface. Voice, text and future structured attachment evidence update one canonical `WorkingCommercialDraft`. The final output is the real editable VOKA Quotation, Invoice, Contract or Sales Order draft; chat prose is not a substitute for that document. AI never approves or executes the document.

Each request sends only the current turn. Previous turns, resolved entities, explicit answers, system inputs and canonical proposal remain in the working draft and are patched by the application service. Starting a new request creates a fresh state and carries no customer, project, attention, system, terms or engineering facts from the prior request.

## Bounded tool architecture

The application orchestrates explicit authority boundaries:

| Capability | Current authority |
| --- | --- |
| System intelligence | Existing versioned Smart System templates and engineering profiles |
| Research | `CommercialSystemResearchPort`, returning request-scoped evidence and a provisional model |
| Company data | Tenant-scoped company, customer and terms repositories |
| Catalog | Existing catalog, unit, pricing and commercialization services |
| Engineering rules | Existing deterministic, versioned domain rules |
| Draft handoff | `CompleteCommercialConversation` and the current real document draft routes |
| Attachment evidence | `AttachmentEvidencePort` seam for future structured facts |

Infrastructure implements ports. Application code owns orchestration. Domain calculations remain independent of providers, HTTP, Prisma and browser APIs. Research queries are generalized to the technical system and jurisdiction; customer and project identities are excluded when they are not technically relevant.

## Known and unknown systems

A known system follows `verified profile → declared inputs → deterministic rules → engineering requirements → Commercial BOM → catalog/pricing → draft`. Research is not invoked. CCTV therefore continues through its existing deterministic rules and Commercial BOM.

An unknown system follows `semantic system intent → profile miss → optional bounded research → ProvisionalSystemModel → one missing input at a time → provisional review`.

System Profiles accelerate reasoning but do not limit which systems VOKA can discuss. A researched model is request-scoped and is never promoted to a verified profile automatically. If research is unavailable, VOKA creates only a low-confidence interpreted shell, asks for configuration, creates no engineering quantities or compliance claims, and records the limitation.

## Knowledge and provenance

Internal working state distinguishes `VERIFIED_PROFILE`, `USER_PROVIDED`, `DOCUMENT_PROVIDED`, `DATABASE_RESOLVED`, `RESEARCHED`, `AI_INTERPRETED`, `DETERMINISTIC_CALCULATION` and `NEEDS_CONFIRMATION`. Research evidence records title, URL and publisher internally. Provisional models always require engineering verification and human review. Customer-facing quotations do not render agent/research metadata.

The agent may interpret, research, ask and structure. Only trusted deterministic services may calculate engineering quantities. Missing room dimensions, loads, capacities, compatibility, code evidence or similar facts remain questions or warnings. Model names such as FM-200 are not quantities.

## Questions, attachments and handoff

VOKA projects one active question from unresolved canonical state rather than presenting a large questionnaire. Each answer patches the current draft, reuses request-scoped research and reevaluates readiness. Attachments remain optional; future BOQ, drawing and specification adapters may contribute `DOCUMENT_PROVIDED` facts before questions are selected.

When commercial state is sufficiently complete, existing handoff stores the canonical proposal for the real VOKA draft. Unknown customers remain proposed, unknown catalog items remain truthful temporary lines, absent SKUs are never fabricated, missing prices remain review blockers, and every output remains subject to human review and approval.

## Current limitations

- The research port is implemented and deterministically tested with mock evidence; no production web-search adapter is enabled in this slice.
- Provisional unknown-system models do not perform engineering sizing or generate authoritative component quantities.
- Governed promotion from a provisional model into a verified System Profile remains a later administrative workflow.
- The attachment port is architectural only; detailed BOQ/drawing/specification parsing is deferred.
