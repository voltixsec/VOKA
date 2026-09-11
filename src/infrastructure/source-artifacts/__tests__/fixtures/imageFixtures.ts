/**
 * Minimal image fixtures for 2A-3 vision tests.
 *
 * The bytes are magic-valid (PNG/JPEG/WebP signatures) so they pass ingest
 * validation. No test decodes them: providers are fixtures or mocked fetch,
 * and the live smoke test renders its own PNG via canvas.
 */

/** Valid 1x1 transparent PNG. */
export const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

/** Minimal JFIF header with SOI/EOI markers. */
export const JPEG_BYTES = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x60,
  0x00, 0x60, 0x00, 0x00, 0xff, 0xd9,
]);

/** Minimal RIFF/WEBP container header. */
export const WEBP_BYTES = Buffer.concat([
  Buffer.from("RIFF", "ascii"),
  Buffer.from([0x10, 0x00, 0x00, 0x00]),
  Buffer.from("WEBP", "ascii"),
  Buffer.alloc(16, 0),
]);

/** Magic-valid PNG bytes of the requested size for gate tests. */
export function pngBytesOfSize(size: number): Buffer {
  const bytes = Buffer.alloc(Math.max(size, PNG_BYTES.byteLength), 0);
  PNG_BYTES.copy(bytes, 0, 0, Math.min(size, PNG_BYTES.byteLength));
  return bytes.subarray(0, size);
}
