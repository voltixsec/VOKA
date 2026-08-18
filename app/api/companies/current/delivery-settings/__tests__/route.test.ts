import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", async () => {
  const responses = await vi.importActual<typeof import("@/lib/api/ApiResponse")>("@/lib/api/ApiResponse");
  const errors = await vi.importActual<typeof import("@/lib/api/ApiError")>("@/lib/api/ApiError");
  return {
    ApiError: errors.ApiError,
    apiSuccess: responses.apiSuccess,
    withCompanyAuth: (allowedRoles: readonly string[], handler: Function) => async (request: Request) => {
      const authHeader = request.headers.get("authorization");
      if (authHeader === "Bearer unauthenticated") {
        return responses.handleApiError(errors.ApiError.unauthorized("UNAUTHORIZED", "Authentication required."));
      }
      const role = request.headers.get("x-test-role") || "VIEWER";
      if (!allowedRoles.includes(role)) {
        return responses.handleApiError(errors.ApiError.forbidden("FORBIDDEN", "Forbidden."));
      }
      try {
        return await handler(request, {}, { companyId: "company-1", role });
      } catch (error) {
        return responses.handleApiError(error);
      }
    },
  };
});

import { GET } from "../route";

describe("GET /api/companies/current/delivery-settings", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      VOKA_EMAIL_PROVIDER: "resend",
      RESEND_API_KEY: "secret_resend_api_key_xyz",
      VOKA_EMAIL_FROM: "no-reply@company.com",
      VOKA_WHATSAPP_PROVIDER: "meta",
      META_WHATSAPP_ACCESS_TOKEN: "secret_whatsapp_access_token_abc",
      META_WHATSAPP_PHONE_NUMBER_ID: "phone_num_id_999",
      META_WHATSAPP_GRAPH_API_VERSION: "v20.0",
      META_WHATSAPP_TEMPLATE_AR: "template_ar_name",
      META_WHATSAPP_TEMPLATE_LANGUAGE_AR: "ar",
      META_WHATSAPP_TEMPLATE_EN: "template_en_name",
      META_WHATSAPP_TEMPLATE_LANGUAGE_EN: "en_US",
    };
  });

  it("returns safe readiness booleans for authenticated requests", async () => {
    const request = new Request("http://localhost/api/companies/current/delivery-settings", {
      headers: { "x-test-role": "OWNER" },
    });
    const response = await GET(request);
    expect(response.status).toBe(200);

    const json = await response.json();
    expect(json.success).toBe(true);
    expect(json.data).toEqual({
      email: {
        provider: "RESEND",
        configured: true,
        requirements: {
          providerSelected: true,
          apiKeyConfigured: true,
          senderConfigured: true,
        },
      },
      whatsapp: {
        provider: "META",
        configured: true,
        requirements: {
          providerSelected: true,
          accessTokenConfigured: true,
          phoneNumberIdConfigured: true,
          graphApiVersionConfigured: true,
        },
        locales: {
          ar: {
            templateConfigured: true,
            languageConfigured: true,
            configured: true,
          },
          en: {
            templateConfigured: true,
            languageConfigured: true,
            configured: true,
          },
        },
      },
    });
  });

  it("does not expose any secret or environment values in serialized JSON", async () => {
    const request = new Request("http://localhost/api/companies/current/delivery-settings", {
      headers: { "x-test-role": "SALES" },
    });
    const response = await GET(request);
    const text = await response.text();

    expect(text).not.toContain("secret_resend_api_key_xyz");
    expect(text).not.toContain("no-reply@company.com");
    expect(text).not.toContain("secret_whatsapp_access_token_abc");
    expect(text).not.toContain("phone_num_id_999");
    expect(text).not.toContain("template_ar_name");
    expect(text).not.toContain("template_en_name");
  });

  it("enforces authentication and authorization", async () => {
    const unauthReq = new Request("http://localhost/api/companies/current/delivery-settings", {
      headers: { authorization: "Bearer unauthenticated" },
    });
    const unauthResp = await GET(unauthReq);
    expect(unauthResp.status).toBe(401);

    const forbiddenReq = new Request("http://localhost/api/companies/current/delivery-settings", {
      headers: { "x-test-role": "GUEST" },
    });
    const forbiddenResp = await GET(forbiddenReq);
    expect(forbiddenResp.status).toBe(403);
  });
});
