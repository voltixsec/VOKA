import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  roleSets: [] as string[][],
  getRun: vi.fn(),
}));

vi.mock("@/lib/api", async () => {
  const errors = await vi.importActual<typeof import("@/lib/api/ApiError")>("@/lib/api/ApiError");
  const responses = await vi.importActual<typeof import("@/lib/api/ApiResponse")>("@/lib/api/ApiResponse");
  return {
    ApiError: errors.ApiError,
    apiSuccess: responses.apiSuccess,
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
        try {
          return await handler(request, {}, { companyId: "company-1", role: "OWNER" });
        } catch (error) {
          return responses.handleApiError(error);
        }
      };
    },
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

// The route imports PrismaAcquisitionRepository from the feature barrel. The
// barrel also re-exports repository modules that runtime-import the generated
// Prisma client, so the barrel is replaced here to keep the test fully offline.
vi.mock("@/features/universal-library", () => ({
  PrismaAcquisitionRepository: class {
    getRun = mocks.getRun;
  },
}));

import { GET } from "../route";

function request(runId: string, role = "OWNER") {
  return new Request(
    `http://localhost/api/universal-library/acquisition/runs/${runId}`,
    { headers: { "x-test-role": role } },
  );
}

function run(id: string) {
  return {
    id,
    sourceId: "source-1",
    initiatedByUserId: "operator-1",
    dryRun: true,
    status: "COMPLETED",
    requestedLimit: 10,
    policySnapshot: { dryRun: true },
  };
}

describe("GET /api/universal-library/acquisition/runs/[id] platform boundary", () => {
  beforeEach(() => vi.clearAllMocks());

  it("registers the run detail endpoint behind the platform-admin boundary (OWNER/ADMIN)", () => {
    expect(mocks.roleSets).toEqual([["OWNER", "ADMIN"]]);
  });

  it("denies non-platform tenant roles before any acquisition data access", async () => {
    const response = await GET(request("run-1", "SALES"));
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("PLATFORM_ADMIN_REQUIRED");
    expect(mocks.getRun).not.toHaveBeenCalled();
  });

  it("returns the requested acquisition run for an allowed platform session", async () => {
    mocks.getRun.mockResolvedValue(run("run-1"));
    const response = await GET(request("run-1", "OWNER"));

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const body = await response.json();
    expect(body.data).toMatchObject({ id: "run-1", sourceId: "source-1" });
    expect(mocks.getRun).toHaveBeenCalledTimes(1);
    expect(mocks.getRun).toHaveBeenCalledWith("run-1");
  });

  it("returns 404 when the acquisition run does not exist", async () => {
    mocks.getRun.mockResolvedValue(null);
    const response = await GET(request("missing-run", "OWNER"));

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("RUN_NOT_FOUND");
  });

  it("rejects over-length run ids before data access", async () => {
    const oversized = "r".repeat(201);
    const response = await GET(request(oversized, "OWNER"));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("INVALID_RUN_ID");
    expect(mocks.getRun).not.toHaveBeenCalled();
  });
});
