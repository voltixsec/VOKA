ALTER TABLE "QuotationDelivery"
ADD COLUMN "actorUserId" TEXT,
ADD COLUMN "requestKey" TEXT,
ADD COLUMN "provider" TEXT,
ADD COLUMN "documentSha256" TEXT;

UPDATE "QuotationDelivery"
SET
  "requestKey" = "id",
  "provider" = 'UNKNOWN';

ALTER TABLE "QuotationDelivery"
ALTER COLUMN "requestKey" SET NOT NULL,
ALTER COLUMN "provider" SET NOT NULL;

CREATE UNIQUE INDEX "QuotationDelivery_companyId_requestKey_key"
ON "QuotationDelivery"("companyId", "requestKey");

CREATE INDEX "QuotationDelivery_actorUserId_idx"
ON "QuotationDelivery"("actorUserId");

ALTER TABLE "QuotationDelivery"
ADD CONSTRAINT "QuotationDelivery_actorUserId_fkey"
FOREIGN KEY ("actorUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
