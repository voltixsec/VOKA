import { normalizeUniversalIdentifier } from "../identifiers/normalizeUniversalIdentifier";
import type { UniversalIdentifierType } from "@/lib/generated/prisma/client";

const IDENTIFIER_TYPES = new Set<UniversalIdentifierType>([
  "GTIN", "GTIN_8", "GTIN_12", "GTIN_13", "GTIN_14", "EAN", "UPC", "MPN", "MODEL_NO", "EXTERNAL_ID",
]);
const MAX_COLLECTION_ENTRIES = 100;

export interface RawIngestionPayloadInput {
  name?: string | null;
  nameAr?: string | null;
  nameEn?: string | null;
  description?: string | null;
  descriptionAr?: string | null;
  descriptionEn?: string | null;
  type?: string | null;
  categoryCode?: string | null;
  categoryName?: string | null;
  manufacturerName?: string | null;
  manufacturerCode?: string | null;
  brandName?: string | null;
  brandCode?: string | null;
  familyName?: string | null;
  familyCode?: string | null;
  modelNumber?: string | null;
  variantName?: string | null;
  identifiers?: Array<{
    identifierType: string;
    value: string;
    source?: string | null;
  }> | null;
  aliases?: Array<{
    alias: string;
    locale?: string | null;
    aliasType?: string | null;
  }> | null;
  attributes?: Array<{
    code: string;
    name?: string | null;
    dataType?: string | null;
    value: string | number | boolean | Record<string, unknown>;
    unit?: string | null;
  }> | null;
}

export interface NormalizedIngestionPayload {
  name: string;
  nameAr: string | null;
  nameEn: string | null;
  description: string | null;
  descriptionAr: string | null;
  descriptionEn: string | null;
  type: "PRODUCT" | "SERVICE" | "SHIPPING" | "LABOR" | "DISCOUNT" | "CUSTOM";
  categoryCode: string | null;
  categoryName: string | null;
  manufacturerName: string | null;
  manufacturerCode: string | null;
  brandName: string | null;
  brandCode: string | null;
  familyName: string | null;
  familyCode: string | null;
  modelNumber: string | null;
  normalizedModelNumber: string | null;
  variantName: string | null;
  identifiers: Array<{
    identifierType: UniversalIdentifierType;
    value: string;
    normalizedValue: string;
    source: string | null;
  }>;
  aliases: Array<{
    alias: string;
    normalizedAlias: string;
    locale: "EN" | "AR" | null;
    aliasType: "MONIKER" | "SEARCH" | "SYNONYM" | "MPN" | "HISTORICAL" | "TRANSLITERATION";
  }>;
  attributes: Array<{
    code: string;
    name: string | null;
    dataType: "STRING" | "NUMBER" | "BOOLEAN" | "DECIMAL" | "SELECT" | "JSON";
    value: string | number | boolean | Record<string, unknown>;
    unit: string | null;
  }>;
}

function normalizeString(val?: string | null): string | null {
  if (!val) return null;
  const trimmed = val.normalize("NFC").replace(/\s+/g, " ").trim();
  return trimmed === "" ? null : trimmed;
}

function normalizeCasing(val?: string | null): string | null {
  const norm = normalizeString(val);
  return norm ? norm.toUpperCase() : null;
}

function normalizeLocale(val?: string | null): "EN" | "AR" | null {
  if (!val) return null;
  const upper = val.trim().toUpperCase();
  if (upper === "EN" || upper === "ENGLISH") return "EN";
  if (upper === "AR" || upper === "ARABIC") return "AR";
  throw new Error(`Unsupported alias locale '${val}'.`);
}

function normalizeAliasType(val?: string | null): "MONIKER" | "SEARCH" | "SYNONYM" | "MPN" | "HISTORICAL" | "TRANSLITERATION" {
  if (!val) return "SYNONYM";
  const upper = val.trim().toUpperCase();
  if (["MONIKER", "SEARCH", "SYNONYM", "MPN", "HISTORICAL", "TRANSLITERATION"].includes(upper)) {
    return upper as any;
  }
  throw new Error(`Unsupported alias type '${val}'.`);
}

function normalizeDataType(val?: string | null): "STRING" | "NUMBER" | "BOOLEAN" | "DECIMAL" | "SELECT" | "JSON" {
  if (!val) return "STRING";
  const upper = val.trim().toUpperCase();
  if (["STRING", "NUMBER", "BOOLEAN", "DECIMAL", "SELECT", "JSON"].includes(upper)) {
    return upper as any;
  }
  throw new Error(`Unsupported attribute data type '${val}'.`);
}

function normalizeUnit(unit?: string | null): string | null {
  const norm = normalizeString(unit);
  if (!norm) return null;
  const lower = norm.toLowerCase();
  if (lower === "kg" || lower === "kgs" || lower === "kilogram" || lower === "kilograms") return "kg";
  if (lower === "g" || lower === "gram" || lower === "grams") return "g";
  if (lower === "m" || lower === "meter" || lower === "meters") return "m";
  if (lower === "cm" || lower === "centimeter" || lower === "centimeters") return "cm";
  if (lower === "mm" || lower === "millimeter" || lower === "millimeters") return "mm";
  if (lower === "pcs" || lower === "pc" || lower === "piece" || lower === "pieces") return "pcs";
  return norm;
}

export class NormalizationPipelineService {
  public static normalize(
    payload: RawIngestionPayloadInput,
    context: { externalIdentifierSource?: string } = {}
  ): NormalizedIngestionPayload {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("Raw payload must be an object.");
    }
    const rawName = normalizeString(payload.name);
    const nameAr = normalizeString(payload.nameAr);
    const nameEn = normalizeString(payload.nameEn);

    const name = rawName || nameEn || nameAr;
    if (!name) {
      throw new Error("Raw payload must provide at least one valid non-empty item name (name, nameEn, or nameAr).");
    }

    let type: NormalizedIngestionPayload["type"] = "PRODUCT";
    if (payload.type) {
      const upperType = payload.type.trim().toUpperCase();
      if (["PRODUCT", "SERVICE", "SHIPPING", "LABOR", "DISCOUNT", "CUSTOM"].includes(upperType)) {
        type = upperType as any;
      } else {
        throw new Error(`Unsupported catalog item type '${payload.type}'.`);
      }
    }

    const description = normalizeString(payload.description);
    const descriptionAr = normalizeString(payload.descriptionAr);
    const descriptionEn = normalizeString(payload.descriptionEn);

    const categoryCode = normalizeCasing(payload.categoryCode);
    const categoryName = normalizeString(payload.categoryName);

    const manufacturerName = normalizeString(payload.manufacturerName);
    const manufacturerCode = normalizeCasing(payload.manufacturerCode);

    const brandName = normalizeString(payload.brandName);
    const brandCode = normalizeCasing(payload.brandCode);

    const familyName = normalizeString(payload.familyName);
    const familyCode = normalizeCasing(payload.familyCode);

    const modelNumber = normalizeString(payload.modelNumber);
    const normalizedModelNumber = normalizeCasing(modelNumber);

    const variantName = normalizeString(payload.variantName);

    // Identifiers normalization using UCL-2 normalizeUniversalIdentifier
    const normalizedIdentifiers: NormalizedIngestionPayload["identifiers"] = [];
    if (payload.identifiers && Array.isArray(payload.identifiers)) {
      if (payload.identifiers.length > MAX_COLLECTION_ENTRIES) {
        throw new Error("Raw payload contains too many identifiers.");
      }
      const seen = new Set<string>();
      for (const item of payload.identifiers) {
        if (!item || typeof item !== "object" || typeof item.identifierType !== "string" || typeof item.value !== "string") {
          throw new Error("Raw payload contains a malformed identifier.");
        }
        const typeUpper = item.identifierType.trim().toUpperCase() as UniversalIdentifierType;
        if (!IDENTIFIER_TYPES.has(typeUpper)) {
          throw new Error(`Unsupported identifier type '${item.identifierType}'.`);
        }
        const identifierSource = typeUpper === "EXTERNAL_ID"
          ? normalizeString(context.externalIdentifierSource)
          : null;
        const normResult = normalizeUniversalIdentifier(typeUpper, item.value, {
          manufacturerId: manufacturerCode || manufacturerName || undefined,
          source: identifierSource || undefined,
        });
        const key = `${typeUpper}:${normResult.manufacturerId || ""}:${normResult.source || ""}:${normResult.normalizedValue}`;
        if (!seen.has(key)) {
          seen.add(key);
          normalizedIdentifiers.push({
            identifierType: typeUpper,
            value: item.value.trim(),
            normalizedValue: normResult.normalizedValue,
            source: identifierSource,
          });
        }
      }
    } else if (payload.identifiers != null) {
      throw new Error("Raw payload identifiers must be an array.");
    }

    // Aliases normalization
    const normalizedAliases: NormalizedIngestionPayload["aliases"] = [];
    if (payload.aliases && Array.isArray(payload.aliases)) {
      if (payload.aliases.length > MAX_COLLECTION_ENTRIES) throw new Error("Raw payload contains too many aliases.");
      const seen = new Set<string>();
      for (const item of payload.aliases) {
        const aliasStr = normalizeString(item.alias);
        if (!aliasStr) continue;
        const locale = normalizeLocale(item.locale);
        const aliasType = normalizeAliasType(item.aliasType);
        const normAlias = aliasStr.toLowerCase();
        const key = `${normAlias}:${locale || "ALL"}:${aliasType}`;
        if (!seen.has(key)) {
          seen.add(key);
          normalizedAliases.push({
            alias: aliasStr,
            normalizedAlias: normAlias,
            locale,
            aliasType,
          });
        }
      }
    } else if (payload.aliases != null) {
      throw new Error("Raw payload aliases must be an array.");
    }

    // Attributes normalization
    const normalizedAttributes: NormalizedIngestionPayload["attributes"] = [];
    if (payload.attributes && Array.isArray(payload.attributes)) {
      if (payload.attributes.length > MAX_COLLECTION_ENTRIES) throw new Error("Raw payload contains too many attributes.");
      const seen = new Set<string>();
      for (const attr of payload.attributes) {
        const code = normalizeCasing(attr.code);
        if (!code) continue;
        if (seen.has(code)) continue;
        seen.add(code);

        const attrName = normalizeString(attr.name);
        const dataType = normalizeDataType(attr.dataType);
        const unit = normalizeUnit(attr.unit);

        if ((dataType === "NUMBER" || dataType === "DECIMAL") && (typeof attr.value !== "number" || !Number.isFinite(attr.value))) {
          throw new Error(`Attribute '${code}' requires a finite numeric value.`);
        }
        if (dataType === "BOOLEAN" && typeof attr.value !== "boolean") {
          throw new Error(`Attribute '${code}' requires a boolean value.`);
        }
        if (["STRING", "SELECT"].includes(dataType) && typeof attr.value !== "string") {
          throw new Error(`Attribute '${code}' requires a string value.`);
        }
        if (dataType === "JSON" && (attr.value === null || typeof attr.value !== "object" || Array.isArray(attr.value))) {
          throw new Error(`Attribute '${code}' requires an object value.`);
        }

        normalizedAttributes.push({
          code,
          name: attrName,
          dataType,
          value: attr.value,
          unit,
        });
      }
    } else if (payload.attributes != null) {
      throw new Error("Raw payload attributes must be an array.");
    }

    return {
      name,
      nameAr,
      nameEn,
      description,
      descriptionAr,
      descriptionEn,
      type,
      categoryCode,
      categoryName,
      manufacturerName,
      manufacturerCode,
      brandName,
      brandCode,
      familyName,
      familyCode,
      modelNumber,
      normalizedModelNumber,
      variantName,
      identifiers: normalizedIdentifiers,
      aliases: normalizedAliases,
      attributes: normalizedAttributes,
    };
  }
}
