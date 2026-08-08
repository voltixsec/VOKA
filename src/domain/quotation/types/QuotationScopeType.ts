export const QUOTATION_SCOPE_TYPES = [
  "SUPPLY_ONLY",
  "SUPPLY_AND_INSTALLATION",
  "INSTALLATION_ONLY",
  "SERVICE",
  "MAINTENANCE",
  "CONSULTATION",
  "CUSTOM",
] as const;

export type QuotationScopeType =
  (typeof QUOTATION_SCOPE_TYPES)[number];

export function isQuotationScopeType(
  value: unknown,
): value is QuotationScopeType {
  return (
    typeof value === "string" &&
    QUOTATION_SCOPE_TYPES.includes(
      value as QuotationScopeType,
    )
  );
}