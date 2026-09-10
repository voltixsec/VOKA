-- Explicit governed bootstrap of major commercial ROOT categories only.
-- Does not create products, does not reparent existing trees.

INSERT INTO "UniversalCategory" ("id", "parentId", "code", "name", "nameAr", "nameEn", "isActive", "createdAt", "updatedAt")
SELECT 'ucl-root-construction-contracting', NULL, 'CONSTRUCTION_CONTRACTING', 'Construction & Contracting', 'المقاولات والإنشاءات', 'Construction & Contracting', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM "UniversalCategory"
  WHERE "parentId" IS NULL AND (
    "code" = 'CONSTRUCTION_CONTRACTING'
    OR "nameEn" = 'Construction & Contracting'
    OR "nameAr" = 'المقاولات والإنشاءات'
  )
);

INSERT INTO "UniversalCategory" ("id", "parentId", "code", "name", "nameAr", "nameEn", "isActive", "createdAt", "updatedAt")
SELECT 'ucl-root-hospitality', NULL, 'HOSPITALITY', 'Hospitality', 'الضيافة والفنادق', 'Hospitality', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM "UniversalCategory"
  WHERE "parentId" IS NULL AND (
    "code" = 'HOSPITALITY'
    OR "nameEn" = 'Hospitality'
    OR "nameAr" = 'الضيافة والفنادق'
  )
);

INSERT INTO "UniversalCategory" ("id", "parentId", "code", "name", "nameAr", "nameEn", "isActive", "createdAt", "updatedAt")
SELECT 'ucl-root-security-surveillance', NULL, 'SECURITY_SURVEILLANCE', 'Security & Surveillance Systems', 'أنظمة الأمن والمراقبة', 'Security & Surveillance Systems', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM "UniversalCategory"
  WHERE "parentId" IS NULL AND (
    "code" = 'SECURITY_SURVEILLANCE'
    OR "nameEn" = 'Security & Surveillance Systems'
    OR "nameAr" = 'أنظمة الأمن والمراقبة'
  )
);

INSERT INTO "UniversalCategory" ("id", "parentId", "code", "name", "nameAr", "nameEn", "isActive", "createdAt", "updatedAt")
SELECT 'ucl-root-it-networking', NULL, 'IT_NETWORKING', 'IT & Networking', 'تقنية المعلومات والشبكات', 'IT & Networking', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM "UniversalCategory"
  WHERE "parentId" IS NULL AND (
    "code" = 'IT_NETWORKING'
    OR "nameEn" = 'IT & Networking'
    OR "nameAr" = 'تقنية المعلومات والشبكات'
  )
);

INSERT INTO "UniversalCategory" ("id", "parentId", "code", "name", "nameAr", "nameEn", "isActive", "createdAt", "updatedAt")
SELECT 'ucl-root-electrical-power', NULL, 'ELECTRICAL_POWER', 'Electrical & Power', 'الكهرباء والطاقة', 'Electrical & Power', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM "UniversalCategory"
  WHERE "parentId" IS NULL AND (
    "code" = 'ELECTRICAL_POWER'
    OR "nameEn" = 'Electrical & Power'
    OR "nameAr" = 'الكهرباء والطاقة'
  )
);

INSERT INTO "UniversalCategory" ("id", "parentId", "code", "name", "nameAr", "nameEn", "isActive", "createdAt", "updatedAt")
SELECT 'ucl-root-hvac-mechanical', NULL, 'HVAC_MECHANICAL', 'HVAC & Mechanical', 'التكييف والميكانيكا', 'HVAC & Mechanical', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM "UniversalCategory"
  WHERE "parentId" IS NULL AND (
    "code" = 'HVAC_MECHANICAL'
    OR "nameEn" = 'HVAC & Mechanical'
    OR "nameAr" = 'التكييف والميكانيكا'
  )
);
