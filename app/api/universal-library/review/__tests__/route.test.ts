import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks = vi.hoisted(() => ({
  roleSets: [] as string[][],
  reviewExecute: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  apiSuccess: (
    data: unknown,
    init?: ResponseInit,
  ) =>
    Response.json(
      { data },
      init,
    ),

  withPlatformAdminAuth: (
    roles: string[],
    handler: (
      request: Request,
      auth: {
        user: {
          id: string;
        };
      },
    ) => Promise<Response>,
  ) => {
    mocks.roleSets.push(roles);

    return async (
      request: Request,
    ) => {
      const platform =
        request.headers.get(
          "x-test-platform-admin",
        );

      if (platform !== "yes") {
        return Response.json(
          {
            error: {
              code:
                "PLATFORM_ADMIN_REQUIRED",
            },
          },
          {
            status: 403,
          },
        );
      }

      return handler(
        request,
        {
          user: {
            id:
              "platform-user-1",
          },
        },
      );
    };
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {},
}));

vi.mock(
  "@/features/universal-library",
  () => ({
    PrismaUniversalLibraryRepository:
      class {},

    ReviewIngestionRecord:
      class {
        execute =
          mocks.reviewExecute;
      },
  }),
);

import {
  POST,
} from "../route";

function request(
  body: string,
  platform = true,
) {
  return new Request(
    "http://test/api/universal-library/review",
    {
      method: "POST",
      headers: {
        "content-type":
          "application/json",
        "x-test-platform-admin":
          platform
            ? "yes"
            : "no",
      },
      body,
    },
  );
}

describe(
  "UCL governed review API",
  () => {
    beforeEach(() => {
      mocks.reviewExecute
        .mockReset();
    });

    it.each([
      ["Reviewed ingestion record has no normalized payload.", 422, "REVIEW_PAYLOAD_REQUIRED"],
      ["Ingestion source is unavailable or inactive.", 409, "REVIEW_SOURCE_UNAVAILABLE"],
    ])("returns an actionable governed failure for %s", async (message, status, code) => {
      mocks.reviewExecute.mockRejectedValue(new Error(message));
      const response = await POST(request(JSON.stringify({ ingestionRecordId: "record-1", decision: "APPROVE" })));
      expect(response.status).toBe(status);
      expect(await response.json()).toMatchObject({ success: false, error: { code } });
    });

    it("logs unexpected infrastructure errors server-side without exposing details", async () => {
      const error = Object.assign(new Error("internal database detail"), { code: "P2010" });
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        mocks.reviewExecute.mockRejectedValue(error);
        const response = await POST(request(JSON.stringify({ ingestionRecordId: "record-1", decision: "APPROVE" })));
        expect(response.status).toBe(500);
        const body = await response.json();
        expect(body.error.code).toBe("UCL_REVIEW_FAILED");
        expect(JSON.stringify(body)).not.toContain("internal database detail");
        expect(log).toHaveBeenCalledWith("UCL governed review failed:", error);
      } finally {
        log.mockRestore();
      }
    });

    it(
      "requires platform administration",
      async () => {
        expect(
          mocks.roleSets,
        ).toContainEqual([
          "OWNER",
          "ADMIN",
        ]);

        const response =
          await POST(
            request(
              JSON.stringify({
                ingestionRecordId:
                  "record-1",
                decision:
                  "APPROVE",
              }),
              false,
            ),
          );

        expect(
          response.status,
        ).toBe(403);

        expect(
          mocks.reviewExecute,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "validates JSON, record id and decision",
      async () => {
        expect(
          (
            await POST(
              request("{"),
            )
          ).status,
        ).toBe(400);

        expect(
          (
            await POST(
              request(
                JSON.stringify({
                  decision:
                    "APPROVE",
                }),
              ),
            )
          ).status,
        ).toBe(400);

        expect(
          (
            await POST(
              request(
                JSON.stringify({
                  ingestionRecordId:
                    "record-1",
                  decision:
                    "MAYBE",
                }),
              ),
            )
          ).status,
        ).toBe(400);
      },
    );

    it(
      "passes the authenticated platform actor into approval",
      async () => {
        mocks.reviewExecute
          .mockResolvedValue({
            status:
              "PUBLISHED",
            item: {
              id:
                "item-1",
            },
          });

        const response =
          await POST(
            request(
              JSON.stringify({
                ingestionRecordId:
                  " record-1 ",
                decision:
                  "APPROVE",
                reviewNote:
                  " Evidence accepted ",
                reviewedByUserId: "untrusted-client-actor",
              }),
            ),
          );

        expect(
          response.status,
        ).toBe(200);

        expect(
          mocks.reviewExecute,
        ).toHaveBeenCalledWith({
          ingestionRecordId:
            "record-1",
          decision:
            "APPROVE",
          reviewedByUserId:
            "platform-user-1",
          reviewNote:
            "Evidence accepted",
        });
      },
    );

    it(
      "supports an explicit reject decision",
      async () => {
        mocks.reviewExecute
          .mockResolvedValue({
            status:
              "REJECTED",
          });

        const response =
          await POST(
            request(
              JSON.stringify({
                ingestionRecordId:
                  "record-2",
                decision:
                  "REJECT",
              }),
            ),
          );

        expect(
          response.status,
        ).toBe(200);

        expect(
          mocks.reviewExecute,
        ).toHaveBeenCalledWith({
          ingestionRecordId:
            "record-2",
          decision:
            "REJECT",
          reviewedByUserId:
            "platform-user-1",
          reviewNote:
            undefined,
        });
      },
    );

    it(
      "returns conflict when the record is no longer awaiting review",
      async () => {
        mocks.reviewExecute
          .mockRejectedValue(
            new Error(
              "Ingestion record is not awaiting review.",
            ),
          );

        const response =
          await POST(
            request(
              JSON.stringify({
                ingestionRecordId:
                  "record-3",
                decision:
                  "APPROVE",
              }),
            ),
          );

        expect(
          response.status,
        ).toBe(409);

        const body =
          await response.json();

        expect(
          body.error.code,
        ).toBe(
          "REVIEW_STATE_CONFLICT",
        );
      },
    );
  },
);
