export type EngineeringQuantityStatus = "EXACT" | "ESTIMATED";

export type PackagingResolution = {
  requiredQuantity: number;
  requiredUnit: string;
  packageQuantity: number;
  packageUnit: string;
  commercialQuantity: number;
  status: EngineeringQuantityStatus;
  assumptions: string[];
};

/** Converts a governed requirement into purchasable packaging without guessing package size. */
export function resolveCommercialPackaging(input: {
  requiredQuantity: number;
  requiredUnit: string;
  packageQuantity: number;
  packageUnit: string;
  indivisible?: boolean;
  status: EngineeringQuantityStatus;
  assumptions?: string[];
}): PackagingResolution {
  if (!Number.isFinite(input.requiredQuantity) || input.requiredQuantity <= 0) throw new Error("ENGINEERING_REQUIRED_QUANTITY_INVALID");
  if (!Number.isFinite(input.packageQuantity) || input.packageQuantity <= 0) throw new Error("COMMERCIAL_PACKAGE_QUANTITY_INVALID");
  const raw = input.requiredQuantity / input.packageQuantity;
  return {
    requiredQuantity: input.requiredQuantity,
    requiredUnit: input.requiredUnit,
    packageQuantity: input.packageQuantity,
    packageUnit: input.packageUnit,
    commercialQuantity: input.indivisible === false ? raw : Math.ceil(raw),
    status: input.status,
    assumptions: [...new Set((input.assumptions ?? []).filter(Boolean))],
  };
}
