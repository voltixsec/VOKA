CREATE TYPE "UniversalItemType" AS ENUM (
  'PRODUCT',
  'SERVICE',
  'SYSTEM',
  'SOLUTION',
  'SHIPPING',
  'LABOR',
  'DISCOUNT',
  'CUSTOM'
);

ALTER TABLE "UniversalCatalogItem"
ALTER COLUMN "type" TYPE "UniversalItemType"
USING ("type"::text::"UniversalItemType");
