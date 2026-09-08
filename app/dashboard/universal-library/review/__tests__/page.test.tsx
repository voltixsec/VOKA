// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import UniversalLibraryReviewPage from "@/app/dashboard/universal-library/review/page";

const BASE_URL =
  "/api/universal-library/staging/products?status=NEEDS_REVIEW&limit=50";

function response(items: unknown[], total: number, status = 200): Response {
  return new Response(
    JSON.stringify({
      success: true,
      data: {
        items,
        total,
        nextCursor: null,
        globalTotals: {},
      },
    }),
    {
      status,
      headers: { "Content-Type": "application/json" },
    },
  );
}

function staged(
  id: string,
  externalKey: string,
  name: string,
) {
  return {
    id,
    externalKey,
    entityType: "PRODUCT_MODEL",
    status: "NEEDS_REVIEW",
    name,
    description: null,
    modelNumber: null,
    manufacturer: null,
    brand: null,
    family: null,
    system: null,
    lifecycle: null,
    matchedItemId: null,
    normalizedData: {},
    sourceId: "source-1",
    sourceName: "VOKA Global Library Data Factory",
    sourceType: "VOKA_DATA_FACTORY",
    sourceVerificationStatus: "UNVERIFIED",
    sourceTrustScore: null,
    sourceUrl: null,
    sourceLicenseReferenceUrl: null,
    canonicalSourceUrl: null,
    fetchedAt: null,
    attributionText: null,
    rawPayload: {},
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("UniversalLibraryReviewPage â€” governed search", () => {
  it("loads the governed queue and preserves its global count", async () => {
    const fetchMock = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(
        response(
          [
            staged(
              "r1",
              "close06-live-001",
              "VOKA CLOSE06 Live Camera One",
            ),
          ],
          3338,
        ),
      );

    render(<UniversalLibraryReviewPage />);

    await screen.findByText(
      "VOKA CLOSE06 Live Camera One",
    );

    expect(fetchMock).toHaveBeenCalledWith(
      BASE_URL,
      expect.any(Object),
    );
    expect(
      screen.getByText("3,338 records awaiting review"),
    ).toBeInTheDocument();
  });

  it("finds close06-live-002 outside the first 50 through server search", async () => {
    const target = staged(
      "r2",
      "close06-live-002",
      "VOKA CLOSE06 Live Camera Two",
    );

    const fetchMock = vi
      .spyOn(global, "fetch")
      .mockImplementation(async (input) => {
        const url = String(input);

        if (url.includes("search=")) {
          return response([target], 1);
        }

        return response(
          [
            staged(
              "r1",
              "close06-live-001",
              "VOKA CLOSE06 Live Camera One",
            ),
          ],
          3338,
        );
      });

    render(<UniversalLibraryReviewPage />);

    await screen.findByText(
      "VOKA CLOSE06 Live Camera One",
    );

    fireEvent.change(
      screen.getByLabelText("Search review queue"),
      {
        target: { value: "close06-live-002" },
      },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Search" }),
    );

    await screen.findByText(
      "VOKA CLOSE06 Live Camera Two",
    );

    const expectedUrl =
      `${BASE_URL}&search=${encodeURIComponent(
        "close06-live-002",
      )}`;

    expect(fetchMock).toHaveBeenCalledWith(
      expectedUrl,
      expect.any(Object),
    );
    expect(expectedUrl).toContain(
      "status=NEEDS_REVIEW",
    );
    expect(
      screen.getByText("1 matching record"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("3,338 records awaiting review"),
    ).toBeInTheDocument();
  });

  it("clear search restores the governed queue", async () => {
    const fetchMock = vi
      .spyOn(global, "fetch")
      .mockImplementation(async (input) => {
        const url = String(input);

        if (url.includes("search=")) {
          return response(
            [
              staged(
                "r2",
                "close06-live-002",
                "VOKA CLOSE06 Live Camera Two",
              ),
            ],
            1,
          );
        }

        return response(
          [
            staged(
              "r1",
              "close06-live-001",
              "VOKA CLOSE06 Live Camera One",
            ),
          ],
          3338,
        );
      });

    render(<UniversalLibraryReviewPage />);

    await screen.findByText(
      "VOKA CLOSE06 Live Camera One",
    );

    fireEvent.change(
      screen.getByLabelText("Search review queue"),
      { target: { value: "close06-live-002" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Search" }),
    );

    await screen.findByText(
      "VOKA CLOSE06 Live Camera Two",
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Clear search" }),
    );

    await screen.findByText(
      "VOKA CLOSE06 Live Camera One",
    );

    const lastCall =
      fetchMock.mock.calls[
        fetchMock.mock.calls.length - 1
      ][0];

    expect(lastCall).toBe(BASE_URL);
  });

  it("shows a search-specific zero-result state", async () => {
    vi.spyOn(global, "fetch").mockImplementation(
      async (input) => {
        const url = String(input);

        if (url.includes("search=")) {
          return response([], 0);
        }

        return response(
          [
            staged(
              "r1",
              "close06-live-001",
              "VOKA CLOSE06 Live Camera One",
            ),
          ],
          3338,
        );
      },
    );

    render(<UniversalLibraryReviewPage />);

    await screen.findByText(
      "VOKA CLOSE06 Live Camera One",
    );

    fireEvent.change(
      screen.getByLabelText("Search review queue"),
      {
        target: {
          value: "VOKA-NO-SUCH-SEARCH-20260908",
        },
      },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Search" }),
    );

    await screen.findByText(
      "No staged records match this search.",
    );

    expect(
      screen.queryByText("Review queue is clear"),
    ).not.toBeInTheDocument();
  });

  it("keeps review governance controls unchanged", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      response(
        [
          staged(
            "r1",
            "close06-live-001",
            "Governed camera",
          ),
        ],
        1,
      ),
    );

    render(<UniversalLibraryReviewPage />);

    await screen.findByText("Governed camera");

    expect(
      screen.getByRole("button", {
        name: "Approve & Publish",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Reject",
      }),
    ).toBeInTheDocument();
  });

  it("Enter executes governed review search", async () => {
    const fetchMock = vi
      .spyOn(global, "fetch")
      .mockImplementation(async (input) => {
        const url = String(input);

        if (url.includes("search=")) {
          return response(
            [
              staged(
                "r2",
                "close06-live-002",
                "Enter review camera",
              ),
            ],
            1,
          );
        }

        return response([], 0);
      });

    render(<UniversalLibraryReviewPage />);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalled(),
    );

    const input =
      screen.getByLabelText("Search review queue");

    fireEvent.change(input, {
      target: { value: "close06-live-002" },
    });
    fireEvent.keyDown(input, {
      key: "Enter",
      code: "Enter",
    });

    await screen.findByText("Enter review camera");
  });
});
