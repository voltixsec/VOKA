# ADR-009: AI First

- Status: Approved
- Date: 2026-08-04

## Context

VOKA is an AI Sales Operating System built around a simple product philosophy:

> The customer talks. VOKA works.

Voice and AI are the primary interface for normal users. Manual forms and bulk
data tools support advanced use cases without replacing the AI-first experience.

## Decision

- Every feature is designed AI-first before forms or manual workflows are added.
- Every advanced feature has an AI-first alternative.
- Voice remains the primary interface for normal users.
- The Advanced Import / Export Center is approved as an optional, web-only capability for advanced users.
- Excel/CSV import complements Voice and AI and is not the default product experience.
- Codex Desktop is the official development execution agent after a successful GitHub workflow test.
- Human approval remains required before consequential development actions.

## Governance

- The CEO owns the business vision.
- The CTO owns the architecture and technical approval.
- Codex is an execution agent and does not own product or technical decisions.
- The user closes a task only by explicitly saying "تم".
- Silence never closes a task or a session.

## Implementation Status

This decision approves the product direction only. The Advanced Import / Export
Center is planned and has not been implemented.
