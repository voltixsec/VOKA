import type { PrismaClient } from "@/lib/generated/prisma/client";

import type {
  IStagedProductsRepository,
  StagedProductSummary,
  StagedProductsQuery,
  StagedProductsResult,
} from "../../application/staging-products/GetStagedProducts";

type RawRow = {
  id: string;
  sourceExternalId: string;
  entityType: string;
  status: string;
  rawPayload: unknown;
};

type RelationKind =
  | "MANUFACTURED_BY"
  | "BRANDED_BY"
  | "BELONGS_TO_FAMILY"
  | "COMPONENT_OF";

function objectValue(
  value: unknown,
): Record<string, unknown> {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(
  value: unknown,
): string | null {
  return typeof value === "string" &&
    value.trim().length > 0
    ? value.trim()
    : null;
}

function envelopeOf(
  row: RawRow,
): Record<string, unknown> {
  return objectValue(
    row.rawPayload,
  );
}

function payloadOf(
  row: RawRow,
): Record<string, unknown> {
  return objectValue(
    envelopeOf(row).payload,
  );
}

function relationPayload(
  rawPayload: unknown,
): Record<string, unknown> {
  return objectValue(
    objectValue(
      rawPayload,
    ).payload,
  );
}

function baseProduct(
  row: RawRow,
): StagedProductSummary {
  const payload =
    payloadOf(row);

  return {
    id: row.id,
    externalKey:
      row.sourceExternalId,
    entityType:
      row.entityType as StagedProductSummary["entityType"],
    status: row.status,

    name:
      stringValue(
        payload.name,
      ) ??
      stringValue(
        payload.model,
      ) ??
      stringValue(
        payload.modelNumber,
      ),

    description:
      stringValue(
        payload.description,
      ) ??
      stringValue(
        payload.technicalDescription,
      ),

    modelNumber:
      stringValue(
        payload.modelNumber,
      ) ??
      stringValue(
        payload.model,
      ),

    manufacturer:
      stringValue(
        payload.manufacturer,
      ),

    brand:
      stringValue(
        payload.brand,
      ),

    family:
      stringValue(
        payload.family,
      ),

    system:
      stringValue(
        payload.system,
      ) ??
      stringValue(
        payload.systemRole,
      ),

    lifecycle:
      stringValue(
        payload.lifecycle,
      ) ??
      stringValue(
        payload.lifecycleStatus,
      ),

    rawPayload:
      envelopeOf(row),
  };
}

function uniqueStrings(
  values: Array<
    string | null
  >,
): string[] {
  return [
    ...new Set(
      values.filter(
        (
          value,
        ): value is string =>
          Boolean(value),
      ),
    ),
  ];
}

export class PrismaStagedProductsRepository
  implements IStagedProductsRepository
{
  public constructor(
    private readonly prisma:
      PrismaClient,
  ) {}

  private async resolveEntityKeysByName(
    entityType:
      | "MANUFACTURER"
      | "BRAND"
      | "PRODUCT_FAMILY"
      | "SYSTEM",
    name: string,
  ): Promise<string[]> {
    const rows =
      await this.prisma
        .universalIngestionRecord
        .findMany({
          where: {
            entityType,
            status: {
              notIn: [
                "REJECTED",
                "FAILED",
              ],
            },
            rawPayload: {
              path: [
                "payload",
                "name",
              ],
              equals: name,
            },
          },
          select: {
            sourceExternalId:
              true,
          },
          take: 100,
        });

    return rows.map(
      (row) =>
        row.sourceExternalId,
    );
  }

  private async resolveProductKeysForRelation(
    targetKeys: string[],
    relationTypes:
      RelationKind[],
  ): Promise<string[]> {
    if (
      targetKeys.length === 0
    ) {
      return [];
    }

    const relations =
      await this.prisma
        .universalIngestionRecord
        .findMany({
          where: {
            entityType:
              "RELATION",
            status: {
              notIn: [
                "REJECTED",
                "FAILED",
              ],
            },
            AND: [
              {
                OR:
                  relationTypes.map(
                    (
                      relationType,
                    ) => ({
                      rawPayload:
                        {
                          path: [
                            "payload",
                            "relationType",
                          ],
                          equals:
                            relationType,
                        },
                    }),
                  ),
              },
              {
                OR:
                  targetKeys.map(
                    (
                      targetKey,
                    ) => ({
                      rawPayload:
                        {
                          path: [
                            "payload",
                            "targetExternalKey",
                          ],
                          equals:
                            targetKey,
                        },
                    }),
                  ),
              },
            ],
          },
          select: {
            rawPayload: true,
          },
        });

    return uniqueStrings(
      relations.map(
        (relation) =>
          stringValue(
            relationPayload(
              relation.rawPayload,
            ).sourceExternalKey,
          ),
      ),
    );
  }

  private async resolveFilterProductKeys(
    query: StagedProductsQuery,
  ): Promise<
    string[] | null
  > {
    const filters: string[][] =
      [];

    if (
      query.manufacturer
    ) {
      const targets =
        await this.resolveEntityKeysByName(
          "MANUFACTURER",
          query.manufacturer,
        );

      filters.push(
        await this.resolveProductKeysForRelation(
          targets,
          [
            "MANUFACTURED_BY",
          ],
        ),
      );
    }

    if (query.brand) {
      const targets =
        await this.resolveEntityKeysByName(
          "BRAND",
          query.brand,
        );

      filters.push(
        await this.resolveProductKeysForRelation(
          targets,
          [
            "BRANDED_BY",
          ],
        ),
      );
    }

    if (query.family) {
      const targets =
        await this.resolveEntityKeysByName(
          "PRODUCT_FAMILY",
          query.family,
        );

      filters.push(
        await this.resolveProductKeysForRelation(
          targets,
          [
            "BELONGS_TO_FAMILY",
          ],
        ),
      );
    }

    if (query.system) {
      const targets =
        await this.resolveEntityKeysByName(
          "SYSTEM",
          query.system,
        );

      filters.push(
        await this.resolveProductKeysForRelation(
          targets,
          [
            "COMPONENT_OF",
          ],
        ),
      );
    }

    if (
      filters.length === 0
    ) {
      return null;
    }

    if (
      filters.some(
        (filter) =>
          filter.length === 0,
      )
    ) {
      return [];
    }

    let intersection =
      new Set(filters[0]);

    for (
      const filter
      of filters.slice(1)
    ) {
      const allowed =
        new Set(filter);

      intersection =
        new Set(
          [...intersection].filter(
            (key) =>
              allowed.has(key),
          ),
        );
    }

    return [
      ...intersection,
    ];
  }

  public async list(
    query: Required<
      Pick<
        StagedProductsQuery,
        "limit"
      >
    > &
      Omit<
        StagedProductsQuery,
        "limit"
      >,
  ): Promise<StagedProductsResult> {
    const entityTypes =
      query.entityType
        ? [query.entityType]
        : [
            "PRODUCT_MODEL",
            "ITEM",
            "SERVICE",
          ];

    const restrictedProductKeys =
      await this.resolveFilterProductKeys(
        query,
      );

    if (
      restrictedProductKeys !==
        null &&
      restrictedProductKeys.length ===
        0
    ) {
      return {
        items: [],
        total: 0,
        nextCursor: null,
      };
    }

    const search =
      query.search?.trim() ??
      "";

    const andConditions: Array<
      Record<string, unknown>
    > = [];

    if (
      restrictedProductKeys !==
      null
    ) {
      andConditions.push({
        sourceExternalId: {
          in:
            restrictedProductKeys,
        },
      });
    }

    if (search) {
      andConditions.push({
        OR: [
          {
            sourceExternalId: {
              contains:
                search,
              mode:
                "insensitive",
            },
          },
          {
            rawPayload: {
              path: [
                "payload",
                "name",
              ],
              string_contains:
                search,
            },
          },
          {
            rawPayload: {
              path: [
                "payload",
                "model",
              ],
              string_contains:
                search,
            },
          },
          {
            rawPayload: {
              path: [
                "payload",
                "modelNumber",
              ],
              string_contains:
                search,
            },
          },
          {
            rawPayload: {
              path: [
                "payload",
                "manufacturer",
              ],
              string_contains:
                search,
            },
          },
          {
            rawPayload: {
              path: [
                "payload",
                "brand",
              ],
              string_contains:
                search,
            },
          },
          {
            rawPayload: {
              path: [
                "payload",
                "family",
              ],
              string_contains:
                search,
            },
          },
        ],
      });
    }

    const baseWhere = {
      entityType: {
        in: entityTypes,
      },

      status:
        query.status
          ? (
              query.status as never
            )
          : {
              notIn: [
                "REJECTED",
                "FAILED",
              ] as (
                | "REJECTED"
                | "FAILED"
              )[],
            },

      ...(andConditions.length
        ? {
            AND:
              andConditions,
          }
        : {}),
    };

    const [
      total,
      rows,
    ] = await Promise.all([
      this.prisma
        .universalIngestionRecord
        .count({
          where:
            baseWhere as never,
        }),

      this.prisma
        .universalIngestionRecord
        .findMany({
          where:
            baseWhere as never,

          orderBy: [
            {
              id: "asc",
            },
          ],

          ...(query.cursor
            ? {
                cursor: {
                  id:
                    query.cursor,
                },
                skip: 1,
              }
            : {}),

          take:
            query.limit + 1,

          select: {
            id: true,
            sourceExternalId:
              true,
            entityType: true,
            status: true,
            rawPayload: true,
          },
        }),
    ]);

    const hasMore =
      rows.length >
      query.limit;

    const pageRows =
      hasMore
        ? rows.slice(
            0,
            query.limit,
          )
        : rows;

    let products =
      pageRows.map(
        (row) =>
          baseProduct(
            row as RawRow,
          ),
      );

    if (
      products.length === 0
    ) {
      return {
        items: [],
        total,
        nextCursor: null,
      };
    }

    const productKeys =
      products.map(
        (product) =>
          product.externalKey,
      );

    const relations =
      await this.prisma
        .universalIngestionRecord
        .findMany({
          where: {
            entityType:
              "RELATION",

            status: {
              notIn: [
                "REJECTED",
                "FAILED",
              ],
            },

            OR:
              productKeys.map(
                (key) => ({
                  rawPayload: {
                    path: [
                      "payload",
                      "sourceExternalKey",
                    ],
                    equals: key,
                  },
                }),
              ),
          },

          select: {
            rawPayload: true,
          },
        });

    const relationMap =
      new Map<
        string,
        {
          manufacturer?:
            string;
          brand?: string;
          family?: string;
          system?: string;
        }
      >();

    const targetKeys =
      new Set<string>();

    for (
      const relation
      of relations
    ) {
      const payload =
        relationPayload(
          relation.rawPayload,
        );

      const sourceKey =
        stringValue(
          payload.sourceExternalKey,
        );

      const targetKey =
        stringValue(
          payload.targetExternalKey,
        );

      const relationType =
        stringValue(
          payload.relationType,
        );

      if (
        !sourceKey ||
        !targetKey ||
        !relationType
      ) {
        continue;
      }

      const current =
        relationMap.get(
          sourceKey,
        ) ?? {};

      if (
        relationType ===
        "MANUFACTURED_BY"
      ) {
        current.manufacturer =
          targetKey;
        targetKeys.add(
          targetKey,
        );
      }

      if (
        relationType ===
        "BRANDED_BY"
      ) {
        current.brand =
          targetKey;
        targetKeys.add(
          targetKey,
        );
      }

      if (
        relationType ===
          "BELONGS_TO_FAMILY" ||
        (
          relationType ===
            "CHILD_OF" &&
          targetKey.startsWith(
            "family:",
          )
        )
      ) {
        current.family =
          targetKey;
        targetKeys.add(
          targetKey,
        );
      }

      if (
        relationType ===
        "COMPONENT_OF"
      ) {
        current.system =
          targetKey;
        targetKeys.add(
          targetKey,
        );
      }

      relationMap.set(
        sourceKey,
        current,
      );
    }

    const targets =
      targetKeys.size
        ? await this.prisma
            .universalIngestionRecord
            .findMany({
              where: {
                sourceExternalId:
                  {
                    in: [
                      ...targetKeys,
                    ],
                  },

                status: {
                  notIn: [
                    "REJECTED",
                    "FAILED",
                  ],
                },
              },

              select: {
                sourceExternalId:
                  true,
                rawPayload: true,
              },
            })
        : [];

    const targetNames =
      new Map<
        string,
        string
      >();

    for (
      const row
      of targets
    ) {
      const payload =
        objectValue(
          objectValue(
            row.rawPayload,
          ).payload,
        );

      const name =
        stringValue(
          payload.name,
        ) ??
        stringValue(
          payload.model,
        );

      if (name) {
        targetNames.set(
          row.sourceExternalId,
          name,
        );
      }
    }

    products =
      products.map(
        (product) => {
          const relation =
            relationMap.get(
              product.externalKey,
            );

          return {
            ...product,

            manufacturer:
              product.manufacturer ??
              (
                relation
                  ?.manufacturer
                  ? targetNames.get(
                      relation.manufacturer,
                    )
                  : null
              ) ??
              null,

            brand:
              product.brand ??
              (
                relation?.brand
                  ? targetNames.get(
                      relation.brand,
                    )
                  : null
              ) ??
              null,

            family:
              product.family ??
              (
                relation?.family
                  ? targetNames.get(
                      relation.family,
                    )
                  : null
              ) ??
              null,

            system:
              product.system ??
              (
                relation?.system
                  ? targetNames.get(
                      relation.system,
                    )
                  : null
              ) ??
              null,
          };
        },
      );

    return {
      items: products,
      total,

      nextCursor:
        hasMore
          ? pageRows.at(-1)
              ?.id ??
            null
          : null,
    };
  }
}
