// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import UniversalLibraryProductsBrowser from "@/components/universal-library/UniversalLibraryProductsBrowser";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("UniversalLibraryProductsBrowser", () => {
  it("renders the real library browser and empty state", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [],
          total: 0,
          nextCursor: null,
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        },
      ),
    );

    render(<UniversalLibraryProductsBrowser />);

    expect(
      screen.getByText("Global Product Intelligence"),
    ).toBeInTheDocument();

    expect(
      screen.getByLabelText("Search products"),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(
        screen.getByText("No published products yet"),
      ).toBeInTheDocument();
    });
  });

  it("renders and filters real serialized universal items", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [
            {
              id: "item-1",
              type: "PRODUCT",
              name: "4K Vandal Dome Camera",
              nameAr: null,
              nameEn: "4K Vandal Dome Camera",
              searchName: "4k vandal dome camera",
              description: "Network surveillance camera",
              descriptionAr: null,
              descriptionEn: null,
              categoryId: "cat-1",
              manufacturerId: "manufacturer-1",
              brandId: "brand-1",
              familyId: "family-1",
              modelNumber: "DS-2CD2143G0-I",
              variantName: null,
              parentId: null,
              isActive: true,
              createdAt: "2026-09-01T00:00:00.000Z",
              updatedAt: "2026-09-01T00:00:00.000Z",
              category: {
                id: "cat-1",
                name: "IP Cameras",
              },
              manufacturer: {
                id: "manufacturer-1",
                name: "Hikvision",
              },
              brand: {
                id: "brand-1",
                name: "Hikvision",
              },
              family: {
                id: "family-1",
                name: "Pro Series",
              },
              identifiers: [
                {
                  id: "identifier-1",
                  identifierType: "MPN",
                  value: "DS-2CD2143G0-I",
                },
                {
                  id: "identifier-2",
                  identifierType: "GTIN_13",
                  value: "1234567890123",
                },
              ],
              attributeValues: [
                {
                  id: "attr-1",
                  valueString: "8 MP",
                  attributeDefinition: {
                    id: "def-1",
                    code: "RESOLUTION",
                    name: "Resolution",
                    dataType: "STRING",
                  },
                },
              ],
              provenances: [
                {
                  id: "prov-1",
                  confidence: "HIGH",
                  observedAt: "2026-09-01T00:00:00.000Z",
                  source: {
                    id: "source-1",
                    name: "Official Manufacturer",
                    verificationStatus: "VERIFIED",
                  },
                },
              ],
            },
          ],
          total: 1,
          nextCursor: null,
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        },
      ),
    );

    render(<UniversalLibraryProductsBrowser />);

    await waitFor(() => {
      expect(
        screen.getByText("4K Vandal Dome Camera"),
      ).toBeInTheDocument();
    });

    expect(
      screen.getAllByText("Hikvision").length,
    ).toBeGreaterThan(0);

    expect(
      screen.getByText("Model: DS-2CD2143G0-I"),
    ).toBeInTheDocument();

    fireEvent.change(
      screen.getByLabelText("Search products"),
      {
        target: {
          value: "no-match-product",
        },
      },
    );

    expect(
      screen.getByText(
        "No products match the current filters.",
      ),
    ).toBeInTheDocument();
  });
});