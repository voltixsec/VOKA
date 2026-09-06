import {
  BULK_IMPORT_ENTITY_TYPES,
  BULK_IMPORT_SCHEMA_VERSION,
  type BulkImportEntityType,
  type BulkImportRecordEnvelope,
} from "../../../domain/bulk-import/BulkImportContract";

import type { IJsonlLineReader } from "./JsonlLineReader";

export type JsonlParseErrorCode =
  | "MALFORMED_JSON"
  | "INVALID_SCHEMA_VERSION"
  | "INVALID_ENTITY_TYPE"
  | "INVALID_EXTERNAL_KEY"
  | "INVALID_PAYLOAD";

export interface JsonlParseError {
  code: JsonlParseErrorCode;
  message: string;
  lineNumber: number;
}

export interface JsonlValidResult {
  lineNumber: number;
  outcome: "valid";
  envelope: BulkImportRecordEnvelope;
}

export interface JsonlInvalidResult {
  lineNumber: number;
  outcome: "invalid";
  error: JsonlParseError;
}

export type JsonlParseResult = JsonlValidResult | JsonlInvalidResult;

const ENTITY_TYPES = new Set<string>(BULK_IMPORT_ENTITY_TYPES);

function hasOwn(
  value: Record<string, unknown>,
  key: string,
): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function invalid(
  lineNumber: number,
  code: JsonlParseErrorCode,
  message: string,
): JsonlInvalidResult {
  return {
    lineNumber,
    outcome: "invalid",
    error: {
      code,
      message,
      lineNumber,
    },
  };
}

function isEntityType(value: unknown): value is BulkImportEntityType {
  return typeof value === "string" && ENTITY_TYPES.has(value);
}

export class JsonlProcessor {
  public async *process(
    reader: IJsonlLineReader,
  ): AsyncIterable<JsonlParseResult> {
    for await (const { lineNumber, content } of reader.readLines()) {
      yield this.parseLine(content, lineNumber);
    }
  }

  public parseLine(
    content: string,
    lineNumber: number,
  ): JsonlParseResult {
    let parsed: unknown;

    try {
      parsed = JSON.parse(content);
    } catch (error) {
      return invalid(
        lineNumber,
        "MALFORMED_JSON",
        error instanceof Error ? error.message : "Malformed JSON",
      );
    }

    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return invalid(
        lineNumber,
        "INVALID_SCHEMA_VERSION",
        "Record envelope must be a JSON object with schemaVersion.",
      );
    }

    const source = parsed as Record<string, unknown>;

    if (source.schemaVersion !== BULK_IMPORT_SCHEMA_VERSION) {
      return invalid(
        lineNumber,
        "INVALID_SCHEMA_VERSION",
        `schemaVersion must equal "${BULK_IMPORT_SCHEMA_VERSION}".`,
      );
    }

    if (!isEntityType(source.entityType)) {
      return invalid(
        lineNumber,
        "INVALID_ENTITY_TYPE",
        "entityType is not an approved Bulk Import entity type.",
      );
    }

    if (
      typeof source.externalKey !== "string" ||
      source.externalKey.trim().length === 0
    ) {
      return invalid(
        lineNumber,
        "INVALID_EXTERNAL_KEY",
        "externalKey must be a non-empty string.",
      );
    }

    if (
      !hasOwn(source, "payload") ||
      typeof source.payload !== "object" ||
      source.payload === null ||
      Array.isArray(source.payload)
    ) {
      return invalid(
        lineNumber,
        "INVALID_PAYLOAD",
        "payload must be a present, non-null JSON object and must not be an array.",
      );
    }

    const envelope: BulkImportRecordEnvelope = {
      schemaVersion: BULK_IMPORT_SCHEMA_VERSION,
      entityType: source.entityType,
      externalKey: source.externalKey,
      payload: source.payload as Record<string, unknown>,
    };

    if (hasOwn(source, "sourceRecordId")) {
      envelope.sourceRecordId =
        source.sourceRecordId as BulkImportRecordEnvelope["sourceRecordId"];
    }

    if (hasOwn(source, "sourceUpdatedAt")) {
      envelope.sourceUpdatedAt =
        source.sourceUpdatedAt as BulkImportRecordEnvelope["sourceUpdatedAt"];
    }

    if (hasOwn(source, "observedAt")) {
      envelope.observedAt =
        source.observedAt as BulkImportRecordEnvelope["observedAt"];
    }

    if (hasOwn(source, "identifiers")) {
      envelope.identifiers =
        source.identifiers as BulkImportRecordEnvelope["identifiers"];
    }

    if (hasOwn(source, "aliases")) {
      envelope.aliases =
        source.aliases as BulkImportRecordEnvelope["aliases"];
    }

    if (hasOwn(source, "attributes")) {
      envelope.attributes =
        source.attributes as BulkImportRecordEnvelope["attributes"];
    }

    if (hasOwn(source, "marketRelevance")) {
      envelope.marketRelevance =
        source.marketRelevance as BulkImportRecordEnvelope["marketRelevance"];
    }

    if (hasOwn(source, "evidence")) {
      envelope.evidence =
        source.evidence as BulkImportRecordEnvelope["evidence"];
    }

    return {
      lineNumber,
      outcome: "valid",
      envelope,
    };
  }
}
