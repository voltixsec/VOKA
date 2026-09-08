import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  roleSets: [] as string[][],
  findMany: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  withPlatformAdminAuth: (roles: readonly string[], handler: Function) => {
    mocks.roleSets.push([...roles]);
    return async (request: Request) => {
      const role = request.headers.get("x-test-role") || "VIEWER";
      // Simulates the platform-admin boundary: any role outside the allow-list
      // is rejected before the route handler (and its data access) runs.
      if (!roles.includes(role as never)) {
        return Response.json(
          {
            success: false,
            error: {
              code: "PLATFORM_ADMIN_REQUIRED",
              message: "This operation is restricted to VOKA platform administration.",
            },
          },
          { status: 403 },
        );
      }
      return handler(request, {}, { companyId: "company-1", role: "OWNER" });
    };
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { company: { findMany: mocks.findMany } },
}));

import { GET, POST } from "../route";

function request(url: string, init?: RequestInit, role = "OWNER") {
  const headers = new Headers(init?.headers);
  headers.set("x-test-role", role);
  return new Request(url, { ...init, headers });
}

describe("/api/companies platform-admin boundary", () => {
  beforeEach(() => vi.clearAllMocks());

  it("registers both GET and POST behind the platform-admin boundary (OWNER/ADMIN)", () => {
    expect(mocks.roleSets).toEqual([
      ["OWNER", "ADMIN"],
      ["OWNER", "ADMIN"],
    ]);
  });

  it("denies ordinary tenant users the company directory without touching data", async () => {
    mocks.findMany.mockResolvedValue([]);
    const response = await GET(request("http://localhost/api/companies", {}, "VIEWER"));

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("PLATFORM_ADMIN_REQUIRED");
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it("returns the active company directory for an allowed platform session", async () => {
    mocks.findMany.mockResolvedValue([]);
    const response = await GET(request("http://localhost/api/companies", {}, "OWNER"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toEqual([]);
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isActive: true } }),
    );
  });

  it("denies ordinary tenant users company creation", async () => {
    const response = await POST(
      request("http://localhost/api/companies", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Tenant Corp", slug: "tenant-corp" }),
      }, "SALES"),
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("PLATFORM_ADMIN_REQUIRED");
  });

  it("validates the payload inside the guard for an allowed platform session", async () => {
    const response = await POST(
      request("http://localhost/api/companies", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "   " }),
      }, "OWNER"),
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("INVALID_COMPANY_NAME");
  });
});
