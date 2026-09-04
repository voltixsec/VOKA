import {
  ISystemDiscoveryProvider,
  DiscoveryQueryOptions,
  SystemDiscoverySeed,
  SystemDiscoverySeedInput,
  DiscoveryEvidenceInput,
  SystemComponentInput,
  ResearchSourceType,
} from "../../domain/discovery";

const VALID_RESEARCH_SOURCE_TYPES = new Set<ResearchSourceType>([
  "GOVERNMENT_AUTHORITY",
  "MANUFACTURER_TECHNICAL",
  "MANUFACTURER_PRODUCT",
  "STANDARDS_ORGANIZATION",
  "SPECIALIST_TECHNICAL",
  "LOCAL_DISTRIBUTOR",
  "SUPPLIER_DEALER",
  "MARKETPLACE",
  "SOCIAL_DISCOVERY",
  "OTHER",
]);

const RESEARCH_SOURCE_TYPE_ENUM = Array.from(VALID_RESEARCH_SOURCE_TYPES);

export const discoverySchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    id: { type: ["string", "null"] },
    seedType: { type: ["string", "null"], enum: ["SYSTEM", "SOLUTION", null] },
    nameEn: { type: ["string", "null"] },
    nameAr: { type: ["string", "null"] },
    aliasesEn: { type: "array", items: { type: "string" } },
    aliasesAr: { type: "array", items: { type: "string" } },
    descriptionEn: { type: ["string", "null"] },
    descriptionAr: { type: ["string", "null"] },
    domainHint: { type: ["string", "null"] },
    categoryHint: { type: ["string", "null"] },
    confidence: { type: ["number", "null"], minimum: 0, maximum: 1 },

    evidence: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          url: { type: ["string", "null"] },
          title: { type: ["string", "null"] },
          publisher: { type: ["string", "null"] },
          sourceType: {
            type: ["string", "null"],
            enum: [...RESEARCH_SOURCE_TYPE_ENUM, null],
          },
          claimSupport: {
            type: "array",
            items: { type: "string" },
          },
        },
        required: ["url", "title", "publisher", "sourceType", "claimSupport"],
      },
    },

    components: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          key: { type: ["string", "null"] },
          componentType: {
            type: ["string", "null"],
            enum: ["PRODUCT", "SERVICE", null],
          },
          nameEn: { type: ["string", "null"] },
          nameAr: { type: ["string", "null"] },
          purpose: { type: ["string", "null"] },
          categoryHint: { type: ["string", "null"] },

          identityHints: {
            type: ["object", "null"],
            additionalProperties: false,
            properties: {
              manufacturerHint: { type: ["string", "null"] },
              brandHint: { type: ["string", "null"] },
              familyHint: { type: ["string", "null"] },
              modelNumber: { type: ["string", "null"] },
              mpn: { type: ["string", "null"] },
              sku: { type: ["string", "null"] },
              gtin: { type: ["string", "null"] },
            },
            required: [
              "manufacturerHint",
              "brandHint",
              "familyHint",
              "modelNumber",
              "mpn",
              "sku",
              "gtin",
            ],
          },

          specificationHints: {
            type: "array",
            items: { type: "string" },
          },

          dependencyHints: {
            type: "array",
            items: { type: "string" },
          },

          evidence: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                url: { type: ["string", "null"] },
                title: { type: ["string", "null"] },
                publisher: { type: ["string", "null"] },
                sourceType: {
                  type: ["string", "null"],
                  enum: [...RESEARCH_SOURCE_TYPE_ENUM, null],
                },
                claimSupport: {
                  type: "array",
                  items: { type: "string" },
                },
              },
              required: ["url", "title", "publisher", "sourceType", "claimSupport"],
            },
          },

          confidence: {
            type: ["number", "null"],
            minimum: 0,
            maximum: 1,
          },
        },

        required: [
          "key",
          "componentType",
          "nameEn",
          "nameAr",
          "purpose",
          "categoryHint",
          "identityHints",
          "specificationHints",
          "dependencyHints",
          "evidence",
          "confidence",
        ],
      },
    },

    marketRelevanceTargets: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          marketCode: { type: ["string", "null"] },
          relevanceLevel: { type: ["string", "null"] },
          isPrimaryMarket: { type: ["boolean", "null"] },
        },
        required: ["marketCode", "relevanceLevel", "isPrimaryMarket"],
      },
    },
  },

  required: [
    "id",
    "seedType",
    "nameEn",
    "nameAr",
    "aliasesEn",
    "aliasesAr",
    "descriptionEn",
    "descriptionAr",
    "domainHint",
    "categoryHint",
    "confidence",
    "evidence",
    "components",
    "marketRelevanceTargets",
  ],
};
function extractProviderSourceUrls(responseData: any): Set<string> {
  const groundedUrls = new Set<string>();
  const output = Array.isArray(responseData?.output) ? responseData.output : [];

  for (const item of output) {
    if (item?.type === "web_search_call" && Array.isArray(item?.action?.sources)) {
      for (const source of item.action.sources) {
        if (typeof source?.url === "string" && source.url.trim()) {
          groundedUrls.add(source.url.trim());
        }
      }
    }
    for (const content of Array.isArray(item?.content) ? item.content : []) {
      for (const annotation of Array.isArray(content?.annotations) ? content.annotations : []) {
        if (annotation?.type === "url_citation" && typeof annotation.url === "string" && annotation.url.trim()) {
          groundedUrls.add(annotation.url.trim());
        }
      }
    }
  }

  return groundedUrls;
}

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
        "OPENAI_API_KEY is not configured. Please set OPENAI_API_KEY to use real web discovery."
      );
    }

    const systemPrompt = `You are a governed product intelligence discovery engine for VOKA.
Your task is to search the web for real-world commercial equipment, systems, or solutions matching the user prompt.

CRITICAL INVARIANTS:
1. Do NOT hallucinate fake products or model numbers.
2. Every system and component MUST be backed by genuine web evidence (real HTTP/HTTPS URLs from manufacturers, datasheets, standards, or authoritative distributors).
3. Preserve all technical identifiers EXACTLY as found on manufacturer pages (e.g. MPN, SKU, Model Number, GTIN, protocols, standards). Do NOT alter, abbreviate, or convert casing if it destroys model identity.
4. Separate SYSTEM/SOLUTION level concept from component items (PRODUCT or SERVICE).
5. Provide English first (nameEn, descriptionEn). Optional Arabic fields (nameAr, descriptionAr) may be provided if known, but NEVER invent fake model data in Arabic.`;

    const userPrompt = `Search the web and discover real-world commercial product/system intelligence for:
Prompt: ${options.prompt}
${options.domainHint ? `Domain Hint: ${options.domainHint}` : ""}
${options.categoryHint ? `Category Hint: ${options.categoryHint}` : ""}
${options.targetMarket ? `Target Market: ${options.targetMarket}` : ""}
${options.maxComponents ? `Max Components: ${options.maxComponents}` : ""}`;

    const response = await this.fetchFn(`${this.baseUrl}/responses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        store: false,
        instructions: systemPrompt,
        input: [{ role: "user", content: userPrompt }],
        tools: [{ type: "web_search" }],
        text: {
          format: {
            type: "json_schema",
            name: "SystemDiscoverySeed",
            strict: true,
            schema: discoverySchema,
          },
        },
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
    const output = Array.isArray(responseData?.output) ? responseData.output : [];
    let rawContent = "";
    for (const item of output) {
      if (item?.type === "message" && Array.isArray(item.content)) {
        for (const contentItem of item.content) {
          if (contentItem?.type === "output_text" && typeof contentItem.text === "string") {
            rawContent = contentItem.text;
            break;
          }
        }
      }
      if (rawContent) break;
    }

    if (!rawContent) {
      throw new Error("OpenAI Discovery returned an empty or invalid message content.");
    }

    let parsedPayload: any;
    try {
      parsedPayload = JSON.parse(rawContent);
    } catch {
      throw new Error(`Failed to parse OpenAI discovery JSON response: ${rawContent.slice(0, 200)}`);
    }

    const groundedUrls = extractProviderSourceUrls(responseData);

const keepUsableGroundedEvidence = (evidence: any): any[] =>
  Array.isArray(evidence)
    ? evidence.filter((ev: any) => {
        if (!ev || typeof ev !== "object") return false;
        if (typeof ev.url !== "string" || !ev.url.trim()) return false;
        if (!groundedUrls.has(ev.url.trim())) return false;
        if (typeof ev.title !== "string" || !ev.title.trim()) return false;
        if (typeof ev.publisher !== "string" || !ev.publisher.trim()) return false;
        if (typeof ev.sourceType !== "string" || !VALID_RESEARCH_SOURCE_TYPES.has(ev.sourceType.trim())) return false;
        if (!Array.isArray(ev.claimSupport) || ev.claimSupport.length === 0) return false;
        if (!ev.claimSupport.every((claim: any) => typeof claim === "string" && claim.trim())) return false;
        return true;
      })
    : [];

parsedPayload.evidence = keepUsableGroundedEvidence(parsedPayload.evidence);

if (Array.isArray(parsedPayload.components)) {
  parsedPayload.components = parsedPayload.components.map((component: any) => ({
    ...component,
    evidence: keepUsableGroundedEvidence(component?.evidence),
  }));
}

return OpenAiWebDiscoveryAdapter.parseAndValidateSeed(parsedPayload);
  }

  public static parseAndValidateSeed(rawPayload: any): SystemDiscoverySeed {
    if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
      throw new Error("Parsed discovery payload must be an object.");
    }

    if (typeof rawPayload.seedType !== "string" || (rawPayload.seedType !== "SYSTEM" && rawPayload.seedType !== "SOLUTION")) {
      throw new Error(`Invalid or missing seedType: ${String(rawPayload.seedType)}`);
    }
if (typeof rawPayload.nameEn !== "string" || !rawPayload.nameEn.trim()) {
      throw new Error("Parsed discovery payload missing required nameEn.");
    }

    const seedId =
  typeof rawPayload.id === "string" && rawPayload.id.trim()
    ? rawPayload.id.trim()
    : `discovered-${rawPayload.seedType.toLowerCase()}-${rawPayload.nameEn
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80) || "unnamed"}`;

const seedConfidence =
  typeof rawPayload.confidence === "number" &&
  Number.isFinite(rawPayload.confidence) &&
  rawPayload.confidence >= 0 &&
  rawPayload.confidence <= 1
    ? rawPayload.confidence
    : 0;
const rawEvidence = Array.isArray(rawPayload.evidence) ? rawPayload.evidence : [];

    const validEvidence: DiscoveryEvidenceInput[] = rawEvidence.map((ev: any, idx: number) => {
      if (!ev || typeof ev !== "object") {
        throw new Error(`Evidence item at index ${idx} is not a valid object.`);
      }
      if (typeof ev.url !== "string" || !ev.url.trim()) {
        throw new Error(`Evidence item at index ${idx} missing required url.`);
      }
      const trimmedUrl = ev.url.trim();
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(trimmedUrl);
      } catch {
        throw new Error(`Evidence item at index ${idx} url is not a valid HTTP or HTTPS URL.`);
      }
      if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
        throw new Error(`Evidence item at index ${idx} url must use HTTP or HTTPS.`);
      }
      if (typeof ev.title !== "string" || !ev.title.trim()) {
        throw new Error(`Evidence item at index ${idx} missing required title.`);
      }
      if (typeof ev.publisher !== "string" || !ev.publisher.trim()) {
        throw new Error(`Evidence item at index ${idx} missing required publisher.`);
      }
      if (typeof ev.sourceType !== "string" || !ev.sourceType.trim()) {
        throw new Error(`Evidence item at index ${idx} missing required sourceType.`);
      }
      const trimmedSourceType = ev.sourceType.trim();
      if (!VALID_RESEARCH_SOURCE_TYPES.has(trimmedSourceType)) {
        throw new Error(`Evidence item at index ${idx} has unsupported sourceType: ${trimmedSourceType}`);
      }
      if (!Array.isArray(ev.claimSupport) || ev.claimSupport.length === 0) {
        throw new Error(`Evidence item at index ${idx} missing required claimSupport array.`);
      }
      for (let c = 0; c < ev.claimSupport.length; c++) {
        if (typeof ev.claimSupport[c] !== "string" || !ev.claimSupport[c].trim()) {
          throw new Error(`Evidence item at index ${idx} claimSupport contains empty string at position ${c}.`);
        }
      }
      return {
        url: trimmedUrl,
        title: ev.title.trim(),
        publisher: ev.publisher.trim(),
        sourceType: trimmedSourceType,
        claimSupport: ev.claimSupport.map((s: string) => s.trim()),
      };
    });

    const rawComponents = Array.isArray(rawPayload.components) ? rawPayload.components : [];

const structurallyUsableComponents = rawComponents.filter((comp: any) => {
  if (!comp || typeof comp !== "object") return false;
  if (typeof comp.key !== "string" || !comp.key.trim()) return false;
  if (typeof comp.nameEn !== "string" || !comp.nameEn.trim()) return false;
  if (comp.componentType !== "PRODUCT" && comp.componentType !== "SERVICE") return false;
  return true;
});

const validComponents: SystemComponentInput[] = structurallyUsableComponents.map((comp: any, idx: number) => {
      if (!comp || typeof comp !== "object") {
        throw new Error(`Component item at index ${idx} is not a valid object.`);
      }
      if (typeof comp.key !== "string" || !comp.key.trim()) {
        throw new Error(`Component item at index ${idx} missing required key.`);
      }
      if (typeof comp.nameEn !== "string" || !comp.nameEn.trim()) {
        throw new Error(`Component item at index ${idx} missing required nameEn.`);
      }
      if (comp.componentType !== "PRODUCT" && comp.componentType !== "SERVICE") {
        throw new Error(`Component item at index ${idx} invalid componentType: ${String(comp.componentType)}`);
      }
      const componentConfidence =
  typeof comp.confidence === "number" &&
  Number.isFinite(comp.confidence) &&
  comp.confidence >= 0 &&
  comp.confidence <= 1
    ? comp.confidence
    : 0;

      const compEvidence = Array.isArray(comp.evidence)
        ? comp.evidence.map((ev: any, evIdx: number) => {
            if (!ev || typeof ev !== "object") {
              throw new Error(`Component item at index ${idx} evidence item at index ${evIdx} is not a valid object.`);
            }
            if (typeof ev.url !== "string" || !ev.url.trim()) {
              throw new Error(`Component item at index ${idx} evidence item at index ${evIdx} missing required url.`);
            }
            const trimmedEvUrl = ev.url.trim();
            let parsedEvUrl: URL;
            try {
              parsedEvUrl = new URL(trimmedEvUrl);
            } catch {
              throw new Error(`Component item at index ${idx} evidence item at index ${evIdx} url is not a valid HTTP or HTTPS URL.`);
            }
            if (parsedEvUrl.protocol !== "http:" && parsedEvUrl.protocol !== "https:") {
              throw new Error(`Component item at index ${idx} evidence item at index ${evIdx} url must use HTTP or HTTPS.`);
            }
            if (typeof ev.title !== "string" || !ev.title.trim()) {
              throw new Error(`Component item at index ${idx} evidence item at index ${evIdx} missing required title.`);
            }
            if (typeof ev.publisher !== "string" || !ev.publisher.trim()) {
              throw new Error(`Component item at index ${idx} evidence item at index ${evIdx} missing required publisher.`);
            }
            if (typeof ev.sourceType !== "string" || !ev.sourceType.trim()) {
              throw new Error(`Component item at index ${idx} evidence item at index ${evIdx} missing required sourceType.`);
            }
            const trimmedEvSourceType = ev.sourceType.trim();
            if (!VALID_RESEARCH_SOURCE_TYPES.has(trimmedEvSourceType)) {
              throw new Error(`Component item at index ${idx} evidence item at index ${evIdx} has unsupported sourceType: ${trimmedEvSourceType}`);
            }
            if (!Array.isArray(ev.claimSupport) || ev.claimSupport.length === 0) {
              throw new Error(`Component item at index ${idx} evidence item at index ${evIdx} missing required claimSupport array.`);
            }
            for (let c = 0; c < ev.claimSupport.length; c++) {
              if (typeof ev.claimSupport[c] !== "string" || !ev.claimSupport[c].trim()) {
                throw new Error(`Component item at index ${idx} evidence item at index ${evIdx} claimSupport contains empty string at position ${c}.`);
              }
            }
            return {
              url: trimmedEvUrl,
              title: ev.title.trim(),
              publisher: ev.publisher.trim(),
              sourceType: trimmedEvSourceType,
              claimSupport: ev.claimSupport.map((s: string) => s.trim()),
            };
          })
        : [];

      const identityHints = comp.identityHints && typeof comp.identityHints === "object" && !Array.isArray(comp.identityHints)
        ? (() => {
            const allowedKeys = new Set(["manufacturerHint", "brandHint", "familyHint", "modelNumber", "mpn", "sku", "gtin"]);
            const hints: any = {};
            for (const key of Object.keys(comp.identityHints)) {
              if (!allowedKeys.has(key)) {
                throw new Error(`Component item at index ${idx} identityHints contains unsupported key: ${key}`);
              }
              const val = comp.identityHints[key];
              if (val !== null && typeof val !== "undefined" && typeof val !== "string") {
                throw new Error(`Component item at index ${idx} identityHints.${key} must be a string or null.`);
              }
              hints[key] = val === null || typeof val === "undefined" ? null : val;
            }
            return hints;
          })()
        : comp.identityHints !== undefined && comp.identityHints !== null
        ? (() => { throw new Error(`Component item at index ${idx} identityHints is not a valid object.`); })()
        : null;

      return {
        key: comp.key.trim(),
        componentType: comp.componentType,
        nameEn: comp.nameEn.trim(),
        nameAr: typeof comp.nameAr === "string" && comp.nameAr.trim() ? comp.nameAr.trim() : null,
        purpose: typeof comp.purpose === "string" ? comp.purpose.trim() : null,
        categoryHint: typeof comp.categoryHint === "string" && comp.categoryHint.trim() ? comp.categoryHint.trim() : null,
        identityHints,
        specificationHints: Array.isArray(comp.specificationHints) ? comp.specificationHints.filter((s: any) => typeof s === "string" && s.trim()) : [],
        dependencyHints: Array.isArray(comp.dependencyHints) ? comp.dependencyHints.filter((s: any) => typeof s === "string" && s.trim()) : [],
        evidence: compEvidence,
        confidence: componentConfidence,
      };
    });

    const validMarketTargets = new Set([
  "GLOBAL",
  "MIDDLE_EAST",
  "GCC",
  "KUWAIT",
  "SAUDI_ARABIA",
  "EGYPT",
]);

const normalizedMarketRelevanceTargets = Array.isArray(rawPayload.marketRelevanceTargets)
  ? rawPayload.marketRelevanceTargets
      .map((target: any) => {
        if (typeof target === "string") return target.trim();

        if (
          target &&
          typeof target === "object" &&
          typeof target.marketCode === "string"
        ) {
          return target.marketCode.trim();
        }

        return null;
      })
      .filter(
        (target: any) =>
          typeof target === "string" &&
          validMarketTargets.has(target)
      )
  : [];
const seedInput: SystemDiscoverySeedInput = {
      id: seedId,
      seedType: rawPayload.seedType,
      nameEn: rawPayload.nameEn.trim(),
      nameAr: typeof rawPayload.nameAr === "string" && rawPayload.nameAr.trim() ? rawPayload.nameAr.trim() : null,
      aliasesEn: Array.isArray(rawPayload.aliasesEn) ? rawPayload.aliasesEn.filter((s: any) => typeof s === "string" && s.trim()) : [],
      aliasesAr: Array.isArray(rawPayload.aliasesAr) ? rawPayload.aliasesAr.filter((s: any) => typeof s === "string" && s.trim()) : [],
      descriptionEn: typeof rawPayload.descriptionEn === "string" && rawPayload.descriptionEn.trim() ? rawPayload.descriptionEn.trim() : null,
      descriptionAr: typeof rawPayload.descriptionAr === "string" && rawPayload.descriptionAr.trim() ? rawPayload.descriptionAr.trim() : null,
      domainHint: typeof rawPayload.domainHint === "string" && rawPayload.domainHint.trim() ? rawPayload.domainHint.trim() : null,
      categoryHint: typeof rawPayload.categoryHint === "string" && rawPayload.categoryHint.trim() ? rawPayload.categoryHint.trim() : null,
      confidence: seedConfidence,
      evidence: validEvidence,
      components: validComponents,
      marketRelevanceTargets: normalizedMarketRelevanceTargets as SystemDiscoverySeedInput["marketRelevanceTargets"],
    };

    return new SystemDiscoverySeed(seedInput);
  }

  private static assertEvidenceGrounded(payload: any, groundedUrls: Set<string>): void {
    const checkUrls = (evidence: any[], context: string): void => {
      for (const ev of evidence) {
        if (ev && typeof ev.url === "string" && ev.url.trim() && !groundedUrls.has(ev.url.trim())) {
          throw new Error(
            `Discovery evidence URL '${ev.url.trim()}' is not traceable to actual web-search citations from the provider.`
          );
        }
      }
    };

    const seedEvidence = Array.isArray(payload?.evidence) ? payload.evidence : [];
    checkUrls(seedEvidence, "seed evidence");

    const components = Array.isArray(payload?.components) ? payload.components : [];
    for (const comp of components) {
      const compEvidence = Array.isArray(comp?.evidence) ? comp.evidence : [];
      checkUrls(compEvidence, `component '${comp?.key ?? "unknown"}' evidence`);
    }
  }
}