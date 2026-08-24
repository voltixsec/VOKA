import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { prisma } from "../lib/prisma";
import { decodeEtimCsv, parseEtimCsv } from "../features/universal-library/domain/taxonomy/EtimCsv";

const SOURCE_VERSION = "ETIM-10.0-EI";
const SOURCE_URL = "https://www.etim-international.com/downloads/?_sft_downloadcategory=model-releases";
const LICENSE_URL = "https://www.etim-international.com/classification/license-info/";
const MAX_GROUPS = 1_000;
const MAX_CLASSES = 10_000;

function argument(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((entry) => entry.startsWith(prefix))?.slice(prefix.length);
}

function assertLocalDatabase() {
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error("DATABASE_URL is required.");
  const url = new URL(value);
  if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) || url.pathname.replace(/^\//, "") !== "voka") {
    throw new Error("ETIM import is restricted to the local development voka database.");
  }
}

async function load(directory: string, file: string) {
  const bytes = await readFile(resolve(directory, file));
  const [headers, ...rows] = parseEtimCsv(decodeEtimCsv(bytes));
  return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header.trim(), values[index]?.trim() ?? ""])));
}

async function main() {
  assertLocalDatabase();
  const directory = argument("directory");
  if (!directory) throw new Error("--directory=<extracted ETIM CSV directory> is required.");
  const apply = process.argv.includes("--apply");
  const groups = await load(directory, "ETIMARTGROUP.csv");
  const classes = await load(directory, "ETIMARTCLASS.csv");
  if (!groups.length || groups.length > MAX_GROUPS || !classes.length || classes.length > MAX_CLASSES) throw new Error("ETIM file counts are outside bounded expectations.");
  const groupCodes = new Set(groups.map((row) => row.ARTGROUPID));
  if (classes.some((row) => !groupCodes.has(row.ARTGROUPID))) throw new Error("ETIM class references an unknown group.");
  const summary = { mode: apply ? "APPLY" : "DRY_RUN", sourceVersion: SOURCE_VERSION, groups: groups.length, classes: classes.length, totalCategories: groups.length + classes.length };
  if (!apply) { console.log(JSON.stringify(summary)); return; }

  await prisma.$transaction(async (tx) => {
    const source = await tx.universalSource.upsert({
      where: { type_externalRef: { type: "ETIM_TAXONOMY", externalRef: SOURCE_VERSION } },
      create: {
        name: "ETIM International Classification", type: "ETIM_TAXONOMY", externalRef: SOURCE_VERSION,
        url: SOURCE_URL, licenseInfo: "Open Data Commons Attribution License 1.0",
        licenseReferenceUrl: LICENSE_URL, attributionRequired: true,
        verificationStatus: "SOURCE_VERIFIED", trustScore: 1, acquisitionMode: "MANUAL_FILE_IMPORT",
        commercialUseState: "ALLOWED", redistributionState: "ALLOWED", approvalState: "APPROVED",
        healthStatus: "HEALTHY", governanceNotes: "Official ETIM 10.0 English master taxonomy; attribution required. Taxonomy only, not product facts.",
      },
      update: { isActive: true, approvalState: "APPROVED", healthStatus: "HEALTHY", licenseReferenceUrl: LICENSE_URL },
    });
    for (const row of groups) {
      await tx.universalCategory.upsert({
        where: { code: `ETIM:${row.ARTGROUPID}` },
        create: { code: `ETIM:${row.ARTGROUPID}`, name: row.GROUPDESC, nameEn: row.GROUPDESC, sourceId: source.id, sourceExternalId: row.ARTGROUPID, sourceVersion: SOURCE_VERSION, sourceUrl: SOURCE_URL, description: "ETIM product group. Attribution: ETIM International, ODC-By 1.0." },
        update: { name: row.GROUPDESC, nameEn: row.GROUPDESC, sourceId: source.id, sourceExternalId: row.ARTGROUPID, sourceVersion: SOURCE_VERSION, sourceUrl: SOURCE_URL, isActive: true },
      });
    }
    const storedGroups = await tx.universalCategory.findMany({ where: { sourceId: source.id, sourceExternalId: { in: [...groupCodes] } }, select: { id: true, sourceExternalId: true } });
    const parentIds = new Map(storedGroups.map((record) => [record.sourceExternalId, record.id]));
    for (const row of classes) {
      await tx.universalCategory.upsert({
        where: { code: `ETIM:${row.ARTCLASSID}` },
        create: { code: `ETIM:${row.ARTCLASSID}`, name: row.ARTCLASSDESC, nameEn: row.ARTCLASSDESC, parentId: parentIds.get(row.ARTGROUPID), sourceId: source.id, sourceExternalId: row.ARTCLASSID, sourceVersion: SOURCE_VERSION, sourceUrl: SOURCE_URL, description: `ETIM product class version ${row.ARTCLASSVERSION || "unknown"}. Attribution: ETIM International, ODC-By 1.0.` },
        update: { name: row.ARTCLASSDESC, nameEn: row.ARTCLASSDESC, parentId: parentIds.get(row.ARTGROUPID), sourceId: source.id, sourceExternalId: row.ARTCLASSID, sourceVersion: SOURCE_VERSION, sourceUrl: SOURCE_URL, isActive: true },
      });
    }
  }, { timeout: 120_000 });
  console.log(JSON.stringify(summary));
}

main().catch((error) => { console.error(error instanceof Error ? error.message : "ETIM import failed."); process.exitCode = 1; }).finally(() => prisma.$disconnect());
