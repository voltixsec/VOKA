import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  roleSets: [] as string[][],
  runPopulationExecute: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  apiSuccess: (data: unknown, init?: ResponseInit) => Response.json({ data }, init),
  withCompanyAuth: (roles: string[], handler: (request: Request) => Promise<Response>) => {
    mocks.roleSets.push(roles);
    return async (request: Request) => {
      const role = request.headers.get("x-test-role") || "VIEWER";
      if (!roles.includes(role)) return Response.json({ error: "Forbidden" }, { status: 403 });
      return handler(request);
    };
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/features/universal-library/infrastructure/prisma/PrismaUniversalLibraryRepository", () => ({
  PrismaUniversalLibraryRepository: class {},
}));

vi.mock("@/features/universal-library/application/population/SystemPopulationPipeline", () => ({
  SystemPopulationPipeline: class {
    runPopulation = mocks.runPopulationExecute;
  },
}));

import { POST as runPost } from "../route";

function request(url: string, body: string, role = "OWNER") {
  return new Request(url, { method: "POST", headers: { "content-type": "application/json", "x-test-role": role }, body });
}

describe("Population Discovery Run API Route", () => {
  beforeEach(() => {
    mocks.runPopulationExecute.mockReset();
  });

  it("restricts endpoint to OWNER and ADMIN", async () => {
    expect((await runPost(request("http://test/run", "{}", "SALES"))).status).toBe(403);
  });

  it("rejects request if prompt is missing", async () => {
    const res = await runPost(request("http://test/run", JSON.stringify({ prompt: "" }), "OWNER"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("prompt is required.");
  });

  it("executes population pipeline and returns 200 with summary", async () => {
    mocks.runPopulationExecute.mockResolvedValue({
      runId: "run-123",
      status: "COMPLETED",
      query: { prompt: "CCTV System", domainHint: "Security", targetMarket: null },
      seed: { id: "seed-1", nameEn: "CCTV System", seedType: "SYSTEM", confidence: 0.95 },
      counts: {
        discoveredComponentsCount: 1,
        plannedWorkItemsCount: 1,
        stagedRecordsCount: 1,
        duplicateRecordsCount: 0,
        needsReviewCount: 1,
        rejectedCount: 0,
        publishedCount: 0,
      },
      evidenceUrls: ["https://example.com/datasheet"],
      stagedCandidates: [],
      errors: [],
    });

    const res = await runPost(
      request(
        "http://test/run",
        JSON.stringify({ prompt: "CCTV System", domainHint: "Security", useLive: false }),
        "OWNER"
      )
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.runId).toBe("run-123");
    expect(body.data.counts.publishedCount).toBe(0);
    expect(mocks.runPopulationExecute).toHaveBeenCalledWith({
      prompt: "CCTV System",
      domainHint: "Security",
      categoryHint: null,
      targetMarket: null,
    });
  });
});
