import type { RawIngestionPayloadInput } from "../normalization/NormalizationPipelineService";
import type { BulkImportEntityType } from "./BulkImportContract";

const ITEM_TYPES = new Set([
  "PRODUCT",
  "SERVICE",
  "SYSTEM",
  "SOLUTION",
  "SHIPPING",
  "LABOR",
  "DISCOUNT",
  "CUSTOM",
]);

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function mapEntityType(
  entityType: string,
  payloadType: unknown,
): RawIngestionPayloadInput["type"] {
  const explicit = asString(payloadType)?.toUpperCase();
  if (explicit && ITEM_TYPES.has(explicit)) {
    return explicit as RawIngestionPayloadInput["type"];
  }

  switch (entityType) {
    case "SERVICE":
      return "SERVICE";
    case "SYSTEM":
      return "SYSTEM";
    case "SHIPPING":
      return "SHIPPING";
    case "LABOR":
      return "LABOR";
    case "DISCOUNT":
      return "DISCOUNT";
    case "PRODUCT_MODEL":
    case "ITEM":
      return "PRODUCT";
    default:
      return "CUSTOM";
  }
}

function mapIdentifiers(
  value: unknown,
): RawIngestionPayloadInput["identifiers"] {
  if (value == null) {
    return null;
  }

  if (!Array.isArray(value)) {
    throw new Error("Raw payload identifiers must be an array.");
  }

  return value.map((item) => {
    if (!isRecord(item)) {
      throw new Error("Raw payload contains a malformed identifier.");
    }

    const identifierType =
      asString(item.identifierType) ??
      asString(item.type) ??
      "";

    const identifierValue = asString(item.value) ?? "";

    return {
      identifierType,
      value: identifierValue,
      source: asString(item.source),
    };
  });
}

function mapAliases(
  value: unknown,
): RawIngestionPayloadInput["aliases"] {
  if (value == null) {
    return null;
  }

  if (!Array.isArray(value)) {
    throw new Error("Raw payload aliases must be an array.");
  }

  return value.map((item) => {
    if (!isRecord(item)) {
      throw new Error("Raw payload contains a malformed alias.");
    }

    return {
      alias: asString(item.alias) ?? asString(item.value) ?? "",
      locale: asString(item.locale),
      aliasType: asString(item.aliasType),
    };
  });
}

function mapAttributes(
  value: unknown,
): RawIngestionPayloadInput["attributes"] {
  if (value == null) {
    return null;
  }

  if (!Array.isArray(value)) {
    throw new Error("Raw payload attributes must be an array.");
  }

  return value.map((item) => {
    if (!isRecord(item)) {
      throw new Error("Raw payload contains a malformed attribute.");
    }

    const dataValue = item.value;
    if (
      typeof dataValue !== "string" &&
      typeof dataValue !== "number" &&
      typeof dataValue !== "boolean" &&
      !isRecord(dataValue)
    ) {
      throw new Error("Raw payload contains a malformed attribute.");
    }

    return {
      code: asString(item.code) ?? "",
      name: asString(item.name),
      dataType: asString(item.dataType),
      value: dataValue,
      unit: asString(item.unit),
    };
  });
}

export function mapBulkEnvelopeToRawPayload(
  rawPayload: Record<string, unknown>,
  entityType: string,
  externalKey: string,
): RawIngestionPayloadInput {
  const nested = isRecord(rawPayload.payload)
    ? rawPayload.payload
    : rawPayload;

  const name =
    asString(nested.name) ??
    asString(nested.nameEn) ??
    asString(nested.nameAr) ??
    asString(externalKey);

  return {
    name,
    nameAr: asString(nested.nameAr),
    nameEn: asString(nested.nameEn),
    description: asString(nested.description),
    descriptionAr: asString(nested.descriptionAr),
    descriptionEn: asString(nested.descriptionEn),
    type: mapEntityType(entityType, nested.type),
    categoryCode: asString(nested.categoryCode),
    categoryName: asString(nested.categoryName),
    manufacturerName:
      asString(nested.manufacturerName) ??
      asString(nested.manufacturer),
    manufacturerCode: asString(nested.manufacturerCode),
    brandName:
      asString(nested.brandName) ?? asString(nested.brand),
    brandCode: asString(nested.brandCode),
    familyName:
      asString(nested.familyName) ?? asString(nested.family),
    familyCode: asString(nested.familyCode),
    modelNumber: asString(nested.modelNumber),
    variantName: asString(nested.variantName),
    identifiers: mapIdentifiers(
      rawPayload.identifiers ?? nested.identifiers,
    ),
    aliases: mapAliases(rawPayload.aliases ?? nested.aliases),
    attributes: mapAttributes(
      rawPayload.attributes ?? nested.attributes,
    ),
  };
}

export function isBulkImportEntityType(
  value: string,
): value is BulkImportEntityType {
  return [
    "DOMAIN",
    "CATEGORY",
    "SYSTEM",
    "MANUFACTURER",
    "BRAND",
    "PRODUCT_FAMILY",
    "PRODUCT_MODEL",
    "ITEM",
    "SERVICE",
    "RELATION",
    "EVIDENCE",
    "SOURCE",
    "MARKET_RELEVANCE",
  ].includes(value);
}
