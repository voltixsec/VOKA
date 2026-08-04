# Vision and Governance

## Product identity

VOKA is an AI Sales Operating System, not a traditional ERP or CRM. Its goal is
to turn natural voice/text intent into structured sales operations and professional
documents while leaving final business control with the human.

Primary sources: [Master Blueprint](../VOKA_MASTER_BLUEPRINT.md),
[Vision](../architecture/VISION.md), and [README](../../README.md).

## Product philosophy

- AI First, Voice First, Business First, Mobile First, and eventually Offline First.
- “The customer talks. VOKA works.”
- Users express intent rather than implementation details.
- AI extracts, recommends, and drafts; it never auto-approves a quotation or other
  consequential business decision.
- Arabic and English are first-class languages.
- Conversations remain resumable. Silence does not close work.
- Products and services remain distinct and both affect quotation totals.

Sources: [ADR-009](../ADR-009-AI-FIRST.md),
[Architecture V2](../ARCHITECTURE_V2.md),
[Voice First](../architecture/VOICE_FIRST.md).

## Governance and roles

| Role | Authority |
|---|---|
| CEO/project owner | Business vision and final product decisions |
| CTO | Architecture and technical approval |
| Codex Desktop | Approved execution agent; no independent product or technical decision authority |
| Human user | Reviews and approves consequential actions |

A task closes only when the user explicitly says `تم`. Silence never closes a task
or session. Source: [ADR-009](../ADR-009-AI-FIRST.md).

## Product landscape

The long-term system comprises Core Platform, Identity, Companies, Users,
Permissions, Audit, Sales, Purchase, Inventory, Finance, Documents, Voice, AI,
and Analytics. The Sales Engine is the current heart: Customer, Catalog, Pricing,
Quotation, then Sales Order, Invoice, Payment, approvals, notifications, and
document delivery.

The mobile app is intended to be a complete operating surface, not a companion.
Web, mobile, and WhatsApp are envisioned channels, subject to technical feasibility.

## Approved but not implemented

The Advanced Import / Export Center is **Planned**, optional, web-only, medium
priority, and intended for advanced users after completion of the Core Sales
Engine. It supplements rather than replaces Voice and AI.

Sources: [ADR-009](../ADR-009-AI-FIRST.md), [Modules](../architecture/13_MODULES.md),
[Roadmap](../ROADMAP.md).
