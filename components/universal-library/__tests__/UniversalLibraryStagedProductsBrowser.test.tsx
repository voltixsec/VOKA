// @vitest-environment jsdom

import {
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import UniversalLibraryStagedProductsBrowser from "@/components/universal-library/UniversalLibraryStagedProductsBrowser";

afterEach(() => {
  vi.restoreAllMocks();
});

function metric(label: string) {
  const labelNode =
    screen.getByText(label);

  const card =
    labelNode.parentElement;

  if (!card) {
    throw new Error(
      `Metric card not found: ${label}`,
    );
  }

  return within(card);
}

describe(
  "UniversalLibraryStagedProductsBrowser metrics",
  () => {
    it(
      "keeps global staged totals distinct from filtered and loaded page counts",
      async () => {
        vi.spyOn(
          global,
          "fetch",
        ).mockResolvedValue(
          new Response(
            JSON.stringify({
              items: [
                {
                  id: "staged-1",
                  externalKey: "model-1",
                  entityType:
                    "PRODUCT_MODEL",
                  status:
                    "NEEDS_REVIEW",
                  name:
                    "Example Camera",
                  description: null,
                  modelNumber:
                    "CAM-001",
                  manufacturer: null,
                  brand: null,
                  family: null,
                  system: null,
                  lifecycle: null,
                  rawPayload: {
                    payload: {},
                  },
                },
              ],
              total: 77,
              nextCursor: null,
              globalTotals: {
                totalStagedCommercialRecords:
                  1200,
                totalProductModels:
                  900,
                totalItems: 200,
                totalServices: 100,
              },
            }),
            {
              status: 200,
              headers: {
                "Content-Type":
                  "application/json",
              },
            },
          ),
        );

        render(
          <UniversalLibraryStagedProductsBrowser />,
        );

        await waitFor(() => {
          expect(
            screen.getByText(
              "Example Camera",
            ),
          ).toBeInTheDocument();
        });

        expect(
          metric(
            "Total Staged Commercial Records",
          ).getByText("1,200"),
        ).toBeInTheDocument();

        expect(
          metric(
            "Total Product Models",
          ).getByText("900"),
        ).toBeInTheDocument();

        expect(
          metric(
            "Total Items",
          ).getByText("200"),
        ).toBeInTheDocument();

        expect(
          metric(
            "Total Services",
          ).getByText("100"),
        ).toBeInTheDocument();

        expect(
          metric(
            "Matching Records",
          ).getByText("77"),
        ).toBeInTheDocument();

        expect(
          metric(
            "Loaded / Current Page",
          ).getByText("1"),
        ).toBeInTheDocument();

        expect(
          screen.queryByText(
            "Loaded page",
          ),
        ).not.toBeInTheDocument();
      },
    );
  },
);
