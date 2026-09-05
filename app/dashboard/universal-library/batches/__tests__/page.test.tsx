import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.mock(
  "@/components/universal-library/UniversalLibraryBatchesConsole",
  () => ({
    default: function MockConsole() {
      return null;
    },
  }),
);

import UniversalLibraryBatchesPage from "../page";

describe(
  "UniversalLibraryBatchesPage",
  () => {
    it(
      "renders the bulk import operations console",
      () => {
        const result =
          UniversalLibraryBatchesPage();

        expect(
          result,
        ).toBeTruthy();
      },
    );
  },
);
