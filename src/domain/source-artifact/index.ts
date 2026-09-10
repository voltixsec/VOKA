export const SUPPORTED_SOURCE_ARTIFACT_MIME_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
]);

export type SourceArtifactContext = "SALES_ASSISTANT" | "TAKEOFF" | "ENGINEERING_TENDER";
export type SourceArtifactKind = "PDF" | "IMAGE";

export class SourceArtifactPolicyError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "SourceArtifactPolicyError";
  }
}

export function artifactKindForMime(mimeType: string): SourceArtifactKind {
  if (mimeType === "application/pdf") return "PDF";
  if (mimeType.startsWith("image/")) return "IMAGE";
  throw new SourceArtifactPolicyError("SOURCE_ARTIFACT_TYPE_UNSUPPORTED", "Only PDF, PNG, JPG/JPEG, and WebP files are supported.");
}

export function validateSourceArtifactInput(file: File, contextValue: unknown) {
  const mimeType = file.type.toLowerCase();
  if (!SUPPORTED_SOURCE_ARTIFACT_MIME_TYPES.has(mimeType)) {
    throw new SourceArtifactPolicyError("SOURCE_ARTIFACT_TYPE_UNSUPPORTED", "Only PDF, PNG, JPG/JPEG, and WebP files are supported.");
  }
  const maxBytes = 25 * 1024 * 1024;
  if (!Number.isInteger(file.size) || file.size <= 0 || file.size > maxBytes) {
    throw new SourceArtifactPolicyError("SOURCE_ARTIFACT_SIZE_INVALID", "The attachment must be between 1 byte and 25 MB.");
  }
  const context = contextValue === "TAKEOFF" || contextValue === "ENGINEERING_TENDER" ? contextValue : "SALES_ASSISTANT";
  return { mimeType, kind: artifactKindForMime(mimeType), context } as const;
}

export function validateSourceArtifactBytes(kind: SourceArtifactKind, bytes: Uint8Array) {
  const ascii = (start: number, length: number) => String.fromCharCode(...bytes.slice(start, start + length));
  const valid = kind === "PDF"
    ? ascii(0, 5) === "%PDF-"
    : kind === "IMAGE" && (
      (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47)
      || (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
      || (ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP")
    );
  if (!valid) throw new SourceArtifactPolicyError("SOURCE_ARTIFACT_CONTENT_INVALID", "The attachment content does not match its declared file type.");
}

export type ArtifactPage = { pageNumber: number; text: string; characterCount: number };
export type ExtractedPdf = { text: string; pages: ArtifactPage[] };
