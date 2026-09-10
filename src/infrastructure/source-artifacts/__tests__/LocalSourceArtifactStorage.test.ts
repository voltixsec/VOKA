import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LocalSourceArtifactStorage } from "../LocalSourceArtifactStorage";

describe("local source artifact storage", () => {
  it("retains and retrieves the exact bytes under a content-addressed reference", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "voka-source-artifact-"));
    const previous = process.env.VOKA_ARTIFACT_STORAGE_DIR;
    process.env.VOKA_ARTIFACT_STORAGE_DIR = directory;
    try {
      const storage = new LocalSourceArtifactStorage();
      const bytes = Buffer.from("%PDF-1.7\nreal bytes");
      const stored = await storage.put(bytes);
      expect(stored.sizeBytes).toBe(bytes.byteLength);
      expect(stored.storageRef).toMatch(/^[a-f0-9]{2}\/[a-f0-9]{64}$/u);
      await expect(storage.get(stored.storageRef)).resolves.toEqual(bytes);
      await storage.remove(stored.storageRef);
      await expect(storage.get(stored.storageRef)).rejects.toThrow();
    } finally {
      if (previous === undefined) delete process.env.VOKA_ARTIFACT_STORAGE_DIR;
      else process.env.VOKA_ARTIFACT_STORAGE_DIR = previous;
      await rm(directory, { recursive: true, force: true });
    }
  });
});
