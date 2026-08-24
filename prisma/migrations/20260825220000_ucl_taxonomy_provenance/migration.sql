ALTER TABLE "UniversalCategory"
  ADD COLUMN "sourceId" TEXT,
  ADD COLUMN "sourceExternalId" TEXT,
  ADD COLUMN "sourceVersion" TEXT,
  ADD COLUMN "sourceUrl" TEXT;

CREATE UNIQUE INDEX "UniversalCategory_sourceId_sourceExternalId_key"
  ON "UniversalCategory"("sourceId", "sourceExternalId");
CREATE INDEX "UniversalCategory_sourceId_idx" ON "UniversalCategory"("sourceId");

ALTER TABLE "UniversalCategory"
  ADD CONSTRAINT "UniversalCategory_sourceId_fkey"
  FOREIGN KEY ("sourceId") REFERENCES "UniversalSource"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
