-- VOKA UCL Bulk Import Contract 1.0
-- Permit governed multi-entity staging while preserving identity integrity.
-- No canonical publication behavior is changed here.

ALTER TABLE "UniversalIngestionRecord"
DROP CONSTRAINT IF EXISTS "UniversalIngestionRecord_identity_check";

ALTER TABLE "UniversalIngestionRecord"
ADD CONSTRAINT "UniversalIngestionRecord_identity_check"
CHECK (
  btrim("sourceExternalId") <> ''
  AND "sourceExternalId" = btrim("sourceExternalId")
  AND "entityType" IN (
    'DOMAIN',
    'CATEGORY',
    'SYSTEM',
    'MANUFACTURER',
    'BRAND',
    'PRODUCT_FAMILY',
    'PRODUCT_MODEL',
    'ITEM',
    'SERVICE',
    'RELATION',
    'EVIDENCE',
    'SOURCE',
    'MARKET_RELEVANCE'
  )
  AND "payloadHash" ~ '^[0-9a-f]{64}$'
  AND "retryCount" >= 0
);

-- Permissive governed staging:
-- NEEDS_REVIEW may exist before normalization.
-- NORMALIZED / MATCHED / PROCESSING / PUBLISHED still require normalizedData.

ALTER TABLE "UniversalIngestionRecord"
DROP CONSTRAINT IF EXISTS "UniversalIngestionRecord_status_data_check";

ALTER TABLE "UniversalIngestionRecord"
ADD CONSTRAINT "UniversalIngestionRecord_status_data_check"
CHECK (
  (
    "status" NOT IN (
      'NORMALIZED',
      'MATCHED',
      'PROCESSING',
      'PUBLISHED'
    )
    OR "normalizedData" IS NOT NULL
  )
  AND (
    "status" NOT IN (
      'MATCHED',
      'PUBLISHED'
    )
    OR "matchedItemId" IS NOT NULL
  )
  AND (
    "status" <> 'PROCESSING'
    OR "processingStartedAt" IS NOT NULL
  )
  AND (
    "status" <> 'PUBLISHED'
    OR "processedAt" IS NOT NULL
  )
  AND (
    "status" NOT IN (
      'REJECTED',
      'FAILED'
    )
    OR btrim(COALESCE("errorMessage", '')) <> ''
  )
);