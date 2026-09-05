import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.mock(
  "@/components/universal-library/UniversalLibraryStagedHierarchyBrowser",
  () => ({
    default: () => (
      <div>
        Staged Hierarchy Browser
      </div>
    ),
  }),
);

import UniversalLibrarySystemsPage from "../page";

describe(
  "UniversalLibrarySystemsPage",
  () => {
    it(
      "renders the staged hierarchy browser",
      () => {
        const result =
          UniversalLibrarySystemsPage();

        expect(result).toBeTruthy();
      },
    );
  },
);
