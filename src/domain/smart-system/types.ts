export type ProvenanceType = "USER_PROVIDED" | "CALCULATED" | "SUGGESTED";

export type SystemCalculationStatus =
  | "COMPLETE"
  | "RULE_CONFLICT"
  | "NEEDS_CONFIRMATION"
  | "INVALID_INPUT";

export type EngineeringRuleTrust =
  | "USER_OVERRIDE"
  | "VERIFIED_AUTHORITY"
  | "COMPANY_APPROVED"
  | "ENGINEERING_DEFAULT";

export interface EngineeringRuleProfile {
  id: string;
  name: string;
  jurisdiction: string | null;
  version: string;
  trust: Exclude<EngineeringRuleTrust, "USER_OVERRIDE">;
  authoritySource?: string | null;
  values: {
    retentionDays: number;
    codec: "H.264" | "H.265";
    resolutionMp: number;
    fps: number;
    bitrateMbps: number;
    storageReservePercent: number;
    nvrUtilizationPercent: number;
    poeReservedPorts: number;
    cableMetersPerCamera: number;
    cableRollMeters: number;
    rackAllowance: number;
  };
}

export interface EngineeringRuleSnapshot extends EngineeringRuleProfile {
  governmentVerified: boolean;
  resolvedAt: string;
  overriddenFields: string[];
}

export type SystemInputGuidance = {
  options: Array<{
    value: string | number | boolean;
    labelAr: string;
    labelEn: string;
    explanationAr?: string | null;
    explanationEn?: string | null;
  }>;
  recommendedValue?: string | number | boolean | null;
  rationaleAr?: string | null;
  rationaleEn?: string | null;
  requiresConfirmation: boolean;
  provenance: "VERIFIED_PROFILE" | "RESEARCHED" | "SUGGESTED";
};

export interface SystemInputParameter {
  name: string;
  labelAr: string;
  labelEn: string;
  value: number | string | boolean | null;
  unit?: string | null;
  provenance: ProvenanceType;
  isDefault?: boolean;
  guidance?: SystemInputGuidance;
}

export interface SystemComponent {
  /** Structured sizing facts; internal engineering data, never a sale-line description. */
  specification?: Record<string, number | string>;
  componentKey: string;
  name: string;
  nameAr: string;
  nameEn: string;
  itemType: "PRODUCT" | "SERVICE";
  quantity: number;
  unit: string;
  provenance: ProvenanceType;
  formulaExplanation?: string;
  /** Arabic rendering of the same calculation; never a separate calculation. */
  formulaExplanationAr?: string;
  category?: string;
}

export interface SystemCalculationResult {
  systemType: string;
  templateVersion: string;
  systemNameAr: string;
  systemNameEn: string;
  status: SystemCalculationStatus;
  inputs: SystemInputParameter[];
  missingInputs: string[];
  warnings: string[];
  components: SystemComponent[];
  /** Internal immutable-at-creation rule evidence; never customer-facing copy. */
  engineeringRules?: EngineeringRuleSnapshot;
  ruleConflict?: { code: "RULE_CONFLICT"; messages: string[]; messagesAr: string[] };
}

export interface ISystemTemplate {
  readonly systemType: string;
  readonly templateVersion: string;
  readonly displayNameAr: string;
  readonly displayNameEn: string;
  calculate(inputs: Record<string, any>): SystemCalculationResult;
}
