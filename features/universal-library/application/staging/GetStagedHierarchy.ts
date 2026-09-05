export type StagedHierarchyStatus =
  | "RECEIVED"
  | "NORMALIZED"
  | "MATCHED"
  | "PROCESSING"
  | "PUBLISHED"
  | "NEEDS_REVIEW"
  | "REJECTED"
  | "FAILED";

export interface StagedHierarchyEntity {
  id: string;
  externalKey: string;
  entityType: string;
  status: StagedHierarchyStatus;
  name: string;
  description: string | null;
  rawPayload: Record<string, unknown>;
}

export interface StagedDomainSummary
  extends StagedHierarchyEntity {
  parentCategories: string[];
  likelySystemFamilies: string[];
}

export interface StagedSystemSummary
  extends StagedHierarchyEntity {
  domain: string | null;
  purpose: string | null;
}

export interface StagedDomainEntityCounts {
  productModels: number;
  items: number;
  services: number;
}

export interface StagedSystemDetails {
  system: StagedSystemSummary;

  classifications: StagedHierarchyEntity[];

  components: StagedHierarchyEntity[];

  families: StagedHierarchyEntity[];

  manufacturers: StagedHierarchyEntity[];

  brands: StagedHierarchyEntity[];

  counts: {
    classifications: number;
    components: number;
  };
}

export interface IStagedHierarchyRepository {
  listCategories(
    limit: number,
  ): Promise<StagedHierarchyEntity[]>;

  getCategory(
    externalKey: string,
  ): Promise<StagedHierarchyEntity | null>;

  listDomainsForCategory(
    categoryExternalKey: string,
    limit: number,
  ): Promise<StagedDomainSummary[]>;

  getDomain(
    externalKey: string,
  ): Promise<StagedDomainSummary | null>;

  listSystemsForDomainName(
    domainName: string,
    limit: number,
  ): Promise<StagedSystemSummary[]>;

  countEntitiesForDomainName(
    domainName: string,
  ): Promise<StagedDomainEntityCounts>;

  getSystem(
    externalKey: string,
  ): Promise<StagedSystemSummary | null>;

  getSystemDetails(
    externalKey: string,
    limit: number,
  ): Promise<StagedSystemDetails | null>;
}

export interface GetStagedHierarchyInput {
  categoryKey?: string;
  domainKey?: string;
  systemKey?: string;
  limit?: number;
}

export type GetStagedHierarchyResult =
  | {
      level: "CATEGORIES";
      categories: StagedHierarchyEntity[];
    }
  | {
      level: "DOMAINS";
      category: StagedHierarchyEntity;
      domains: StagedDomainSummary[];
    }
  | {
      level: "SYSTEMS";
      domain: StagedDomainSummary;
      systems: StagedSystemSummary[];
      counts: StagedDomainEntityCounts;
    }
  | {
      level: "SYSTEM_DETAILS";
      details: StagedSystemDetails;
    };

function boundedLimit(
  value: number | undefined,
): number {
  if (value === undefined) {
    return 50;
  }

  if (
    !Number.isInteger(value) ||
    value < 1 ||
    value > 100
  ) {
    throw new Error(
      "limit must be between 1 and 100.",
    );
  }

  return value;
}

export class GetStagedHierarchy {
  public constructor(
    private readonly repository:
      IStagedHierarchyRepository,
  ) {}

  public async execute(
    input: GetStagedHierarchyInput = {},
  ): Promise<GetStagedHierarchyResult> {
    const limit = boundedLimit(
      input.limit,
    );

    const systemKey =
      input.systemKey?.trim();

    if (systemKey) {
      const details =
        await this.repository
          .getSystemDetails(
            systemKey,
            limit,
          );

      if (!details) {
        throw new Error(
          "STAGED_SYSTEM_NOT_FOUND",
        );
      }

      return {
        level: "SYSTEM_DETAILS",
        details,
      };
    }

    const domainKey =
      input.domainKey?.trim();

    if (domainKey) {
      const domain =
        await this.repository.getDomain(
          domainKey,
        );

      if (!domain) {
        throw new Error(
          "STAGED_DOMAIN_NOT_FOUND",
        );
      }

      const [systems, counts] =
        await Promise.all([
          this.repository
            .listSystemsForDomainName(
              domain.name,
              limit,
            ),
          this.repository
            .countEntitiesForDomainName(
              domain.name,
            ),
        ]);

      return {
        level: "SYSTEMS",
        domain,
        systems,
        counts,
      };
    }

    const categoryKey =
      input.categoryKey?.trim();

    if (categoryKey) {
      const category =
        await this.repository.getCategory(
          categoryKey,
        );

      if (!category) {
        throw new Error(
          "STAGED_CATEGORY_NOT_FOUND",
        );
      }

      const domains =
        await this.repository
          .listDomainsForCategory(
            categoryKey,
            limit,
          );

      return {
        level: "DOMAINS",
        category,
        domains,
      };
    }

    return {
      level: "CATEGORIES",
      categories:
        await this.repository
          .listCategories(limit),
    };
  }
}
