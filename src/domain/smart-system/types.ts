export type ProvenanceType = "USER_PROVIDED" | "CALCULATED" | "SUGGESTED";

export type SystemCalculationStatus =
  | "COMPLETE"
  | "NEEDS_CONFIRMATION"
  | "INVALID_INPUT";

export interface SystemInputParameter {
  name: string;
  labelAr: string;
  labelEn: string;
  value: number | string | boolean | null;
  unit?: string | null;
  provenance: ProvenanceType;
  isDefault?: boolean;
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
}

export interface ISystemTemplate {
  readonly systemType: string;
  readonly templateVersion: string;
  readonly displayNameAr: string;
  readonly displayNameEn: string;
  calculate(inputs: Record<string, any>): SystemCalculationResult;
}
