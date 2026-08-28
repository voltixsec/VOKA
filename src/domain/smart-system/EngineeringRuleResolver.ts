import type { EngineeringRuleProfile, EngineeringRuleSnapshot } from "./types";

export const CCTV_ENGINEERING_DEFAULT: EngineeringRuleProfile = {
  id: "cctv-engineering-default",
  name: "Engineering Default",
  jurisdiction: null,
  version: "1.0.0",
  trust: "ENGINEERING_DEFAULT",
  authoritySource: null,
  values: {
    retentionDays: 30, codec: "H.265", resolutionMp: 4, fps: 15,
    bitrateMbps: 8, storageReservePercent: 0, nvrUtilizationPercent: 100,
    poeReservedPorts: 2, cableMetersPerCamera: 30, cableRollMeters: 305,
    rackAllowance: 1,
  },
};

export interface ResolveEngineeringRulesInput {
  jurisdiction?: string | null;
  verifiedJurisdictionProfile?: EngineeringRuleProfile | null;
  companyProfile?: EngineeringRuleProfile | null;
  userOverrides?: Partial<EngineeringRuleProfile["values"]>;
  resolvedAt?: string;
}

export function resolveEngineeringRules(input: ResolveEngineeringRulesInput): {
  snapshot: EngineeringRuleSnapshot;
  conflict?: { code: "RULE_CONFLICT"; messages: string[]; messagesAr: string[] };
} {
  const jurisdiction = input.jurisdiction?.trim() || null;
  const verified = input.verifiedJurisdictionProfile?.trust === "VERIFIED_AUTHORITY"
    && input.verifiedJurisdictionProfile.jurisdiction === jurisdiction
    && Boolean(input.verifiedJurisdictionProfile.authoritySource)
    ? input.verifiedJurisdictionProfile : null;
  const company = input.companyProfile?.trust === "COMPANY_APPROVED" ? input.companyProfile : null;
  const base = verified ?? company ?? CCTV_ENGINEERING_DEFAULT;
  const overrides = Object.fromEntries(Object.entries(input.userOverrides ?? {}).filter(([, value]) => value !== undefined));
  const overriddenFields = Object.keys(overrides);
  const snapshot: EngineeringRuleSnapshot = {
    ...base,
    jurisdiction,
    values: { ...base.values, ...overrides },
    governmentVerified: Boolean(verified),
    // Callers that persist a historical snapshot provide their authoritative
    // timestamp. Pure calculations remain byte-for-byte deterministic.
    resolvedAt: input.resolvedAt ?? "NOT_PERSISTED",
    overriddenFields,
  };
  if (verified && typeof input.userOverrides?.retentionDays === "number"
    && input.userOverrides.retentionDays < verified.values.retentionDays) {
    return { snapshot, conflict: {
      code: "RULE_CONFLICT",
      messages: [`User requested ${input.userOverrides.retentionDays} days.`, `Verified profile indicates ${verified.values.retentionDays} days minimum.`, "Human decision required."],
      messagesAr: [`طلب المستخدم ${input.userOverrides.retentionDays} يوماً.`, `يشير الملف الموثق إلى حد أدنى ${verified.values.retentionDays} يوماً.`, "يلزم قرار بشري."],
    } };
  }
  return { snapshot };
}
