# Checkpoint: Smart System Builder V1 Foundation

Date: 2026-08-23
Author: Jules (Primary Implementation Engineer)

## Summary
Designed and implemented the V1 foundation for VOKA's Smart System Builder capability. The system builder accepts natural language commercial requests (text or voice) in Arabic or English, identifies requested systems, and derives complete, accurate commercial line items via deterministic domain templates with explicit provenance tracking.

## Core Architecture
1. **AI Proposes, Engine Calculates**:
   - AI / NLP is responsible for intent detection, system identification, and explicit input parameter extraction.
   - AI is strictly prohibited from inventing engineering material quantities or total component counts.
   - Deterministic calculation logic calculates quantities, wastage, and derived components.
2. **Provenance Tracking**:
   - Every input parameter and line item component explicitly identifies its origin: `USER_PROVIDED`, `CALCULATED`, or `SUGGESTED`.
3. **V1 Proof Systems**:
   - **GYPSUM BOARD (`GypsumBoardSystemTemplate`)**: Calculates gypsum sheets, metal C-studs, runner tracks, drywall screws, joint tape, compound, wall anchors, insulation (if specified), and installation labor based on area (m²), layers, board dimensions, stud spacing, and wastage percentage.
   - **CCTV (`CctvSystemTemplate`)**: Calculates camera points, NVR recorder channel sizing, surveillance-grade HDDs, PoE switches, wall-mount rack cabinet, Cat6 cable rolls, connectors, and turnkey commissioning services based on camera count and project context.
4. **Quotation Draft Editor Integration**:
   - Smart System Builder output produces a standard `SalesAssistantDraftProposal` containing resolved/custom line items and financials that transfer directly into the quotation composer (`/dashboard/quotations/new`) for explicit human editing and saving.
5. **Transport-Agnostic Application Boundary**:
   - Application contract operates purely on text/natural language prompts, making the engine fully reusable across Web Text, Web Voice (`useVoiceInput`), and future Android Text/Voice transports without duplicating domain logic.

## Safety & Invariants
- Tenant isolation and company scoping are strictly preserved.
- AI and System calculation logic perform NO automatic database persistence or quotation finalization.
- Zero audio files or transcript files are stored on disk or uploaded to external servers.
