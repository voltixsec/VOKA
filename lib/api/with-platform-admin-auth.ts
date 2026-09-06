import { NextResponse } from "next/server";

import type {
  CompanyRole,
} from "../auth";
import {
  isPlatformAdmin,
} from "../auth/platform-admin";
import {
  withCompanyAuth,
  type CompanyAuthenticatedRouteHandler,
} from "./with-company-auth";

export function withPlatformAdminAuth(
  allowedRoles: readonly CompanyRole[],
  handler: CompanyAuthenticatedRouteHandler,
) {
  return withCompanyAuth(
    allowedRoles,
    async (
      request,
      auth,
      company,
    ) => {
      if (!isPlatformAdmin(auth)) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code:
                "PLATFORM_ADMIN_REQUIRED",
              message:
                "This operation is restricted to VOKA platform administration.",
            },
          },
          {
            status: 403,
            headers: {
              "Cache-Control":
                "no-store",
            },
          },
        );
      }

      return handler(
        request,
        auth,
        company,
      );
    },
  );
}
