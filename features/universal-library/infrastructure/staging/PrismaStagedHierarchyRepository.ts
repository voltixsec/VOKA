import type { PrismaClient } from "@/lib/generated/prisma/client";

import type {
  IStagedHierarchyRepository,
  StagedDomainEntityCounts,
  StagedDomainSummary,
  StagedHierarchyEntity,
  StagedHierarchyStatus,
  StagedSystemDetails,
  StagedSystemSummary,
} from "../../application/staging/GetStagedHierarchy";

interface RawEnvelope {
  payload?: Record<string, unknown>;
  [key: string]: unknown;
}

interface RawIngestionRecord {
  id: string;
  sourceExternalId: string;
  entityType: string;
  status: string;
  rawPayload: unknown;
}

function objectValue(
  value: unknown,
): Record<string, unknown> {
  if (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  ) {
    return value as Record<string, unknown>;
  }

  return {};
}

function stringValue(
  value: unknown,
): string | null {
  return typeof value === "string" &&
    value.trim()
    ? value.trim()
    : null;
}

function stringArray(
  value: unknown,
): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (item): item is string =>
      typeof item === "string" &&
      item.trim().length > 0,
  );
}

function envelopeOf(
  row: RawIngestionRecord,
): RawEnvelope {
  return objectValue(
    row.rawPayload,
  ) as RawEnvelope;
}

function payloadOf(
  row: RawIngestionRecord,
): Record<string, unknown> {
  return objectValue(
    envelopeOf(row).payload,
  );
}

function baseEntity(
  row: RawIngestionRecord,
): StagedHierarchyEntity {
  const payload = payloadOf(row);

  return {
    id: row.id,
    externalKey:
      row.sourceExternalId,
    entityType:
      row.entityType,
    status:
      row.status as StagedHierarchyStatus,
    name:
      stringValue(payload.name) ??
      row.sourceExternalId,
    description:
      stringValue(
        payload.description,
      ) ??
      stringValue(
        payload.technicalCommercialDefinition,
      ),
    rawPayload:
      envelopeOf(row),
  };
}

function domainEntity(
  row: RawIngestionRecord,
): StagedDomainSummary {
  const payload = payloadOf(row);

  return {
    ...baseEntity(row),
    parentCategories:
      stringArray(
        payload.parentCategories,
      ),
    likelySystemFamilies:
      stringArray(
        payload.likelySystemFamilies,
      ),
  };
}

function systemEntity(
  row: RawIngestionRecord,
): StagedSystemSummary {
  const payload = payloadOf(row);

  return {
    ...baseEntity(row),
    domain:
      stringValue(payload.domain),
    purpose:
      stringValue(payload.purpose),
  };
}

function relationPayload(
  rawPayload: unknown,
): Record<string, unknown> {
  const envelope =
    objectValue(rawPayload);

  return objectValue(
    envelope.payload,
  );
}

function relationExternalKey(
  rawPayload: unknown,
  field:
    | "sourceExternalKey"
    | "targetExternalKey",
): string | null {
  return stringValue(
    relationPayload(
      rawPayload,
    )[field],
  );
}

function uniqueStrings(
  values: Array<string | null>,
): string[] {
  return [
    ...new Set(
      values.filter(
        (value): value is string =>
          Boolean(value),
      ),
    ),
  ];
}

export class PrismaStagedHierarchyRepository
  implements IStagedHierarchyRepository {
  public constructor(
    private readonly prisma:
      PrismaClient,
  ) {}

  public async listCategories(
    limit: number,
  ): Promise<StagedHierarchyEntity[]> {
    const rows =
      await this.prisma
        .universalIngestionRecord
        .findMany({
          where: {
            entityType: "CATEGORY",
            sourceExternalId: {
              startsWith:
                "category:global:",
            },
            status: {
              notIn: [
                "REJECTED",
                "FAILED",
              ],
            },
            rawPayload: {
              path: [
                "payload",
                "registryLayer",
              ],
              equals: "CATEGORY",
            },
          },
          orderBy: {
            sourceExternalId:
              "asc",
          },
          take: limit,
          select: {
            id: true,
            sourceExternalId: true,
            entityType: true,
            status: true,
            rawPayload: true,
          },
        });

    return rows.map(
      (row) =>
        baseEntity(
          row as RawIngestionRecord,
        ),
    );
  }

  public async getCategory(
    externalKey: string,
  ): Promise<StagedHierarchyEntity | null> {
    const row =
      await this.prisma
        .universalIngestionRecord
        .findFirst({
          where: {
            entityType: "CATEGORY",
            sourceExternalId:
              externalKey,
            status: {
              notIn: [
                "REJECTED",
                "FAILED",
              ],
            },
            rawPayload: {
              path: [
                "payload",
                "registryLayer",
              ],
              equals: "CATEGORY",
            },
          },
          select: {
            id: true,
            sourceExternalId: true,
            entityType: true,
            status: true,
            rawPayload: true,
          },
        });

    return row
      ? baseEntity(
          row as RawIngestionRecord,
        )
      : null;
  }

  public async listDomainsForCategory(
    categoryExternalKey: string,
    limit: number,
  ): Promise<StagedDomainSummary[]> {
    const relations =
      await this.prisma
        .universalIngestionRecord
        .findMany({
          where: {
            entityType: "RELATION",
            status: {
              notIn: [
                "REJECTED",
                "FAILED",
              ],
            },
            rawPayload: {
              path: [
                "payload",
                "targetExternalKey",
              ],
              equals:
                categoryExternalKey,
            },
          },
          orderBy: {
            sourceExternalId:
              "asc",
          },
          take: limit,
          select: {
            rawPayload: true,
          },
        });

    const domainKeys =
      relations
        .map((relation) => {
          const payload =
            relationPayload(
              relation.rawPayload,
            );

          const relationType =
            stringValue(
              payload.relationType,
            );

          const sourceType =
            stringValue(
              payload.sourceEntityType,
            );

          const targetType =
            stringValue(
              payload.targetEntityType,
            );

          if (
            relationType !==
              "CHILD_OF" ||
            sourceType !==
              "DOMAIN" ||
            targetType !==
              "CATEGORY"
          ) {
            return null;
          }

          return stringValue(
            payload.sourceExternalKey,
          );
        })
        .filter(
          (
            value,
          ): value is string =>
            Boolean(value),
        );

    if (
      domainKeys.length === 0
    ) {
      return [];
    }

    const rows =
      await this.prisma
        .universalIngestionRecord
        .findMany({
          where: {
            entityType: "DOMAIN",
            sourceExternalId: {
              in: domainKeys,
            },
            status: {
              notIn: [
                "REJECTED",
                "FAILED",
              ],
            },
          },
          orderBy: {
            sourceExternalId:
              "asc",
          },
          take: limit,
          select: {
            id: true,
            sourceExternalId: true,
            entityType: true,
            status: true,
            rawPayload: true,
          },
        });

    return rows.map(
      (row) =>
        domainEntity(
          row as RawIngestionRecord,
        ),
    );
  }

  public async getDomain(
    externalKey: string,
  ): Promise<StagedDomainSummary | null> {
    const row =
      await this.prisma
        .universalIngestionRecord
        .findFirst({
          where: {
            entityType: "DOMAIN",
            sourceExternalId:
              externalKey,
            status: {
              notIn: [
                "REJECTED",
                "FAILED",
              ],
            },
          },
          select: {
            id: true,
            sourceExternalId: true,
            entityType: true,
            status: true,
            rawPayload: true,
          },
        });

    return row
      ? domainEntity(
          row as RawIngestionRecord,
        )
      : null;
  }

  public async listSystemsForDomainName(
    domainName: string,
    limit: number,
  ): Promise<StagedSystemSummary[]> {
    const rows =
      await this.prisma
        .universalIngestionRecord
        .findMany({
          where: {
            entityType: "SYSTEM",
            status: {
              notIn: [
                "REJECTED",
                "FAILED",
              ],
            },
            rawPayload: {
              path: [
                "payload",
                "domain",
              ],
              equals: domainName,
            },
          },
          orderBy: {
            sourceExternalId:
              "asc",
          },
          take: limit,
          select: {
            id: true,
            sourceExternalId: true,
            entityType: true,
            status: true,
            rawPayload: true,
          },
        });

    return rows.map(
      (row) =>
        systemEntity(
          row as RawIngestionRecord,
        ),
    );
  }

  public async countEntitiesForDomainName(
    domainName: string,
  ): Promise<StagedDomainEntityCounts> {
    const domainFilter = {
      status: {
        notIn: [
          "REJECTED",
          "FAILED",
        ] as (
          | "REJECTED"
          | "FAILED"
        )[],
      },
      rawPayload: {
        path: [
          "payload",
          "domain",
        ],
        equals: domainName,
      },
    };

    const [
      productModels,
      items,
      services,
    ] = await Promise.all([
      this.prisma
        .universalIngestionRecord
        .count({
          where: {
            entityType:
              "PRODUCT_MODEL",
            ...domainFilter,
          },
        }),

      this.prisma
        .universalIngestionRecord
        .count({
          where: {
            entityType: "ITEM",
            ...domainFilter,
          },
        }),

      this.prisma
        .universalIngestionRecord
        .count({
          where: {
            entityType: "SERVICE",
            ...domainFilter,
          },
        }),
    ]);

    return {
      productModels,
      items,
      services,
    };
  }

  public async getSystem(
    externalKey: string,
  ): Promise<StagedSystemSummary | null> {
    const row =
      await this.prisma
        .universalIngestionRecord
        .findFirst({
          where: {
            entityType: "SYSTEM",
            sourceExternalId:
              externalKey,
            status: {
              notIn: [
                "REJECTED",
                "FAILED",
              ],
            },
          },
          select: {
            id: true,
            sourceExternalId: true,
            entityType: true,
            status: true,
            rawPayload: true,
          },
        });

    return row
      ? systemEntity(
          row as RawIngestionRecord,
        )
      : null;
  }

  public async getSystemDetails(
    externalKey: string,
    limit: number,
  ): Promise<StagedSystemDetails | null> {
    const system =
      await this.getSystem(
        externalKey,
      );

    if (!system) {
      return null;
    }

    const [
      classificationRelations,
      componentRelations,
      classificationCount,
      componentCount,
    ] = await Promise.all([
      this.prisma
        .universalIngestionRecord
        .findMany({
          where: {
            entityType: "RELATION",
            status: {
              notIn: [
                "REJECTED",
                "FAILED",
              ],
            },
            AND: [
              {
                rawPayload: {
                  path: [
                    "payload",
                    "relationType",
                  ],
                  equals:
                    "RELATED_TO",
                },
              },
              {
                rawPayload: {
                  path: [
                    "payload",
                    "sourceExternalKey",
                  ],
                  equals:
                    externalKey,
                },
              },
            ],
          },
          orderBy: {
            sourceExternalId:
              "asc",
          },
          take: limit,
          select: {
            rawPayload: true,
          },
        }),

      this.prisma
        .universalIngestionRecord
        .findMany({
          where: {
            entityType: "RELATION",
            status: {
              notIn: [
                "REJECTED",
                "FAILED",
              ],
            },
            AND: [
              {
                rawPayload: {
                  path: [
                    "payload",
                    "relationType",
                  ],
                  equals:
                    "COMPONENT_OF",
                },
              },
              {
                rawPayload: {
                  path: [
                    "payload",
                    "targetExternalKey",
                  ],
                  equals:
                    externalKey,
                },
              },
            ],
          },
          orderBy: {
            sourceExternalId:
              "asc",
          },
          take: limit,
          select: {
            rawPayload: true,
          },
        }),

      this.prisma
        .universalIngestionRecord
        .count({
          where: {
            entityType: "RELATION",
            status: {
              notIn: [
                "REJECTED",
                "FAILED",
              ],
            },
            AND: [
              {
                rawPayload: {
                  path: [
                    "payload",
                    "relationType",
                  ],
                  equals:
                    "RELATED_TO",
                },
              },
              {
                rawPayload: {
                  path: [
                    "payload",
                    "sourceExternalKey",
                  ],
                  equals:
                    externalKey,
                },
              },
            ],
          },
        }),

      this.prisma
        .universalIngestionRecord
        .count({
          where: {
            entityType: "RELATION",
            status: {
              notIn: [
                "REJECTED",
                "FAILED",
              ],
            },
            AND: [
              {
                rawPayload: {
                  path: [
                    "payload",
                    "relationType",
                  ],
                  equals:
                    "COMPONENT_OF",
                },
              },
              {
                rawPayload: {
                  path: [
                    "payload",
                    "targetExternalKey",
                  ],
                  equals:
                    externalKey,
                },
              },
            ],
          },
        }),
    ]);

    const classificationKeys =
      uniqueStrings(
        classificationRelations.map(
          (relation) =>
            relationExternalKey(
              relation.rawPayload,
              "targetExternalKey",
            ),
        ),
      );

    const componentKeys =
      uniqueStrings(
        componentRelations.map(
          (relation) =>
            relationExternalKey(
              relation.rawPayload,
              "sourceExternalKey",
            ),
        ),
      );

    const [
      classificationRows,
      componentRows,
    ] = await Promise.all([
      classificationKeys.length
        ? this.prisma
            .universalIngestionRecord
            .findMany({
              where: {
                entityType:
                  "CATEGORY",
                sourceExternalId: {
                  in:
                    classificationKeys,
                },
                status: {
                  notIn: [
                    "REJECTED",
                    "FAILED",
                  ],
                },
              },
              orderBy: {
                sourceExternalId:
                  "asc",
              },
              take: limit,
              select: {
                id: true,
                sourceExternalId: true,
                entityType: true,
                status: true,
                rawPayload: true,
              },
            })
        : Promise.resolve([]),

      componentKeys.length
        ? this.prisma
            .universalIngestionRecord
            .findMany({
              where: {
                sourceExternalId: {
                  in:
                    componentKeys,
                },
                entityType: {
                  in: [
                    "PRODUCT_MODEL",
                    "ITEM",
                    "SERVICE",
                  ],
                },
                status: {
                  notIn: [
                    "REJECTED",
                    "FAILED",
                  ],
                },
              },
              orderBy: {
                sourceExternalId:
                  "asc",
              },
              take: limit,
              select: {
                id: true,
                sourceExternalId: true,
                entityType: true,
                status: true,
                rawPayload: true,
              },
            })
        : Promise.resolve([]),
    ]);

    const components =
      componentRows.map(
        (row) =>
          baseEntity(
            row as RawIngestionRecord,
          ),
      );

    const returnedComponentKeys =
      components.map(
        (component) =>
          component.externalKey,
      );

    const metadataRelations =
      returnedComponentKeys.length
        ? await this.prisma
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
                  returnedComponentKeys.map(
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
              orderBy: {
                sourceExternalId:
                  "asc",
              },
              take:
                Math.min(
                  limit * 12,
                  1200,
                ),
              select: {
                rawPayload: true,
              },
            })
        : [];

    const familyKeys:
      string[] = [];

    const manufacturerKeys:
      string[] = [];

    const brandKeys:
      string[] = [];

    for (
      const relation
      of metadataRelations
    ) {
      const payload =
        relationPayload(
          relation.rawPayload,
        );

      const type =
        stringValue(
          payload.relationType,
        );

      const target =
        stringValue(
          payload.targetExternalKey,
        );

      if (!target) {
        continue;
      }

      if (
        type ===
          "BELONGS_TO_FAMILY" ||
        (
          type === "CHILD_OF" &&
          target.startsWith(
            "family:",
          )
        )
      ) {
        familyKeys.push(target);
      }

      if (
        type ===
        "MANUFACTURED_BY"
      ) {
        manufacturerKeys.push(
          target,
        );
      }

      if (
        type ===
        "BRANDED_BY"
      ) {
        brandKeys.push(target);
      }
    }

    const uniqueFamilyKeys =
      uniqueStrings(familyKeys);

    const uniqueManufacturerKeys =
      uniqueStrings(
        manufacturerKeys,
      );

    const uniqueBrandKeys =
      uniqueStrings(brandKeys);

    const [
      familyRows,
      manufacturerRows,
      brandRows,
    ] = await Promise.all([
      uniqueFamilyKeys.length
        ? this.prisma
            .universalIngestionRecord
            .findMany({
              where: {
                entityType:
                  "PRODUCT_FAMILY",
                sourceExternalId: {
                  in:
                    uniqueFamilyKeys,
                },
                status: {
                  notIn: [
                    "REJECTED",
                    "FAILED",
                  ],
                },
              },
              orderBy: {
                sourceExternalId:
                  "asc",
              },
              take: limit,
              select: {
                id: true,
                sourceExternalId: true,
                entityType: true,
                status: true,
                rawPayload: true,
              },
            })
        : Promise.resolve([]),

      uniqueManufacturerKeys.length
        ? this.prisma
            .universalIngestionRecord
            .findMany({
              where: {
                entityType:
                  "MANUFACTURER",
                sourceExternalId: {
                  in:
                    uniqueManufacturerKeys,
                },
                status: {
                  notIn: [
                    "REJECTED",
                    "FAILED",
                  ],
                },
              },
              orderBy: {
                sourceExternalId:
                  "asc",
              },
              take: limit,
              select: {
                id: true,
                sourceExternalId: true,
                entityType: true,
                status: true,
                rawPayload: true,
              },
            })
        : Promise.resolve([]),

      uniqueBrandKeys.length
        ? this.prisma
            .universalIngestionRecord
            .findMany({
              where: {
                entityType: "BRAND",
                sourceExternalId: {
                  in:
                    uniqueBrandKeys,
                },
                status: {
                  notIn: [
                    "REJECTED",
                    "FAILED",
                  ],
                },
              },
              orderBy: {
                sourceExternalId:
                  "asc",
              },
              take: limit,
              select: {
                id: true,
                sourceExternalId: true,
                entityType: true,
                status: true,
                rawPayload: true,
              },
            })
        : Promise.resolve([]),
    ]);

    return {
      system,

      classifications:
        classificationRows.map(
          (row) =>
            baseEntity(
              row as RawIngestionRecord,
            ),
        ),

      components,

      families:
        familyRows.map(
          (row) =>
            baseEntity(
              row as RawIngestionRecord,
            ),
        ),

      manufacturers:
        manufacturerRows.map(
          (row) =>
            baseEntity(
              row as RawIngestionRecord,
            ),
        ),

      brands:
        brandRows.map(
          (row) =>
            baseEntity(
              row as RawIngestionRecord,
            ),
        ),

      counts: {
        classifications:
          classificationCount,
        components:
          componentCount,
      },
    };
  }
}
