/**
 * Phase 2A-11 route context.
 *
 * Every engineering route builds its context here, so all of them are
 * company-scoped in the same way and all of them read the locale the same way.
 *
 * Two rules mirror the accepted Phase 2A-10 route context (and are load-bearing
 * for tenant safety, §7):
 *
 * 1. The authoritative company id ALWAYS comes from the authenticated company
 *    context (`company.companyId`), never from a request body or query
 *    parameter. A caller cannot select a tenant by asking for one.
 * 2. Composition is the production composition root, so routes run on
 *    Prisma-backed persistence. There is no route-level override that could
 *    swap in a test store.
 *
 * The locale is never inferred from document content: it comes from an explicit
 * `locale` query parameter, defaulting to English.
 */

import type { AuthorizedCompanyContext } from "@/lib/auth";
import { composeEngineeringDependencies } from "@/src/infrastructure/engineering-takeoff/compose";
import type { EngineeringComposition } from "@/src/infrastructure/engineering-takeoff/compose";
import type { Locale } from "@/src/domain/cross-document";

export const NO_STORE = { "Cache-Control": "private, no-store" } as const;

export type EngineeringRouteContext = {
  companyId: string;
  actorUserId: string;
  locale: Locale;
  dependencies: EngineeringComposition;
};

export function contextFor(input: {
  request: Request;
  actorUserId: string;
  company: AuthorizedCompanyContext;
}): EngineeringRouteContext {
  const requested = new URL(input.request.url).searchParams.get("locale");
  const locale: Locale = requested && requested.toLowerCase().startsWith("ar") ? "ar" : "en";
  return {
    // The authenticated tenant, never a body/query value.
    companyId: input.company.companyId,
    actorUserId: input.actorUserId,
    locale,
    dependencies: composeEngineeringDependencies(),
  };
}

/**
 * Reads a path segment from the URL, matching the repository convention:
 * `offsetFromEnd` 0 is the last segment, 1 the one before it.
 */
export function pathSegment(request: Request, offsetFromEnd = 0): string {
  const parts = new URL(request.url).pathname.split("/").filter(Boolean);
  const value = parts.at(-1 - Math.max(0, offsetFromEnd));
  return value ? decodeURIComponent(value) : "";
}
