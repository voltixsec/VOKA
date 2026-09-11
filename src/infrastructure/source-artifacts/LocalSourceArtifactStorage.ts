import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

export type StoredSourceArtifact = { storageRef: string; sha256: string; sizeBytes: number };

const STORAGE_REF = /^[a-f0-9]{2}\/[a-f0-9]{64}$/u;

function root() {
  return process.env.VOKA_ARTIFACT_STORAGE_DIR?.trim() || path.join(process.cwd(), ".voka-storage", "source-artifacts");
}

/**
 * Content-addressed local storage seam.
 *
 * One hash maps to one blob that may be referenced by many SourceArtifact rows (duplicate uploads, different
 * filenames, different tenants). The seam therefore exposes no delete operation: removing a blob is only safe once
 * the database proves it has zero references, which is a use-case concern, not a storage-layer one.
 */
export class LocalSourceArtifactStorage {
  async put(bytes: Uint8Array, sha256 = createHash("sha256").update(bytes).digest("hex")): Promise<StoredSourceArtifact> {
    const storageRef = `${sha256.slice(0, 2)}/${sha256}`;
    const absolute = path.join(root(), storageRef);
    await mkdir(path.dirname(absolute), { recursive: true });
    const existing = await stat(absolute).catch(() => null);
    if (existing?.isFile() && existing.size === bytes.byteLength) return { storageRef, sha256, sizeBytes: bytes.byteLength };
    // Atomic publish: a crashed or concurrent write can never leave a partial blob at the content address.
    const temporary = `${absolute}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
    try {
      await writeFile(temporary, bytes, { flag: "wx" });
      await rename(temporary, absolute);
    } catch (error) {
      await rm(temporary, { force: true }).catch(() => undefined);
      throw error;
    }
    return { storageRef, sha256, sizeBytes: bytes.byteLength };
  }

  async get(storageRef: string) {
    if (!STORAGE_REF.test(storageRef)) throw new Error("SOURCE_ARTIFACT_STORAGE_REF_INVALID");
    return readFile(path.join(root(), storageRef));
  }
}
