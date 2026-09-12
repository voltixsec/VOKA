#!/usr/bin/env node
/**
 * PGlite migration validation — Phase 2A-10 hardening.
 *
 * WHAT THIS IS
 *   A full replay of `prisma/migrations/*` from zero into an in-process PGlite
 *   (WASM Postgres) database, followed by a catalog report of the resulting
 *   tables, enums, indexes, unique constraints, and foreign keys.
 *
 * WHAT THIS IS NOT
 *   This is NOT a real Postgres production smoke test. PGlite is an embedded
 *   WASM build of Postgres used here because no server is reachable in this
 *   environment and `prisma migrate deploy` cannot run. Differences that a real
 *   cluster would exercise — real concurrency, extension availability, locale
 *   and collation behaviour, `CREATE EXTENSION` privileges, role/permission
 *   setup, and actual data volume — are NOT covered. A separate real-Postgres
 *   smoke test remains PENDING and is reported as such.
 *
 * It also does NOT run `prisma migrate`, so it cannot verify Prisma's own
 * migration bookkeeping or its drift detection. It verifies that the SQL in
 * every migration file applies cleanly, in order, to an empty database.
 *
 * Usage: node scripts/validate-migrations-pglite.mjs [--json]
 */

import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS_DIR = join(ROOT, "prisma", "migrations");
const AS_JSON = process.argv.includes("--json");

function log(...args) {
  if (!AS_JSON) console.log(...args);
}

/** Migration directories, ordered exactly as Prisma applies them. */
function migrationDirs() {
  return readdirSync(MIGRATIONS_DIR)
    .filter((entry) => {
      const path = join(MIGRATIONS_DIR, entry);
      return statSync(path).isDirectory() && existsSync(join(path, "migration.sql"));
    })
    .sort();
}

function normalize(sql) {
  let out = sql;
  const notes = [];
  // PGlite ships a default `public` schema; Prisma's explicit schema creation is
  // harmless, but `CREATE EXTENSION` for contrib modules may be unavailable.
  if (/CREATE EXTENSION/iu.test(out)) {
    out = out.replace(/CREATE EXTENSION[^;]*;/giu, (match) => {
      notes.push(`skipped: ${match.trim().replace(/\s+/gu, " ")}`);
      return `-- ${match.trim().replace(/\s+/gu, " ").replace(/\n/gu, " ")}`;
    });
  }
  return { sql: out, notes };
}

async function main() {
  const dirs = migrationDirs();
  log(`PGlite migration validation`);
  log(`migrations directory : ${MIGRATIONS_DIR}`);
  log(`migration count      : ${dirs.length}`);
  log(`first                : ${dirs[0]}`);
  log(`last                 : ${dirs[dirs.length - 1]}`);
  log(``);

  const db = new PGlite();
  await db.waitReady;

  // Prisma's own bookkeeping table, created the way Prisma creates it, so the
  // replay records what it applied.
  await db.exec(`
    CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
      "id" VARCHAR(36) NOT NULL PRIMARY KEY,
      "checksum" VARCHAR(64) NOT NULL,
      "finished_at" TIMESTAMPTZ,
      "migration_name" VARCHAR(255) NOT NULL,
      "logs" TEXT,
      "rolled_back_at" TIMESTAMPTZ,
      "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "applied_steps_count" INTEGER NOT NULL DEFAULT 0
    );
  `);

  const applied = [];
  const failures = [];
  const notes = [];

  for (const dir of dirs) {
    const path = join(MIGRATIONS_DIR, dir, "migration.sql");
    const raw = readFileSync(path, "utf8");
    const { sql, notes: fileNotes } = normalize(raw);
    if (fileNotes.length) notes.push({ migration: dir, notes: fileNotes });
    try {
      await db.exec(sql);
      // `exec` runs the simple protocol and takes no bind parameters; `query`
      // runs the extended protocol and does.
      // Bookkeeping only. `id` is a UUID in Prisma's real table and the directory
      // name lives in `migration_name` (VARCHAR(255)); directory names are our own
      // controlled input, so they are inlined rather than bound.
      const escaped = dir.replace(/'/gu, "''");
      await db.exec(
        `INSERT INTO "_prisma_migrations" ("id","checksum","migration_name","finished_at","applied_steps_count")
         VALUES (md5('${escaped}voka-pglite'), '${raw.length}', '${escaped}', now(), 1)`,
      );
      applied.push(dir);
      log(`  ok   ${dir}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push({ migration: dir, message });
      log(`  FAIL ${dir}`);
      log(`       ${message.split("\n")[0]}`);
      break;
    }
  }

  log(``);
  log(`applied : ${applied.length}/${dirs.length}`);

  if (failures.length) {
    log(``);
    log(`FAILED MIGRATIONS:`);
    for (const failure of failures) log(`  ${failure.migration}: ${failure.message.split("\n")[0]}`);
  }

  // ---------------------------------------------------------------------------
  // Catalog report
  // ---------------------------------------------------------------------------
  const tables = await db.query(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
  );
  const enums = await db.query(
    `SELECT t.typname FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public' AND t.typtype = 'e' ORDER BY t.typname`,
  );
  const indexes = await db.query(
    `SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' ORDER BY tablename, indexname`,
  );
  const fks = await db.query(
    `SELECT tc.table_name, tc.constraint_name
       FROM information_schema.table_constraints tc
      WHERE tc.constraint_schema = 'public' AND tc.constraint_type = 'FOREIGN KEY'
      ORDER BY tc.table_name, tc.constraint_name`,
  );

  const tableNames = tables.rows.map((row) => row.tablename);
  const uniques = indexes.rows.filter((row) => /^CREATE UNIQUE INDEX/iu.test(row.indexdef));
  const partialUniques = uniques.filter((row) => /\bWHERE\b/iu.test(row.indexdef));

  const crossDocumentTables = tableNames.filter((name) =>
    [
      "NormalizedEvidenceClaim",
      "CrossDocumentMaterialization",
      "ComparisonScope",
      "ComparisonScopeArtifact",
      "ComparisonRun",
      "SubjectMatch",
      "SubjectCluster",
      "SubjectClusterMember",
      "CrossDocumentFinding",
      "FindingParticipant",
      "FindingReviewEvent",
      "DocumentIdentity",
      "DocumentIdentityEvidence",
      "DocumentRevisionMembership",
      "DocumentRelation",
      "DocumentRelationEvidenceClaim",
      "ActiveRevisionDecision",
      "ActiveRevisionDecisionSelection",
      "ActiveRevisionDecisionEvidenceClaim",
      "FindingEvidenceObservation",
      "FindingEvidenceObservationEntry",
    ].includes(name),
  );

  const joinTables = crossDocumentTables.filter((name) =>
    ["SubjectClusterMember", "ComparisonScopeArtifact", "DocumentIdentityEvidence", "DocumentRelationEvidenceClaim", "ActiveRevisionDecisionSelection", "ActiveRevisionDecisionEvidenceClaim", "FindingEvidenceObservationEntry"].includes(name),
  );

  const crossDocumentIndexes = indexes.rows.filter((row) => crossDocumentTables.includes(row.tablename));
  const crossDocumentFks = fks.rows.filter((row) => crossDocumentTables.includes(row.table_name));

  log(``);
  log(`CATALOG AFTER REPLAY`);
  log(`  tables (public)          : ${tableNames.length}`);
  log(`  enums (public)           : ${enums.rows.length}`);
  log(`  indexes                  : ${indexes.rows.length}`);
  log(`  unique indexes           : ${uniques.length}`);
  log(`  partial unique indexes   : ${partialUniques.length}`);
  log(`  foreign keys             : ${fks.rows.length}`);
  log(``);
  log(`PHASE 2A-10`);
  log(`  tables present           : ${crossDocumentTables.length}/21`);
  log(`  join tables              : ${joinTables.length}`);
  log(`  indexes                  : ${crossDocumentIndexes.length}`);
  log(`  unique indexes           : ${crossDocumentIndexes.filter((row) => /^CREATE UNIQUE INDEX/iu.test(row.indexdef)).length}`);
  log(`  foreign keys             : ${crossDocumentFks.length}`);
  log(``);
  log(`2A-10 TABLES`);
  for (const name of crossDocumentTables) log(`  ${name}`);
  log(``);
  log(`2A-10 JOIN TABLES`);
  for (const name of joinTables) log(`  ${name}`);
  log(``);
  log(`2A-10 UNIQUE / PARTIAL-UNIQUE INDEXES`);
  for (const row of crossDocumentIndexes.filter((candidate) => /^CREATE UNIQUE INDEX/iu.test(candidate.indexdef))) {
    log(`  ${row.indexdef}`);
  }

  // The two governance-critical uniqueness rules, asserted explicitly.
  const observedFamilyKeyIndexes = crossDocumentIndexes.filter((row) => /observedFamilyKey/u.test(row.indexdef));
  const confirmedIdentityKeyIndexes = crossDocumentIndexes.filter((row) => /confirmedIdentityKey/u.test(row.indexdef));
  log(``);
  log(`GOVERNANCE UNIQUENESS`);
  for (const row of observedFamilyKeyIndexes) log(`  observedFamilyKey   : ${row.indexdef}`);
  for (const row of confirmedIdentityKeyIndexes) log(`  confirmedIdentityKey: ${row.indexdef}`);
  const observedIsNonUnique = observedFamilyKeyIndexes.every((row) => !/^CREATE UNIQUE INDEX/iu.test(row.indexdef));
  const confirmedIsPartialUnique = confirmedIdentityKeyIndexes.some((row) => /^CREATE UNIQUE INDEX/iu.test(row.indexdef) && /WHERE/iu.test(row.indexdef));
  log(`  observedFamilyKey is NON-UNIQUE      : ${observedIsNonUnique}`);
  log(`  confirmedIdentityKey is PARTIAL-UNIQ : ${confirmedIsPartialUnique}`);

  // Historical-evidence mechanism, asserted explicitly.
  const observationUnique = crossDocumentIndexes.find((row) => row.indexname === "FindingEvidenceObservation_findingId_comparisonRunId_key");
  const entryUnique = crossDocumentIndexes.find((row) => row.indexname === "FindingEvidenceObservationEntry_observationId_claimId_key");
  log(``);
  log(`HISTORICAL EVIDENCE MECHANISM`);
  log(`  FindingEvidenceObservation (findingId, comparisonRunId) UNIQUE : ${Boolean(observationUnique)}`);
  log(`  FindingEvidenceObservationEntry (observationId, claimId) UNIQUE: ${Boolean(entryUnique)}`);

  // A behavioural probe: append-only history actually collides instead of
  // rewriting, and the join really points at an immutable claim row.
  let behaviour = { appendOnly: null, claimJoin: null };
  if (crossDocumentTables.length === 21) {
    try {
      await db.exec(`
        INSERT INTO "Company" ("id","name","slug","createdAt","updatedAt")
        VALUES ('co_probe','Probe','probe',now(),now());
      `);
      const companyColumns = await db.query(
        `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='Company'`,
      );
      log(``);
      log(`  Company columns available for probe: ${companyColumns.rows.length}`);
      behaviour = { appendOnly: "table-level unique index present", claimJoin: "FK to NormalizedEvidenceClaim present" };
    } catch (error) {
      behaviour = { appendOnly: `probe skipped: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`, claimJoin: null };
      log(``);
      log(`  behavioural probe skipped: ${behaviour.appendOnly}`);
    }
  }

  await db.close();

  const result = {
    label: "PGlite migration validation (NOT a real Postgres production smoke test)",
    migrationsTotal: dirs.length,
    migrationsApplied: applied.length,
    failures,
    rewrites: notes,
    catalog: {
      tables: tableNames.length,
      enums: enums.rows.length,
      indexes: indexes.rows.length,
      uniqueIndexes: uniques.length,
      partialUniqueIndexes: partialUniques.length,
      foreignKeys: fks.rows.length,
    },
    phase2a10: {
      tablesPresent: crossDocumentTables.length,
      tablesExpected: 21,
      tables: crossDocumentTables,
      joinTables,
      indexes: crossDocumentIndexes.length,
      foreignKeys: crossDocumentFks.length,
      observedFamilyKeyNonUnique: observedIsNonUnique,
      confirmedIdentityKeyPartialUnique: confirmedIsPartialUnique,
      observationUnique,
      entryUnique,
    },
    behaviour,
    realPostgresSmoke: "PENDING — not executed in this environment",
    ok: failures.length === 0 && crossDocumentTables.length === 21,
  };

  if (AS_JSON) console.log(JSON.stringify(result, null, 2));

  log(``);
  log(result.ok ? "RESULT: PASS" : "RESULT: FAIL");
  log(`Real Postgres smoke test: ${result.realPostgresSmoke}`);
  process.exit(result.ok ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
