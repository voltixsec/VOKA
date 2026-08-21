# Universal Commercial Library Source Governance

UCL-6 permits bounded acquisition only from preconfigured sources. Public accessibility is not licensing permission, and this document is an operational control—not legal advice.

## Approval and policy

Sources move explicitly through `DRAFT`, `APPROVED`, `PAUSED`, and `BLOCKED`. Real and dry-run network acquisition both require an active `APPROVED` source, non-blocked health, explicit `ALLOWED` commercial use and redistribution, a license description and reference URL, and no blocking site/robots policy. `UNKNOWN` fails closed.

Only OWNER/ADMIN API callers can start or inspect runs. Callers provide a source ID, never a URL. Source configuration records the governed endpoint, acquisition mode, attribution requirement, trust, health, timeout, retries, per-minute requests, per-run records, and per-day records.

## Network boundary

The HTTP adapter sends a truthful VOKA user agent, no credentials, cookies, or browser session. Only HTTP(S) is supported. URLs with credentials, localhost, loopback, private, carrier-grade NAT, link-local, documentation, multicast, and other non-public ranges are blocked. All DNS answers are checked immediately before every request and redirect. Redirects are manual, bounded, revalidated, and restricted to the governed origin.

This reduces DNS-rebinding exposure but does not claim perfect socket-level DNS pinning. Sources requiring stronger guarantees must use an egress proxy that pins validated destinations. Website scraping, login walls, paywalls, CAPTCHAs, and anti-bot bypass are outside UCL-6. The initial adapter is intended for governed structured JSON feeds; `robotsPolicy=DISALLOWED` blocks execution.

## Bounds and quotas

Response bodies, timeouts, redirects, retries, cursor length, records per request, run, day, and the global UCL-6 live pilot total are bounded. Database advisory locking plus serializable reservation prevents concurrent runs from racing through daily/global quotas. A source-aware one-minute run gate prevents concurrent request bursts. Transient network/429/5xx failures alone are retried; `Retry-After` and exponential delays are capped. Permanent policy, validation, and 4xx failures are not retried.

No adapter follows cursors automatically. Every continuation requires a new governed, quota-reserved run.

## Trust, minimization, and provenance

External objects are untrusted. The JSON adapter copies only allowlisted commercial fields into null-prototype objects, enforces bounded identities/names/fields, and discards contact, analytics, cookies, headers, and unexpected fields. Payload source identity never overrides the server-owned source.

Live records enter existing UCL-3 staging, normalization, identity resolution, review, and transactional publication. Run ID, canonical source URL, fetched time, raw payload hash, and license reference survive into ingestion/provenance. Changed published payloads require review. External acquisition never writes Company Catalog; tenant adoption remains explicit.

## Dry-run and audit

Dry-run uses the same policy, network, quota, parsing, and validation gates, but performs no staging or publication. Runs record bounded counters, status, cursor, retry count, safe error summary, actor reference, and a policy snapshot. Secrets and raw HTTP metadata are not recorded. Operators must pause/block unhealthy or disputed sources and must not claim a live pilot without recorded network evidence.
