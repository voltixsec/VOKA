CREATE OR REPLACE FUNCTION "guardUniversalIngestionStatusTransition"()
RETURNS trigger AS $$
BEGIN
    IF NEW."status" = OLD."status" THEN
        RETURN NEW;
    END IF;

    IF
       (OLD."status" = 'RECEIVED'
        AND NEW."status" IN (
          'NORMALIZED',
          'MATCHED',
          'NEEDS_REVIEW',
          'REJECTED',
          'FAILED'
        ))

       OR
       (OLD."status" IN ('NORMALIZED', 'MATCHED')
        AND NEW."status" IN (
          'PROCESSING',
          'NEEDS_REVIEW',
          'REJECTED',
          'FAILED'
        ))

       OR
       (OLD."status" = 'PROCESSING'
        AND NEW."status" IN (
          'NEEDS_REVIEW',
          'REJECTED',
          'FAILED'
        ))

       OR
       (OLD."status" = 'PUBLISHED'
        AND NEW."status" = 'NEEDS_REVIEW')

       OR
       (OLD."status" = 'NEEDS_REVIEW'
        AND NEW."status" IN (
          'NORMALIZED',
          'MATCHED',
          'PUBLISHED',
          'REJECTED'
        ))

       OR
       (OLD."status" IN ('REJECTED', 'FAILED')
        AND NEW."status" IN (
          'NORMALIZED',
          'MATCHED',
          'NEEDS_REVIEW',
          'REJECTED',
          'FAILED'
        ))
    THEN
        RETURN NEW;
    END IF;

    RAISE EXCEPTION
      'invalid UniversalIngestionRecord status transition: % -> %',
      OLD."status",
      NEW."status";
END;
$$ LANGUAGE plpgsql;
