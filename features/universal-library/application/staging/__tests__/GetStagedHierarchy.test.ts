import {
  describe,
  expect,
  it,
} from "vitest";

import {
  GetStagedHierarchy,
  type IStagedHierarchyRepository,
  type StagedDomainSummary,
  type StagedHierarchyEntity,
  type StagedSystemDetails,
  type StagedSystemSummary,
} from "../GetStagedHierarchy";

const category:
  StagedHierarchyEntity = {
    id: "category-id",
    externalKey:
      "category:global:security",
    entityType: "CATEGORY",
    status: "RECEIVED",
    name: "Security",
    description: null,
    rawPayload: {},
  };

const domain:
  StagedDomainSummary = {
    id: "domain-id",
    externalKey:
      "domain:global:security-systems",
    entityType: "DOMAIN",
    status: "RECEIVED",
    name: "Security Systems",
    description: null,
    rawPayload: {},
    parentCategories: [
      "Security",
    ],
    likelySystemFamilies: [],
  };

const system:
  StagedSystemSummary = {
    id: "system-id",
    externalKey:
      "system:security:test",
    entityType: "SYSTEM",
    status: "RECEIVED",
    name: "Test System",
    description: null,
    rawPayload: {},
    domain:
      "Security Systems",
    purpose: null,
  };

const systemDetails:
  StagedSystemDetails = {
    system,
    classifications: [
      {
        id: "classification-id",
        externalKey:
          "category:security:test",
        entityType: "CATEGORY",
        status: "RECEIVED",
        name: "Test Classification",
        description: null,
        rawPayload: {},
      },
    ],
    components: [
      {
        id: "model-id",
        externalKey:
          "model:test:001",
        entityType:
          "PRODUCT_MODEL",
        status: "RECEIVED",
        name: "Test Model",
        description: null,
        rawPayload: {},
      },
    ],
    families: [],
    manufacturers: [],
    brands: [],
    counts: {
      classifications: 1,
      components: 1,
    },
  };

function repository():
  IStagedHierarchyRepository {
  return {
    async listCategories() {
      return [category];
    },

    async getCategory(
      externalKey,
    ) {
      return externalKey ===
        category.externalKey
        ? category
        : null;
    },

    async listDomainsForCategory() {
      return [domain];
    },

    async getDomain(
      externalKey,
    ) {
      return externalKey ===
        domain.externalKey
        ? domain
        : null;
    },

    async listSystemsForDomainName() {
      return [system];
    },

    async countEntitiesForDomainName() {
      return {
        productModels: 100,
        items: 20,
        services: 5,
      };
    },

    async getSystem(
      externalKey,
    ) {
      return externalKey ===
        system.externalKey
        ? system
        : null;
    },

    async getSystemDetails(
      externalKey,
    ) {
      return externalKey ===
        system.externalKey
        ? systemDetails
        : null;
    },
  };
}

describe(
  "GetStagedHierarchy",
  () => {
    it(
      "lists staged categories",
      async () => {
        const result =
          await new GetStagedHierarchy(
            repository(),
          ).execute();

        expect(result).toMatchObject({
          level: "CATEGORIES",
          categories: [
            {
              externalKey:
                category.externalKey,
            },
          ],
        });
      },
    );

    it(
      "resolves domains through category selection",
      async () => {
        const result =
          await new GetStagedHierarchy(
            repository(),
          ).execute({
            categoryKey:
              category.externalKey,
          });

        expect(result).toMatchObject({
          level: "DOMAINS",
          category: {
            externalKey:
              category.externalKey,
          },
          domains: [
            {
              externalKey:
                domain.externalKey,
            },
          ],
        });
      },
    );

    it(
      "returns systems and entity counts for a domain",
      async () => {
        const result =
          await new GetStagedHierarchy(
            repository(),
          ).execute({
            domainKey:
              domain.externalKey,
          });

        expect(result).toMatchObject({
          level: "SYSTEMS",
          domain: {
            name:
              "Security Systems",
          },
          systems: [
            {
              name:
                "Test System",
            },
          ],
          counts: {
            productModels: 100,
            items: 20,
            services: 5,
          },
        });
      },
    );

    it(
      "returns system details through explicit staged relations",
      async () => {
        const result =
          await new GetStagedHierarchy(
            repository(),
          ).execute({
            systemKey:
              system.externalKey,
          });

        expect(result).toMatchObject({
          level:
            "SYSTEM_DETAILS",
          details: {
            system: {
              externalKey:
                system.externalKey,
              name:
                "Test System",
            },
            classifications: [
              {
                externalKey:
                  "category:security:test",
              },
            ],
            components: [
              {
                externalKey:
                  "model:test:001",
                entityType:
                  "PRODUCT_MODEL",
              },
            ],
            counts: {
              classifications: 1,
              components: 1,
            },
          },
        });
      },
    );

    it(
      "rejects an invalid limit",
      async () => {
        await expect(
          new GetStagedHierarchy(
            repository(),
          ).execute({
            limit: 101,
          }),
        ).rejects.toThrow(
          "limit must be between 1 and 100.",
        );
      },
    );
  },
);
