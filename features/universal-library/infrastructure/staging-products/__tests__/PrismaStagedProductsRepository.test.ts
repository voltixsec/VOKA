import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { PrismaStagedProductsRepository } from "../PrismaStagedProductsRepository";

describe(
  "PrismaStagedProductsRepository global totals",
  () => {
    it(
      "counts global staged commercial records independently from the current filter and excludes published records",
      async () => {
        const count = vi
          .fn()
          .mockResolvedValueOnce(7)
          .mockResolvedValueOnce(3)
          .mockResolvedValueOnce(2)
          .mockResolvedValueOnce(2);

        const findMany =
          vi.fn().mockResolvedValue([]);

        const repository =
          new PrismaStagedProductsRepository(
            {
              universalIngestionRecord: {
                count,
                findMany,
              },
            } as never,
          );

        const result =
          await repository.list({
            entityType: "SERVICE",
            limit: 50,
          });

        expect(
          result.globalTotals,
        ).toEqual({
          totalStagedCommercialRecords:
            12,
          totalProductModels: 7,
          totalItems: 3,
          totalServices: 2,
        });

        expect(result.total).toBe(2);

        const stagedStatuses = {
          notIn: [
            "PUBLISHED",
            "REJECTED",
            "FAILED",
          ],
        };

        expect(
          count,
        ).toHaveBeenNthCalledWith(
          1,
          {
            where: {
              entityType:
                "PRODUCT_MODEL",
              status:
                stagedStatuses,
            },
          },
        );

        expect(
          count,
        ).toHaveBeenNthCalledWith(
          2,
          {
            where: {
              entityType: "ITEM",
              status:
                stagedStatuses,
            },
          },
        );

        expect(
          count,
        ).toHaveBeenNthCalledWith(
          3,
          {
            where: {
              entityType: "SERVICE",
              status:
                stagedStatuses,
            },
          },
        );

        expect(
          count,
        ).toHaveBeenNthCalledWith(
          4,
          {
            where: {
              entityType: {
                in: [
                  "SERVICE",
                ],
              },
              status:
                stagedStatuses,
            },
          },
        );
      },
    );
  },
);
