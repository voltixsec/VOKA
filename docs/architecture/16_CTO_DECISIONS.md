# 16 CTO DECISIONS

> This document is part of the VOKA Master Blueprint.

Primary Reference:

[VOKA_MASTER_BLUEPRINT.md](../VOKA_MASTER_BLUEPRINT.md)

This file contains implementation details for this section only.

Status: Living Document

## ADR-009: AI First

Official decision record: [ADR-009: AI First](../ADR-009-AI-FIRST.md)

- Status: Approved
- Date: 2026-08-04

### Context

VOKA is designed around a simple product philosophy:

> The customer talks. VOKA works.

Voice and AI remain the primary interface for normal users. Forms, manual
workflows, and bulk data tools support advanced use cases without replacing the
AI-first experience.

### Decision

- Every feature must be designed AI-first before forms or manual workflows are added.
- Every advanced feature must have an AI-first alternative.
- The Advanced Import / Export Center is approved as an optional, web-only capability for advanced users.
- Excel/CSV import complements Voice and AI and is not the default product experience.
- Codex is the official development execution agent for VOKA.
- Human approval remains required before consequential development actions.

### Roles

- CEO: Defines business vision.
- CTO: Owns architecture and technical approval.
- Codex: Executes implementation and does not own product or technical decisions.
- Human: Approves consequential actions and closes a task only by saying "تم".

Silence never closes a task or a session.

