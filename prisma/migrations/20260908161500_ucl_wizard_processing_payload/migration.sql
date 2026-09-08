-- PROCESSING is a leased normalization attempt, so its payload may be absent.
-- Keep normalized/matched/published data requirements and all terminal guards.
BEGIN;
ALTER TABLE "UniversalIngestionRecord"
  DROP CONSTRAINT "UniversalIngestionRecord_status_data_check",
  ADD CONSTRAINT "UniversalIngestionRecord_status_data_check" CHECK (
    ("status" NOT IN ('NORMALIZED', 'MATCHED', 'PUBLISHED') OR "normalizedData" IS NOT NULL)
    AND ("status" NOT IN ('MATCHED', 'PUBLISHED') OR "matchedItemId" IS NOT NULL)
    AND ("status" <> 'PROCESSING' OR "processingStartedAt" IS NOT NULL)
    AND ("status" <> 'PUBLISHED' OR "processedAt" IS NOT NULL)
    AND ("status" NOT IN ('REJECTED', 'FAILED') OR btrim(COALESCE("errorMessage", '')) <> '')
  );
COMMIT;
