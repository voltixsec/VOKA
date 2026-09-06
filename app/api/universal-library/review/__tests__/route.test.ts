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
