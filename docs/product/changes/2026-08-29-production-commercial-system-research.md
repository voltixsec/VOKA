# Production Commercial System Research

Status: implemented on `feature/pre-staging-product-coherence`

## Purpose and trigger

VOKA now connects the existing `CommercialSystemResearchPort` to the configured OpenAI Responses provider when web research is enabled. Research runs only after the deterministic System Profile path has no sufficient known system. Known CCTV requests stay on their verified, versioned engineering route and do not invoke external research.

Unknown systems are accepted into a request-scoped `ProvisionalSystemModel`. Research helps identify general purpose, component categories, terminology and the minimum project inputs needed for clarification. It never supplies final engineering quantities, verified jurisdiction compliance, product compatibility, catalog identity, SKU, price, document approval or commercial execution.

## Responses API and provider boundary

The existing server-side `OpenAISalesAssistantAdapter` implements both the sales understanding port and `CommercialSystemResearchPort`; it uses the same configured API key, base URL and sales model unless `VOKA_COMMERCIAL_RESEARCH_MODEL` overrides the model. The adapter calls the Responses API with the `web_search` tool, structured JSON Schema output, bounded `max_tool_calls`, bounded output tokens, `store: false`, and `web_search_call.action.sources` included.

Only source metadata actually returned by the web-search tool is eligible for evidence. A model-produced URL absent from tool metadata is discarded. Malformed URLs, non-HTTP URLs, duplicates and blocked domains are discarded. A result below the configured evidence threshold is rejected and the application uses its safe interpreted shell.

## Query privacy

Application query planning reduces the user request to system intent, a materially relevant manufacturer or supplier reference, jurisdiction and technical research intent. Customer identities, project names, prices, payment terms, tenant catalog data and tenant identifiers are not sent to research. The server cache key uses a versioned normalization of that same generalized intent and jurisdiction, never the authenticated `companyId` or raw conversation.

For the CEO elevator example, the planned query retains the relevant `Marafie` and Kuwait elevator context while excluding unrelated customer, project and quotation content.

## Source quality and provenance

Server configuration supports preferred domains, blocked domains, maximum sources and minimum evidence. Evidence is ranked conceptually as government/authority, manufacturer technical, manufacturer product, standards organization, specialist technical and supporting material. A government classification is accepted only for a government domain. Preferred domains receive a ranking boost; obvious social-content domains are denied by default without creating a universal whitelist. Weak-only evidence caps confidence at a low level.

Each retained item stores title, URL, publisher domain, source type, supported claim labels, quality score and `RESEARCHED` provenance. The resulting model remains `RESEARCHED`, always requires engineering verification and always requires human review. This metadata remains internal and is not rendered in customer quotations.

## Cache, budget and failure behavior

Operational controls are server-side: enabled flag, optional research model, timeout, cache TTL, maximum tool calls, maximum evidence sources, minimum evidence and preferred/blocked domains. One Responses request performs at most the configured bounded number of web-search calls. The in-process cache is TTL-based, versioned and capped at 100 generalized intents. Request-scoped retained agent state continues to prevent repeat research during ordinary clarification. An explicit material system correction discards retained research and triggers a new generalized intent.

Provider errors, timeouts, incomplete responses, malformed structured data, invalid sources and insufficient evidence return `null`. The existing reasoner then creates a low-confidence `AI_INTERPRETED` shell, records that research is unavailable, asks for a necessary configuration fact and continues without fabricated claims. Safe telemetry records generalized intent, provider, cache result, duration, source count, confidence class and failure category; it does not log raw user requests, tenant IDs or secrets.

## Prompt-injection and action boundary

User input and retrieved web pages are untrusted data. Adapter instructions explicitly prohibit following webpage instructions, exposing secrets, changing tenant or agent policy, invoking non-search actions, approving documents, selecting products/prices, or asserting verified engineering and compliance. The tool list contains only web search. External text cannot call VOKA application actions, repositories, approval gates, Catalog Resolver, Commercial BOM or pricing services. Structured output is schema-checked and evidence is intersected with actual tool sources before use.

## CEO acceptance readiness

Elevator: the exact request is accepted as an unknown passenger elevator, plans privacy-safe research retaining Marafie/Kuwait context, builds a provisional component and input model from validated evidence, creates no final quantities, and asks the next configuration question. Human review stays mandatory.

FM-200: the exact request is treated as an unknown suppression system when no verified profile exists. Research may identify general categories and missing project inputs while `200` is never converted into a quantity. Kuwait intent is retained, but no Kuwait compliance claim is created without a trusted verified profile. Human review stays mandatory.

Automated tests mock the Responses endpoint; they never depend on live internet. Live source availability, search quality and model/tool entitlement remain deployment configuration and manual acceptance concerns.
