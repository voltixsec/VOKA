import { createHash } from "node:crypto";
import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LocalSourceArtifactStorage } from "../LocalSourceArtifactStorage";

describe("shared content-addressed artifact storage", () => {
  let directory: string;
  beforeEach(() => { directory = mkdtempSync(path.join(tmpdir(), "voka-storage-")); process.env.VOKA_ARTIFACT_STORAGE_DIR = directory; });
  afterEach(() => { delete process.env.VOKA_ARTIFACT_STORAGE_DIR; });

  it("stores identical bytes once, idempotently, under their hash and never exposes a delete operation", async () => {
    const storage = new LocalSourceArtifactStorage();
    const bytes = Buffer.from("%PDF-1.4 shared bytes");
    const sha = createHash("sha256").update(bytes).digest("hex");
    const first = await storage.put(bytes);
    const second = await storage.put(bytes, sha);
    expect(first).toEqual({ storageRef: `${sha.slice(0, 2)}/${sha}`, sha256: sha, sizeBytes: bytes.byteLength });
    expect(second).toEqual(first);
    expect(readdirSync(path.join(directory, sha.slice(0, 2)))).toEqual([sha]);
    expect(await storage.get(first.storageRef)).toEqual(bytes);
    expect("remove" in storage).toBe(false);
  });

  it("rejects malformed storage references before touching the filesystem", async () => {
    await expect(new LocalSourceArtifactStorage().get("../../etc/passwd")).rejects.toThrow("SOURCE_ARTIFACT_STORAGE_REF_INVALID");
  });
});
