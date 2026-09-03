import {
  ISystemDiscoveryProvider,
  DiscoveryQueryOptions,
  SystemDiscoverySeed,
  SystemDiscoverySeedInput,
  DiscoveryEvidenceInput,
  SystemComponentInput,
} from "../../domain/discovery";

export interface OpenAiDiscoveryAdapterConfig {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  fetchFn?: typeof fetch;
}

export class OpenAiWebDiscoveryAdapter implements ISystemDiscoveryProvider {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly fetchFn: typeof fetch;

  constructor(config?: OpenAiDiscoveryAdapterConfig) {
    this.apiKey = config?.apiKey?.trim() || process.env.OPENAI_API_KEY?.trim() || "";
    this.baseUrl = (
      config?.baseUrl?.trim() ||
      process.env.OPENAI_BASE_URL?.trim() ||
      "https://api.openai.com/v1"
    ).replace(/\/+$/, "");
    this.model =
      config?.model?.trim() ||
      process.env.VOKA_POPULATION_OPENAI_MODEL?.trim() ||
      "gpt-4o";
    this.fetchFn = config?.fetchFn || globalThis.fetch;
  }

  public async discoverSystem(options: DiscoveryQueryOptions): Promise<SystemDiscoverySeed> {
    if (!options.prompt || !options.prompt.trim()) {
      throw new Error("Discovery query prompt cannot be empty.");
    }

    if (!this.apiKey) {
      throw new Error(
        "OPENAI_API_KEY is not configured. Please set OPENAI_API_KEY or provide a test mock."
      );
    }

    const systemPrompt = `You are a governed product intelligence discovery engine for VOKA.
Your task is to search the web for real-world commercial equipment, systems, or solutions matching the user prompt.
Respond STRICTLY with a valid JSON object adhering to the SystemDiscoverySeed structure.

CRITICAL INVARIANTS:
1. Do NOT hallucinate fake products or model numbers.
2. Every system and component MUST be backed by genuine web evidence (real HTTP/HTTPS URLs from manufacturers, datasheets, standards, or authoritative distributors).
3. Preserve all technical identifiers EXACTLY as found on manufacturer pages (e.g. MPN, SKU, Model Number, GTIN, protocols, standards). Do NOT alter, abbreviate, or convert casing if it destroys model identity.
4. Separate SYSTEM/SOLUTION level concept from component items (PRODUCT or SERVICE).
5. For evidence items, 'url' must be a valid HTTP or HTTPS URL, 'title' and 'publisher' must be non-empty, and 'claimSupport' must list exact claims supported by that URL.
6. Provide English first (nameEn, descriptionEn). Optional Arabic fields (nameAr, descriptionAr) may be provided if known, but NEVER invent fake model data in Arabic.

JSON Schema structure:
{
  "id": "seed-slug-id",
  "seedType": "SYSTEM" | "SOLUTION",
  "nameEn": "English Name",
  "nameAr": null | "Arabic Name",
  "aliasesEn": ["alias1"],
  "aliasesAr": [],
  "descriptionEn": "Description in English",
  "descriptionAr": null,
  "domainHint": "CCTV Surveillance",
  "categoryHint": "SECURITY_EQUIPMENT",
  "confidence": 0.95,
  "evidence": [
    {
      "url": "https://www.example-publisher.com/product-specs",
      "title": "Official Product Datasheet",
      "publisher": "Example Publisher",
      "sourceType": "MANUFACTURER_DATASHEET" | "DISTRIBUTOR_CATALOG" | "SPECIFICATION_STANDARD" | "THIRD_PARTY_CERTIFICATION" | "WEB_ARTICLE",
      "claimSupport": ["supports system specification"]
    }
  ],
  "components": [
    {
      "key": "component_key_1",
      "componentType": "PRODUCT" | "SERVICE",
      "nameEn": "Component English Name",
      "nameAr": null,
      "purpose": "Primary camera component",
      "categoryHint": "IP_CAMERAS",
      "identityHints": {
        "manufacturerHint": "Manufacturer Name",
        "brandHint": "Brand Name",
        "familyHint": "Product Family",
        "modelNumber": "Exact Model Number",
        "mpn": "Exact MPN",
        "sku": null,
        "gtin": null
      },
      "specificationHints": ["4K resolution", "PoE 802.3af"],
      "dependencyHints": [],
      "confidence": 0.9,
      "evidence": [
        {
          "url": "https://www.example-publisher.com/camera-datasheet",
          "title": "Camera Datasheet",
          "publisher": "Example Publisher",
          "sourceType": "MANUFACTURER_DATASHEET",
          "claimSupport": ["supports camera model and resolution"]
        }
      ]
    }
  ],
  "marketRelevanceTargets": [
    { "marketCode": "SA", "relevanceLevel": "HIGH", "isPrimaryMarket": true }
  ]
}`;

    const userPrompt = `Search the web and discover real-world commercial product/system intelligence for:
Prompt: ${options.prompt}
${options.domainHint ? `Domain Hint: ${options.domainHint}` : ""}
${options.categoryHint ? `Category Hint: ${options.categoryHint}` : ""}
${options.targetMarket ? `Target Market: ${options.targetMarket}` : ""}
${options.maxComponents ? `Max Components: ${options.maxComponents}` : ""}`;

    const response = await this.fetchFn(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [{ type: "web_search" }],
        response_format: { type: "json_object" },
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new Error(
        `OpenAI Discovery API error (${response.status}): ${errText || response.statusText}`
      );
    }

    const responseData = (await response.json()) as any;
    const rawContent = responseData?.choices?.[0]?.message?.content;

    if (!rawContent || typeof rawContent !== "string") {
      throw new Error("OpenAI Discovery returned an empty or invalid message content.");
    }

    let parsedPayload: any;
    try {
      parsedPayload = JSON.parse(rawContent);
    } catch {
      throw new Error(`Failed to parse OpenAI discovery JSON response: ${rawContent.slice(0, 200)}`);
    }

    return OpenAiWebDiscoveryAdapter.parseAndValidateSeed(parsedPayload);
  }

  public static parseAndValidateSeed(rawPayload: any): SystemDiscoverySeed {
    if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
      throw new Error("Parsed discovery payload must be an object.");
    }

    // Sanitize evidence items
    const rawEvidence = Array.isArray(rawPayload.evidence) ? rawPayload.evidence : [];
    const validEvidence: DiscoveryEvidenceInput[] = rawEvidence.map((ev: any, idx: number) => {
      if (!ev || typeof ev !== "object") {
        throw new Error(`Evidence item at index ${idx} is not a valid object.`);
      }
      return {
        url: typeof ev.url === "string" ? ev.url.trim() : "",
        title: typeof ev.title === "string" ? ev.title.trim() : "Discovery Reference",
        publisher: typeof ev.publisher === "string" ? ev.publisher.trim() : "Web Source",
        sourceType: ev.sourceType || "WEB_ARTICLE",
        claimSupport: Array.isArray(ev.claimSupport) ? ev.claimSupport : ["Web discovery evidence"],
      };
    });

    // Sanitize components
    const rawComponents = Array.isArray(rawPayload.components) ? rawPayload.components : [];
    const validComponents: SystemComponentInput[] = rawComponents.map((comp: any, idx: number) => {
      if (!comp || typeof comp !== "object") {
        throw new Error(`Component item at index ${idx} is not a valid object.`);
      }

      const compEvidence = Array.isArray(comp.evidence)
        ? comp.evidence.map((ev: any) => ({
            url: typeof ev.url === "string" ? ev.url.trim() : "",
            title: typeof ev.title === "string" ? ev.title.trim() : "Component Reference",
            publisher: typeof ev.publisher === "string" ? ev.publisher.trim() : "Web Source",
            sourceType: ev.sourceType || "MANUFACTURER_DATASHEET",
            claimSupport: Array.isArray(ev.claimSupport) ? ev.claimSupport : ["Component evidence"],
          }))
        : [];

      return {
        key: typeof comp.key === "string" && comp.key.trim() ? comp.key.trim() : `component_${idx + 1}`,
        componentType: comp.componentType === "SERVICE" ? "SERVICE" : "PRODUCT",
        nameEn: typeof comp.nameEn === "string" ? comp.nameEn.trim() : `Component ${idx + 1}`,
        nameAr: typeof comp.nameAr === "string" && comp.nameAr.trim() ? comp.nameAr.trim() : null,
        purpose: typeof comp.purpose === "string" ? comp.purpose.trim() : "Discovered component",
        categoryHint: typeof comp.categoryHint === "string" ? comp.categoryHint.trim() : null,
        identityHints: comp.identityHints && typeof comp.identityHints === "object" ? comp.identityHints : null,
        specificationHints: Array.isArray(comp.specificationHints) ? comp.specificationHints : [],
        dependencyHints: Array.isArray(comp.dependencyHints) ? comp.dependencyHints : [],
        evidence: compEvidence,
        confidence: typeof comp.confidence === "number" ? comp.confidence : 0.8,
      };
    });

    const seedInput: SystemDiscoverySeedInput = {
      id:
        typeof rawPayload.id === "string" && rawPayload.id.trim()
          ? rawPayload.id.trim()
          : `seed-${Date.now()}`,
      seedType: rawPayload.seedType === "SOLUTION" ? "SOLUTION" : "SYSTEM",
      nameEn: typeof rawPayload.nameEn === "string" ? rawPayload.nameEn.trim() : "Discovered System",
      nameAr: typeof rawPayload.nameAr === "string" && rawPayload.nameAr.trim() ? rawPayload.nameAr.trim() : null,
      aliasesEn: Array.isArray(rawPayload.aliasesEn) ? rawPayload.aliasesEn : [],
      aliasesAr: Array.isArray(rawPayload.aliasesAr) ? rawPayload.aliasesAr : [],
      descriptionEn:
        typeof rawPayload.descriptionEn === "string" ? rawPayload.descriptionEn.trim() : null,
      descriptionAr:
        typeof rawPayload.descriptionAr === "string" ? rawPayload.descriptionAr.trim() : null,
      domainHint: typeof rawPayload.domainHint === "string" ? rawPayload.domainHint.trim() : null,
      categoryHint: typeof rawPayload.categoryHint === "string" ? rawPayload.categoryHint.trim() : null,
      confidence: typeof rawPayload.confidence === "number" ? rawPayload.confidence : 0.85,
      evidence: validEvidence,
      components: validComponents,
      marketRelevanceTargets: Array.isArray(rawPayload.marketRelevanceTargets)
        ? rawPayload.marketRelevanceTargets
        : undefined,
    };

    return new SystemDiscoverySeed(seedInput);
  }
}
