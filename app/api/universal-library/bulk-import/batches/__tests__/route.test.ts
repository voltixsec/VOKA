import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks =
  vi.hoisted(() => ({
    execute:
      vi.fn(),
  }));

vi.mock("@/lib/api", () => ({
  apiSuccess: (
    data: unknown,
    init?: ResponseInit,
  ) =>
    Response.json(
      {
        success: true,
        data,
      },
      init,
    ),

  withCompanyAuth: (
    roles: string[],
    handler: (
      request: Request,
    ) => Promise<Response>,
  ) =>
    async (
      request: Request,
    ) => {
      const role =
        request.headers.get(
          "x-test-role",
        ) ?? "VIEWER";

      if (!roles.includes(role)) {
        return Response.json(
          {
            success: false,
            error: "Forbidden",
          },
          {
            status: 403,
          },
        );
      }

      return handler(
        request,
      );
    },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {},
}));

vi.mock(
  "@/features/universal-library/infrastructure/bulk-import/PrismaBulkImportBatchHistoryRepository",
  () => ({
    PrismaBulkImportBatchHistoryRepository:
      class {},
  }),
);

vi.mock(
  "@/features/universal-library/application/bulk-import/ListBulkImportBatches",
  () => ({
    ListBulkImportBatches:
      class {
        execute =
          mocks.execute;
      },
  }),
);

import { GET } from "../route";

function request(
  query = "",
  options: {
    role?: string;
    secret?: string;
  } = {},
) {
  const headers =
    new Headers();

  headers.set(
    "x-test-role",
    options.role ??
      "OWNER",
  );

  if (
    options.secret
  ) {
    headers.set(
      "x-voka-ucl-bulk-secret",
      options.secret,
    );
  }

  return new Request(
    `http://localhost/api/universal-library/bulk-import/batches${query}`,
    {
      method: "GET",
      headers,
    },
  );
}

describe(
  "UCL bulk batch history API",
  () => {
    const originalSecret =
      process.env
        .VOKA_UCL_BULK_IMPORT_SECRET;

    beforeEach(() => {
      mocks.execute
        .mockReset();

      process.env
        .VOKA_UCL_BULK_IMPORT_SECRET =
        "test-bulk-secret";
    });

    afterEach(() => {
      if (
        originalSecret ===
        undefined
      ) {
        delete process.env
          .VOKA_UCL_BULK_IMPORT_SECRET;
      } else {
        process.env
          .VOKA_UCL_BULK_IMPORT_SECRET =
          originalSecret;
      }
    });

    it(
      "rejects unauthorized company roles",
      async () => {
        const response =
          await GET(
            request("", {
              role:
                "SALES",
              secret:
                "test-bulk-secret",
            }),
          );

        expect(
          response.status,
        ).toBe(403);
      },
    );

    it(
      "requires operational secret",
      async () => {
        const response =
          await GET(
            request(),
          );

        expect(
          response.status,
        ).toBe(403);
      },
    );

    it(
      "returns bounded batch history",
      async () => {
        mocks.execute
          .mockResolvedValue({
            items: [
              {
                batchExternalKey:
                  "BATCH-1",
                status:
                  "COMPLETED",
                publishedCount:
                  0,
              },
            ],
            total: 1,
          });

        const response =
          await GET(
            request(
              "?limit=25&sourceId=source-1",
              {
                secret:
                  "test-bulk-secret",
              },
            ),
          );

        expect(
          response.status,
        ).toBe(200);

        expect(
          mocks.execute,
        ).toHaveBeenCalledWith({
          limit: 25,
          sourceId:
            "source-1",
        });

        const body =
          await response.json();

        expect(
          body.data.total,
        ).toBe(1);

        expect(
          body.data.items[0]
            .publishedCount,
        ).toBe(0);
      },
    );

    it(
      "rejects unbounded limits",
      async () => {
        const response =
          await GET(
            request(
              "?limit=1000",
              {
                secret:
                  "test-bulk-secret",
              },
            ),
          );

        expect(
          response.status,
        ).toBe(400);
      },
    );
  },
);
