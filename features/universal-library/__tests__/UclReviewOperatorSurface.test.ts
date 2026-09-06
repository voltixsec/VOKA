import {
  readFileSync,
} from "node:fs";

import {
  describe,
  expect,
  it,
} from "vitest";

describe(
  "UCL review operator surface",
  () => {
    it(
      "exposes the governed review queue and explicit decisions",
      () => {
        const source =
          readFileSync(
            "app/dashboard/universal-library/review/page.tsx",
            "utf8",
          );

        expect(source)
          .toContain(
            "status=NEEDS_REVIEW",
          );

        expect(source)
          .toContain(
            "/api/universal-library/review",
          );

        expect(source)
          .toContain(
            "Approve & Publish",
          );

        expect(source)
          .toContain(
            '"REJECT"',
          );
      },
    );

    it(
      "makes Review reachable from UCL operator navigation",
      () => {
        const paths = [
          "components/universal-library/UniversalLibraryBatchesConsole.tsx",
          "components/universal-library/UniversalLibraryProductsBrowser.tsx",
          "components/universal-library/UniversalLibraryStagedHierarchyBrowser.tsx",
          "components/universal-library/UniversalLibraryStagedProductsBrowser.tsx",
        ];

        for (const path of paths) {
          const source =
            readFileSync(
              path,
              "utf8",
            );

          expect(source)
            .toContain(
              "/dashboard/universal-library/review",
            );
        }
      },
    );
  },
);
