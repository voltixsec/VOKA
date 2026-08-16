import { isQuotationScopeType } from "../../../domain/quotation";
import {
  SALES_ASSISTANT_MAX_LINES,
  type ExtractedLineItem,
  type ExtractedSalesIntent,
  type SalesAssistantSourceLocale,
  type SalesItemIntent,
} from "./AISalesAssistantDto";

const ROOT_KEYS = new Set([
  "sourceLocale",
  "customerMention",
  "customerEmail",
  "customerPhone",
  "projectName",
  "subject",
  "attentionName",
  "brief",
  "scopeType",
  "scopeOfWork",
  "warranty",
  "paymentTerms",
  "currencyCode",
  "lines",
  "notes",
  "uncertainty",
  "warnings",
]);

const LINE_KEYS = new Set([
  "text",
  "description",
  "quantity",
  "requestedUnitText",
  "requestedPrice",
  "typeIntent",
  "uncertainty",
  "warnings",
]);

class InvalidProviderOutput extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assertKnownKeys(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
): void {
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    throw new InvalidProviderOutput();
  }
}

function optionalString(
  value: unknown,
  maxLength: number,
): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") throw new InvalidProviderOutput();

  const normalized = value.trim();
  if (normalized.length > maxLength) throw new InvalidProviderOutput();
  return normalized || null;
}

function optionalLocale(
  value: unknown,
): SalesAssistantSourceLocale | undefined {
  if (value === undefined) return undefined;
  if (value === "ar" || value === "en") return value;
  throw new InvalidProviderOutput();
}

function optionalNumber(
  value: unknown,
  options: { min: number; max: number },
): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < options.min ||
    value > options.max
  ) {
    throw new InvalidProviderOutput();
  }
  return value;
}

function optionalWarnings(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 10) {
    throw new InvalidProviderOutput();
  }

  return value.map((warning) => {
    const parsed = optionalString(warning, 240);
    if (!parsed) throw new InvalidProviderOutput();
    return parsed;
  });
}

function parseLine(value: unknown): ExtractedLineItem {
  if (!isRecord(value)) throw new InvalidProviderOutput();
  assertKnownKeys(value, LINE_KEYS);

  const text = optionalString(value.text, 500);
  if (!text) throw new InvalidProviderOutput();

  let typeIntent: SalesItemIntent | undefined;
  if (value.typeIntent !== undefined) {
    if (
      value.typeIntent !== "PRODUCT" &&
      value.typeIntent !== "SERVICE" &&
      value.typeIntent !== "CUSTOM" &&
      value.typeIntent !== "UNKNOWN"
    ) {
      throw new InvalidProviderOutput();
    }
    typeIntent = value.typeIntent;
  }

  return {
    text,
    description: optionalString(value.description, 1_000),
    quantity: optionalNumber(value.quantity, {
      min: 0.001,
      max: 1_000_000,
    }),
    requestedUnitText: optionalString(value.requestedUnitText, 80),
    requestedPrice: optionalNumber(value.requestedPrice, {
      min: 0,
      max: 1_000_000_000,
    }),
    typeIntent,
    uncertainty: optionalString(value.uncertainty, 500),
    warnings: optionalWarnings(value.warnings),
  };
}

export function validateExtractedSalesIntent(
  value: unknown,
): ExtractedSalesIntent | null {
  try {
    if (!isRecord(value)) throw new InvalidProviderOutput();
    assertKnownKeys(value, ROOT_KEYS);

    if (
      !Array.isArray(value.lines) ||
      value.lines.length > SALES_ASSISTANT_MAX_LINES
    ) {
      throw new InvalidProviderOutput();
    }

    const scopeType =
      value.scopeType === undefined
        ? undefined
        : value.scopeType === null
          ? null
          : isQuotationScopeType(value.scopeType)
            ? value.scopeType
            : (() => {
                throw new InvalidProviderOutput();
              })();

    let currencyCode = optionalString(value.currencyCode, 3);
    if (currencyCode && !/^[A-Za-z]{3}$/.test(currencyCode)) {
      throw new InvalidProviderOutput();
    }
    currencyCode = currencyCode?.toUpperCase() ?? currencyCode;

    return {
      sourceLocale: optionalLocale(value.sourceLocale),
      customerMention: optionalString(value.customerMention, 300),
      customerEmail: optionalString(value.customerEmail, 320),
      customerPhone: optionalString(value.customerPhone, 80),
      projectName: optionalString(value.projectName, 300),
      subject: optionalString(value.subject, 300),
      attentionName: optionalString(value.attentionName, 200),
      brief: optionalString(value.brief, 2_000),
      scopeType,
      scopeOfWork: optionalString(value.scopeOfWork, 2_000),
      warranty: optionalString(value.warranty, 1_000),
      paymentTerms: optionalString(value.paymentTerms, 1_000),
      currencyCode,
      lines: value.lines.map(parseLine),
      notes: optionalString(value.notes, 2_000),
      uncertainty: optionalString(value.uncertainty, 500),
      warnings: optionalWarnings(value.warnings),
    };
  } catch {
    return null;
  }
}
