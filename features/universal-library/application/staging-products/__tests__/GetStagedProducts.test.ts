import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  GetStagedProducts,
  type IStagedProductsRepository,
} from "../GetStagedProducts";

describe("GetStagedProducts", () => {
  it("uses a bounded default limit", async () => {
    const repository: IStagedProductsRepository = {
      list: vi.fn().mockResolvedValue({
        items: [],
        total: 0,
        nextCursor: null,
      }),
    };

    const useCase =
      new GetStagedProducts(
        repository,
      );

    await useCase.execute();

    expect(
      repository.list,
    ).toHaveBeenCalledWith({
      limit: 50,
    });
  });

  it("passes staged product filters to the repository", async () => {
    const repository: IStagedProductsRepository = {
      list: vi.fn().mockResolvedValue({
        items: [],
        total: 0,
        nextCursor: null,
      }),
    };

    const useCase =
      new GetStagedProducts(
        repository,
      );

    await useCase.execute({
      search: "Hanwha",
      entityType:
        "PRODUCT_MODEL",
      manufacturer:
        "Hanwha Vision",
      system:
        "NVR-based IP Surveillance System",
      limit: 25,
    });

    expect(
      repository.list,
    ).toHaveBeenCalledWith({
      search: "Hanwha",
      entityType:
        "PRODUCT_MODEL",
      manufacturer:
        "Hanwha Vision",
      system:
        "NVR-based IP Surveillance System",
      limit: 25,
    });
  });

  it("rejects limits above the bounded maximum", async () => {
    const repository: IStagedProductsRepository = {
      list: vi.fn(),
    };

    const useCase =
      new GetStagedProducts(
        repository,
      );

    await expect(
      useCase.execute({
        limit: 101,
      }),
    ).rejects.toThrow(
      "INVALID_STAGED_PRODUCTS_LIMIT",
    );
  });
});
