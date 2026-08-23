import crypto from "node:crypto";

export function computeSourceHash(text: string): string {
  return crypto.createHash("sha256").update(text.trim()).digest("hex");
}
