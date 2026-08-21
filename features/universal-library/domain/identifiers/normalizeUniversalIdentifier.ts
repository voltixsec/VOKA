import type { UniversalIdentifierType } from "../../../../lib/generated/prisma/client";

export interface UniversalIdentifierScope {
  manufacturerId?: string;
  source?: string;
}

export class InvalidUniversalIdentifierError extends Error {
  constructor(
    public readonly code:
      | "INVALID_IDENTIFIER_VALUE"
      | "IDENTIFIER_MANUFACTURER_REQUIRED"
      | "IDENTIFIER_SOURCE_REQUIRED"
  ) {
    super(code);
  }
}

export function normalizeUniversalIdentifier(
  identifierType: UniversalIdentifierType,
  value: string,
  scope: UniversalIdentifierScope = {}
): { normalizedValue: string; manufacturerId?: string; source?: string } {
  const trimmed = value.trim();
  if (!trimmed) throw new InvalidUniversalIdentifierError("INVALID_IDENTIFIER_VALUE");

  if (["GTIN", "GTIN_8", "GTIN_12", "GTIN_13", "GTIN_14", "EAN", "UPC"].includes(identifierType)) {
    const normalizedValue = trimmed.replace(/[\s-]+/g, "");
    const validLengths: Partial<Record<UniversalIdentifierType, number[]>> = {
      GTIN: [8, 12, 13, 14],
      GTIN_8: [8],
      GTIN_12: [12],
      GTIN_13: [13],
      GTIN_14: [14],
      EAN: [8, 13],
      UPC: [12],
    };
    if (!/^\d+$/.test(normalizedValue) || !validLengths[identifierType]?.includes(normalizedValue.length)) {
      throw new InvalidUniversalIdentifierError("INVALID_IDENTIFIER_VALUE");
    }
    return { normalizedValue };
  }

  if (identifierType === "MPN" || identifierType === "MODEL_NO") {
    const manufacturerId = scope.manufacturerId?.trim();
    if (!manufacturerId) {
      throw new InvalidUniversalIdentifierError("IDENTIFIER_MANUFACTURER_REQUIRED");
    }
    return {
      normalizedValue: trimmed.replace(/\s+/g, " ").toUpperCase(),
      manufacturerId,
    };
  }

  const source = scope.source?.trim();
  if (!source) throw new InvalidUniversalIdentifierError("IDENTIFIER_SOURCE_REQUIRED");
  return { normalizedValue: trimmed, source };
}
