import type { SystemComponent, SystemInputParameter } from "../../../domain/smart-system";

/** Server-owned commercial intent plus its internal audit trail. Not a quotation row. */
export interface CommercialRequirement {
  category: string;
  preferredType: "PRODUCT" | "SERVICE";
  quantity: number;
  unit: string;
  specification: Record<string, number | string>;
  source: {
    requirement: SystemComponent;
    inputs: SystemInputParameter[];
    ruleVersion: string | null;
  };
  matchStatus: "COMMERCIAL_MATCH_CONFIRMED" | "COMMERCIAL_MATCH_AMBIGUOUS" | "COMMERCIAL_ITEM_TEMPORARY";
  matchBasis?: "EXACT" | "COMPATIBLE" | "USER_SELECTED";
  searchTruncated?: boolean;
  /** Matching a sale product does not verify disk bays, RAID, power or site design. */
  reviewRequired: true;
}
