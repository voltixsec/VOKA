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
    if (!input || !input.url || typeof input.url !== "string" || !input.url.trim()) {
      throw new Error("DiscoveryEvidence requires a non-empty url");
    }
    this.url = input.url.trim();
    this.title = input.title && input.title.trim() ? input.title.trim() : null;
    this.publisher = input.publisher && input.publisher.trim() ? input.publisher.trim() : null;
    this.sourceType = input.sourceType && String(input.sourceType).trim() ? String(input.sourceType).trim() : null;
    this.claimSupport = Array.isArray(input.claimSupport)
      ? input.claimSupport.map((c) => String(c).trim()).filter(Boolean)
      : [];
  }
}
