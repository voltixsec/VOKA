/**
 * Phase 2A-10 route context.
 *
 * Every cross-document route builds its context here, so all of them are
 * company-scoped in the same way and all of them read the locale the same way.
 * The locale is never inferred from document content: it comes from an explicit
 * `locale` query parameter, defaulting to English.
 */

import type { AuthorizedCompanyContext } from "@/lib/auth";
import { composeCrossDocumentDependencies, type CrossDocumentCompositionConfig } from "@/src/infrastructure/cross-document/compose";
import type { CrossDocumentContext } from "@/src/application/cross-document/CrossDocumentUseCases";
import type { Locale } from "@/src/domain/cross-document";

export function contextFor(input: {
  request: Request;
  actorUserId: string;
  company: AuthorizedCompanyContext;
  config?: CrossDocumentCompositionConfig;
}): CrossDocumentContext {
  const requested = new URL(input.request.url).searchParams.get("locale");
  const locale: Locale = requested && requested.toLowerCase().startsWith("ar") ? "ar" : "en";
  const dependencies = composeCrossDocumentDependencies(input.config);
  return {
    companyId: input.company.companyId,
    actorUserId: input.actorUserId,
    locale,
    store: dependencies.store,
    dependencies,
  };
}

/**
 * Reads a path segment from the URL, matching the convention used by this
 * repository: `offsetFromEnd` 0 is the last segment, 1 the one before it.
 */
export function pathSegment(request: Request, offsetFromEnd = 0): string {
  const parts = new URL(request.url).pathname.split("/").filter(Boolean);
  const value = parts.at(-1 - Math.max(0, offsetFromEnd));
  return value ? decodeURIComponent(value) : "";
}

export const NO_STORE = { "Cache-Control": "private, no-store" } as const;
