import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";
import { UCL6_MAX_RESPONSE_BYTES } from "../../domain";

export class AcquisitionNetworkError extends Error {
  constructor(public readonly code: string, message: string) { super(message); this.name = "AcquisitionNetworkError"; }
}

type Lookup = (hostname: string) => Promise<Array<{ address: string; family: number }>>;
type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

function ipv4Parts(address: string): number[] | null {
  const value = address.startsWith("::ffff:") ? address.slice(7) : address;
  const parts = value.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) return null;
  const numbers = parts.map(Number);
  return numbers.every((part) => part >= 0 && part <= 255) ? numbers : null;
}

export function isProhibitedAddress(address: string): boolean {
  const normalized = address.toLowerCase().split("%")[0];
  const v4 = ipv4Parts(normalized);
  if (v4) {
    const [a, b] = v4;
    return a === 0 || a === 10 || a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224;
  }
  if (isIP(normalized) !== 6) return true;
  return normalized === "::" || normalized === "::1" || normalized.startsWith("fc") ||
    normalized.startsWith("fd") || /^fe[89ab]/.test(normalized) ||
    normalized.startsWith("ff") || normalized.startsWith("2001:db8:");
}

export class SafeHttpJsonClient {
  constructor(
    private readonly fetcher: Fetcher = fetch,
    private readonly resolver: Lookup = async (hostname) => dnsLookup(hostname, { all: true, verbatim: true }),
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  ) {}

  public async getJson(input: { url: string; timeoutMs: number; maxRetries: number; maxRedirects?: number }): Promise<{ value: unknown; finalUrl: string; retryCount: number }> {
    const initial = this.parseUrl(input.url);
    const allowedOrigin = initial.origin;
    let current = initial;
    let redirects = 0;
    let retries = 0;
    while (true) {
      await this.assertPublicDestination(current);
      let response: Response;
      try {
        response = await this.fetcher(current.toString(), {
          method: "GET", redirect: "manual", credentials: "omit",
          headers: { Accept: "application/json", "User-Agent": "VOKA-UCL-Acquisition/1.0 (+controlled-source-governance)" },
          signal: AbortSignal.timeout(input.timeoutMs),
        });
      } catch {
        if (retries >= input.maxRetries) throw new AcquisitionNetworkError("NETWORK_FAILURE", "External source request failed.");
        retries++; await this.sleep(Math.min(250 * 2 ** (retries - 1), 2000)); continue;
      }
      if (response.status >= 300 && response.status < 400) {
        if (redirects >= (input.maxRedirects ?? 3)) throw new AcquisitionNetworkError("REDIRECT_LIMIT", "Redirect limit exceeded.");
        const location = response.headers.get("location");
        if (!location) throw new AcquisitionNetworkError("INVALID_REDIRECT", "Redirect location is missing.");
        const next = this.parseUrl(new URL(location, current).toString());
        if (next.origin !== allowedOrigin) throw new AcquisitionNetworkError("CROSS_ORIGIN_REDIRECT", "Redirect left the governed source origin.");
        current = next; redirects++; continue;
      }
      if (response.status === 429 || response.status >= 500) {
        if (retries >= input.maxRetries) throw new AcquisitionNetworkError("RETRY_EXHAUSTED", "External source retry limit exhausted.");
        retries++;
        const retryAfter = Number(response.headers.get("retry-after"));
        const delay = Number.isFinite(retryAfter) && retryAfter >= 0 ? Math.min(retryAfter * 1000, 5000) : Math.min(250 * 2 ** (retries - 1), 2000);
        await this.sleep(delay); continue;
      }
      if (!response.ok) throw new AcquisitionNetworkError("PERMANENT_HTTP_ERROR", "External source rejected the request.");
      const contentLength = Number(response.headers.get("content-length"));
      if (Number.isFinite(contentLength) && contentLength > UCL6_MAX_RESPONSE_BYTES) throw new AcquisitionNetworkError("RESPONSE_TOO_LARGE", "External response is too large.");
      const bytes = await this.readBounded(response);
      try { return { value: JSON.parse(new TextDecoder().decode(bytes)), finalUrl: current.toString(), retryCount: retries }; }
      catch { throw new AcquisitionNetworkError("MALFORMED_RESPONSE", "External response is not valid JSON."); }
    }
  }

  private parseUrl(raw: string): URL {
    let url: URL;
    try { url = new URL(raw); } catch { throw new AcquisitionNetworkError("INVALID_URL", "Source URL is invalid."); }
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new AcquisitionNetworkError("UNSAFE_SCHEME", "Only HTTP(S) sources are supported.");
    if (url.username || url.password) throw new AcquisitionNetworkError("URL_CREDENTIALS", "Source URL credentials are forbidden.");
    if (!url.hostname || url.hostname.toLowerCase() === "localhost" || url.hostname.endsWith(".localhost")) throw new AcquisitionNetworkError("PRIVATE_DESTINATION", "Private destinations are forbidden.");
    return url;
  }

  private async assertPublicDestination(url: URL): Promise<void> {
    const hostname = url.hostname.replace(/^\[|\]$/g, "");
    const direct = isIP(hostname) ? [{ address: hostname, family: isIP(hostname) }] : await this.resolver(hostname);
    if (!direct.length || direct.some(({ address }) => isProhibitedAddress(address))) throw new AcquisitionNetworkError("PRIVATE_DESTINATION", "Source resolved to a prohibited network.");
  }

  private async readBounded(response: Response): Promise<Uint8Array> {
    if (!response.body) return new Uint8Array();
    const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > UCL6_MAX_RESPONSE_BYTES) { await reader.cancel(); throw new AcquisitionNetworkError("RESPONSE_TOO_LARGE", "External response is too large."); }
      chunks.push(value);
    }
    const result = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
    return result;
  }
}
