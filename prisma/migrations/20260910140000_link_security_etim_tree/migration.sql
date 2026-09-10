-- Attach only the existing, explicitly identified alarm/surveillance ETIM group.
-- Preserve every category ID, descendant and item assignment. No product creation.
-- If the source was already governed elsewhere, leave it untouched for review.
UPDATE "UniversalCategory" AS existing
SET "parentId" = root.id, "updatedAt" = CURRENT_TIMESTAMP
FROM "UniversalCategory" AS root
WHERE root.code = 'SECURITY_SURVEILLANCE'
  AND root."parentId" IS NULL
  AND existing.code = 'ETIM:EG000054'
  AND existing."nameEn" = 'Alarm installations, emergency call and signalling'
  AND existing."parentId" IS NULL;
