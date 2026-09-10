import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export type StoredSourceArtifact = { storageRef: string; sha256: string; sizeBytes: number };

function root() {
  return process.env.VOKA_ARTIFACT_STORAGE_DIR?.trim() || path.join(process.cwd(), ".voka-storage", "source-artifacts");
}

export class LocalSourceArtifactStorage {
  async put(bytes: Uint8Array, sha256 = createHash("sha256").update(bytes).digest("hex")): Promise<StoredSourceArtifact> {
    const directory = root();
    await mkdir(directory, { recursive: true });
    const storageRef = `${sha256.slice(0, 2)}/${sha256}`;
    const absolute = path.join(directory, storageRef);
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, bytes, { flag: "wx" }).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "EEXIST") throw error;
    });
    return { storageRef, sha256, sizeBytes: bytes.byteLength };
  }

  async get(storageRef: string) {
    if (!/^[a-f0-9]{2}\/[a-f0-9]{64}$/u.test(storageRef)) throw new Error("SOURCE_ARTIFACT_STORAGE_REF_INVALID");
    return readFile(path.join(root(), storageRef));
  }

  async remove(storageRef: string) {
    await rm(path.join(root(), storageRef), { force: true });
  }
}
