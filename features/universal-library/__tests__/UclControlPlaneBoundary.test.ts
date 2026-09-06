import {
  readFileSync,
} from "node:fs";

import {
  describe,
  expect,
  it,
} from "vitest";

const controlPlaneRoutes = [
  "app/api/universal-library/acquisition/run/route.ts",
  "app/api/universal-library/acquisition/runs/route.ts",

  "app/api/universal-library/bulk-import/route.ts",
  "app/api/universal-library/bulk-import/chunk/route.ts",
  "app/api/universal-library/bulk-import/batches/route.ts",
  "app/api/universal-library/bulk-import/batches/status/route.ts",
  "app/api/universal-library/bulk-import/ui/chunk/route.ts",
  "app/api/universal-library/bulk-import/ui/batches/route.ts",
  "app/api/universal-library/bulk-import/ui/batches/status/route.ts",

  "app/api/universal-library/ingest/route.ts",
  "app/api/universal-library/ingest/process/route.ts",

  "app/api/universal-library/population/run/route.ts",

  "app/api/universal-library/staging/hierarchy/route.ts",
  "app/api/universal-library/staging/products/route.ts",
];

describe(
  "UCL platform control-plane boundary",
  () => {
    it(
      "requires platform-admin authorization on every current operator API",
      () => {
        for (
          const path
          of controlPlaneRoutes
        ) {
          const source =
            readFileSync(
              path,
              "utf8",
            );

          expect(
            source,
            path,
          ).toContain(
            "withPlatformAdminAuth",
          );

          expect(
            source,
            path,
          ).not.toContain(
            "withCompanyAuth",
          );
        }
      },
    );

    it(
      "server-gates the UCL operator dashboard",
      () => {
        const source =
          readFileSync(
            "app/dashboard/universal-library/layout.tsx",
            "utf8",
          );

        expect(source).toContain(
          "isPlatformAdmin",
        );

        expect(source).toContain(
          'redirect("/dashboard")',
        );
      },
    );
  },
);
