export type ResearchSourceType =
  | "GOVERNMENT_AUTHORITY"
  | "MANUFACTURER_TECHNICAL"
  | "MANUFACTURER_PRODUCT"
  | "STANDARDS_ORGANIZATION"
  | "SPECIALIST_TECHNICAL"
  | "LOCAL_DISTRIBUTOR"
  | "SUPPLIER_DEALER"
  | "MARKETPLACE"
  | "SOCIAL_DISCOVERY"
  | "OTHER";

export interface DiscoveryEvidenceInput {
  url: string;
  title?: string | null;
  publisher?: string | null;
  sourceType?: ResearchSourceType | string | null;
  claimSupport?: string[] | null;
}

export class DiscoveryEvidence {
  public readonly url: string;
  public readonly title: string | null;
  public readonly publisher: string | null;
  public readonly sourceType: string | null;
  public readonly claimSupport: string[];

  constructor(input: DiscoveryEvidenceInput) {
    if (!input || typeof input !== "object") {
      throw new Error("DiscoveryEvidence input must be a valid object");
    }
    if (!input.url || typeof input.url !== "string" || !input.url.trim()) {
      throw new Error("DiscoveryEvidence requires a non-empty url");
    }
    this.url = input.url.trim();
    this.title = typeof input.title === "string" && input.title.trim() ? input.title.trim() : null;
    this.publisher = typeof input.publisher === "string" && input.publisher.trim() ? input.publisher.trim() : null;
    this.sourceType =
      typeof input.sourceType === "string" && input.sourceType.trim() ? input.sourceType.trim() : null;

    if (input.claimSupport !== undefined && input.claimSupport !== null) {
      if (!Array.isArray(input.claimSupport)) {
        throw new Error("claimSupport must be an array of strings");
      }
      const support: string[] = [];
      for (const item of input.claimSupport) {
        if (typeof item !== "string") {
          throw new Error(`claimSupport contains non-string member: ${String(item)}`);
        }
        const trimmed = item.trim();
        if (trimmed) {
          support.push(trimmed);
        }
      }
      this.claimSupport = support;
    } else {
      this.claimSupport = [];
    }
  }
}
