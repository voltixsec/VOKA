export interface DocumentVerificationTokenGenerator {
  generate(): string;
}

export function buildDocumentVerificationUrl(baseUrl: string, token: string): string {
  const normalizedBase = baseUrl.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(normalizedBase)) throw new Error("VOKA_PUBLIC_URL must be an absolute HTTP(S) URL.");
  if (!/^[A-Za-z0-9_-]{32,}$/.test(token)) throw new Error("Verification token is invalid.");
  return `${normalizedBase}/verify/${encodeURIComponent(token)}`;
}
