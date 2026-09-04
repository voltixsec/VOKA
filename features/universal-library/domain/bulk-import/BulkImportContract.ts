export const BULK_IMPORT_SCHEMA_VERSION = "1.0" as const;

export type BulkImportEntityType =
  | "DOMAIN"
  | "CATEGORY"
  | "SYSTEM"
  | "MANUFACTURER"
  | "BRAND"
  | "PRODUCT_FAMILY"
  | "PRODUCT_MODEL"
  | "ITEM"
  | "SERVICE"
  | "RELATION"
  | "EVIDENCE"
  | "SOURCE"
  | "MARKET_RELEVANCE";

export type BulkImportDeltaOutcome =
  | "NEW"
  | "UNCHANGED"
  | "CHANGED"
  | "CONFLICTED"
  | "NEEDS_REVIEW"
  | "DEPRECATED_SIGNAL";

export interface BulkImportBatchManifest {
  schemaVersion: typeof BULK_IMPORT_SCHEMA_VERSION;
  batchId: string;
  sourceNamespace: string;
  sourceVersion?: string | null;
  generatedAt?: string | null;
  observedAt?: string | null;
  notes?: string | null;
}

export interface BulkImportIdentifier {
  type: string;
  value: string;
  source?: string | null;
}

export interface BulkImportAlias {
  value: string;
  locale?: string | null;
  aliasType?: string | null;
}

export interface BulkImportAttribute {
  code: string;
  name?: string | null;
  value: unknown;
  unit?: string | null;
  dataType?: string | null;
  group?: string | null;
}

export interface BulkImportEvidence {
  url?: string | null;
  title?: string | null;
  publisher?: string | null;
  observedAt?: string | null;
  sourceRecordId?: string | null;
  licenseReference?: string | null;
  attribution?: string | null;
  confidence?: number | null;
}

export interface BulkImportMarketRelevance {
  countryCode?: string | null;
  regionCode?: string | null;
  relevance?: string | null;
  claimType?: string | null;
  confidence?: number | null;
  evidence?: BulkImportEvidence[];
}

export interface BulkImportRecordEnvelope {
  schemaVersion: typeof BULK_IMPORT_SCHEMA_VERSION;
  entityType: BulkImportEntityType;
  externalKey: string;
  sourceRecordId?: string | null;
  sourceUpdatedAt?: string | null;
  observedAt?: string | null;
  payload: Record<string, unknown>;
  identifiers?: BulkImportIdentifier[];
  aliases?: BulkImportAlias[];
  attributes?: BulkImportAttribute[];
  marketRelevance?: BulkImportMarketRelevance[];
  evidence?: BulkImportEvidence[];
}




