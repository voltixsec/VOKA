# WS6 Smart System Coverage — Access Control

Date: 2026-08-25

Status: **BOUNDED_SLICE_CODE_COMPLETE**

## Delivered

- Added versioned `ACCESS_CONTROL` deterministic template `1.0.0`.
- Arabic and English intent detection recognizes Access Control requests without hijacking ordinary quotation prompts.
- Required inputs: door count and controlled direction (`ENTRY_ONLY` or `ENTRY_EXIT`).
- Installed systems additionally require an explicit cable allowance per door; missing survey input returns `NEEDS_CONFIRMATION` with zero components.
- Invalid/negative/out-of-range counts and cable allowances return `INVALID_INPUT`.
- Deterministic rules calculate controller capacity, reader count, electric locks, door contacts, entry-only exit buttons, explicit cable quantity, and installation points.
- Output never selects a brand/model or invents a price. Credential quantity, lock type, fire-alarm interface, and backup power remain explicit human-confirmation warnings.
- Provenance remains `USER_PROVIDED` for authoritative inputs and `CALCULATED` for derived quantities.

## Validation

- Focused Smart System and integrated product-integrity tests: 43 passed.
- Repeated execution equality: covered.
- Typecheck and diff check: PASS.

## Remaining WS6 coverage

Candidate templates not yet implemented: Structured Cabling, Wi-Fi, Fire Alarm, Ceiling, Painting, Tiles, Electrical, Lighting, HVAC, and Plumbing. Each requires a separately bounded engineering rule set; none is represented as complete by this checkpoint.

## Safety

- No AI-authored engineering quantity was accepted.
- No catalog product, brand, model, or price was fabricated.
- `main` remains untouched.

## Next action

Continue WS6 with another bounded deterministic system or proceed to evidence-led WS7 performance when execution capacity requires a stable handoff.
