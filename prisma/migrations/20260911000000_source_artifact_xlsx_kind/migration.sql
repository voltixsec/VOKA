-- Phase 2A-6: structured .xlsx workbooks become an inspectable source artifact kind.
--
-- Additive only: the new enum value does not change any existing row, column,
-- constraint, or index. Postgres allows a new enum value to be added inside a
-- transaction as long as the value is not used in that same transaction, which
-- is the case here.
ALTER TYPE "SourceArtifactKind" ADD VALUE IF NOT EXISTS 'XLSX';
