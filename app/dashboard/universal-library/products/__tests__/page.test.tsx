// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import UniversalLibraryProductsBrowser from "@/components/universal-library/UniversalLibraryProductsBrowser";

const BASE_URL =
  "/api/universal-library/items?limit=50&isActive=true";

function response(items: unknown[], total: number, status = 200): Response {
  return new Response(
    JSON.stringify({
      data: items,
      meta: { total, nextCursor: null },
    }),
    {
      status,
      headers: { "Content-Type": "application/json" },
    },
  );
}

function product(id: string, name: string, type = "PRODUCT") {
  return {
    id,
    type,
    name,
    isActive: true,
    modelNumber: null,
    identifiers: [],
    attributeValues: [],
    provenances: [],
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("UniversalLibraryProductsBrowser â€” server search", () => {
  it("loads the bounded published working set without a query", async () => {
    const fetchMock = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(
        response([product("p1", "Published camera")], 5000),
      );

    render(<UniversalLibraryProductsBrowser />);

    await screen.findByText("Published camera");

    expect(fetchMock).toHaveBeenCalledWith(
      BASE_URL,
      expect.any(Object),
    );
    expect(
      screen.getByLabelText("Search published library"),
    ).toBeInTheDocument();
  });

  it("finds a target outside the initial 50 by sending q to the server", async () => {
    const target =
      product("live-1", "VOKA CLOSE06 Live Camera One");

    const fetchMock = vi
      .spyOn(global, "fetch")
      .mockImplementation(async (input) => {
        const url = String(input);

        if (url.includes("q=")) {
          return response([target], 1);
        }

        return response(
          [product("working-1", "Unrelated working-set camera")],
          5000,
        );
      });

    render(<UniversalLibraryProductsBrowser />);

    await screen.findByText("Unrelated working-set camera");
    expect(
      screen.queryByText("VOKA CLOSE06 Live Camera One"),
    ).not.toBeInTheDocument();

    fireEvent.change(
      screen.getByLabelText("Search published library"),
      {
        target: {
          value: "VOKA CLOSE06 Live Camera One",
        },
      },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Search" }),
    );

    await screen.findByText("VOKA CLOSE06 Live Camera One");

    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE_URL}&q=${encodeURIComponent(
        "VOKA CLOSE06 Live Camera One",
      )}`,
      expect.any(Object),
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "1 result",
    );
  });

  it("Enter executes server search", async () => {
    const fetchMock = vi
      .spyOn(global, "fetch")
      .mockImplementation(async (input) => {
        const url = String(input);

        if (url.includes("q=")) {
          return response(
            [product("enter-1", "Enter searched camera")],
            1,
          );
        }

        return response([], 0);
      });

    render(<UniversalLibraryProductsBrowser />);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalled(),
    );

    const input =
      screen.getByLabelText("Search published library");

    fireEvent.change(input, {
      target: { value: "Enter searched camera" },
    });
    fireEvent.keyDown(input, {
      key: "Enter",
      code: "Enter",
    });

    await screen.findByText("Enter searched camera");
  });

  it("clear search reloads the normal bounded working set", async () => {
    const fetchMock = vi
      .spyOn(global, "fetch")
      .mockImplementation(async (input) => {
        const url = String(input);

        if (url.includes("q=")) {
          return response(
            [product("search-1", "Searched camera")],
            1,
          );
        }

        return response(
          [product("working-1", "Working set camera")],
          5000,
        );
      });

    render(<UniversalLibraryProductsBrowser />);

    await screen.findByText("Working set camera");

    fireEvent.change(
      screen.getByLabelText("Search published library"),
      { target: { value: "Searched camera" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Search" }),
    );

    await screen.findByText("Searched camera");

    fireEvent.click(
      screen.getByRole("button", { name: "Clear search" }),
    );

    await screen.findByText("Working set camera");

    const lastCall =
      fetchMock.mock.calls[
        fetchMock.mock.calls.length - 1
      ][0];

    expect(lastCall).toBe(BASE_URL);
  });

  it("shows a truthful zero-result search state", async () => {
    vi.spyOn(global, "fetch").mockImplementation(
      async (input) => {
        const url = String(input);

        if (url.includes("q=")) {
          return response([], 0);
        }

        return response(
          [product("working-1", "Working set camera")],
          5000,
        );
      },
    );

    render(<UniversalLibraryProductsBrowser />);

    await screen.findByText("Working set camera");

    fireEvent.change(
      screen.getByLabelText("Search published library"),
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
      "No published items match this search.",
    );

    expect(
      screen.queryByText("No published products yet"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Working set camera"),
    ).not.toBeInTheDocument();
  });

  it("keeps existing loaded-set filters functional", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      response(
        [
          product("product-1", "Product camera", "PRODUCT"),
          product("service-1", "Service camera", "SERVICE"),
        ],
        2,
      ),
    );

    render(<UniversalLibraryProductsBrowser />);

    await screen.findByText("Product camera");
    expect(
      screen.getByText("Service camera"),
    ).toBeInTheDocument();

    fireEvent.change(
      screen.getByLabelText("All types"),
      { target: { value: "PRODUCT" } },
    );

    expect(
      screen.getByText("Product camera"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Service camera"),
    ).not.toBeInTheDocument();
  });
});
