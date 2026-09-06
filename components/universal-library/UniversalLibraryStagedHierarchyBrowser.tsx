"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

type Status =
  | "RECEIVED"
  | "NORMALIZED"
  | "MATCHED"
  | "PROCESSING"
  | "PUBLISHED"
  | "NEEDS_REVIEW"
  | "REJECTED"
  | "FAILED";

type BaseEntity = {
  id: string;
  externalKey: string;
  entityType: string;
  status: Status;
  name: string;
  description?: string | null;
};

type DomainEntity = BaseEntity & {
  parentCategories?: string[];
  likelySystemFamilies?: string[];
};

type SystemEntity = BaseEntity & {
  domain?: string | null;
  purpose?: string | null;
};

type Counts = {
  productModels: number;
  items: number;
  services: number;
};

type SystemDetails = {
  system: SystemEntity;
  classifications: BaseEntity[];
  components: BaseEntity[];
  families: BaseEntity[];
  manufacturers: BaseEntity[];
  brands: BaseEntity[];
  counts: {
    classifications: number;
    components: number;
  };
};

type HierarchyResult =
  | {
      level: "CATEGORIES";
      categories: BaseEntity[];
    }
  | {
      level: "DOMAINS";
      category: BaseEntity;
      domains: DomainEntity[];
    }
  | {
      level: "SYSTEMS";
      domain: DomainEntity;
      systems: SystemEntity[];
      counts: Counts;
    }
  | {
      level: "SYSTEM_DETAILS";
      details: SystemDetails;
    };

const tabs = [
  {
    label: "Overview",
    href: "/dashboard/universal-library",
    enabled: false,
  },
  {
    label: "Batches",
    href: "/dashboard/universal-library/batches",
    enabled: true,
  },
  {
    label: "Systems",
    href: "/dashboard/universal-library/systems",
    enabled: true,
  },
  {
    label: "Products",
    href: "/dashboard/universal-library/products",
    enabled: true,
  },
  {
    label: "Manufacturers",
    href: "#",
    enabled: false,
  },
  {
    label: "Families",
    href: "#",
    enabled: false,
  },
  {
    label: "Evidence",
    href: "#",
    enabled: false,
  },
  {
    label: "Review",
    href: "#",
    enabled: false,
  },
  {
    label: "Population",
    href: "/dashboard/universal-library/population",
    enabled: true,
  },
] as const;

function extractResult(
  payload: unknown,
): HierarchyResult | null {
  if (
    !payload ||
    typeof payload !== "object"
  ) {
    return null;
  }

  const root =
    payload as Record<string, unknown>;

  const nested =
    root.data &&
    typeof root.data === "object"
      ? root.data
      : root;

  if (
    !nested ||
    typeof nested !== "object"
  ) {
    return null;
  }

  return nested as HierarchyResult;
}

function statusLabel(
  status: Status,
): string {
  switch (status) {
    case "RECEIVED":
      return "STAGED";
    case "NEEDS_REVIEW":
      return "NEEDS REVIEW";
    case "PUBLISHED":
      return "PUBLISHED";
    case "NORMALIZED":
      return "NORMALIZED";
    case "MATCHED":
      return "MATCHED";
    case "PROCESSING":
      return "PROCESSING";
    case "REJECTED":
      return "REJECTED";
    case "FAILED":
      return "FAILED";
  }
}

function statusClass(
  status: Status,
): string {
  if (status === "PUBLISHED") {
    return "border-emerald-400/30 bg-emerald-500/10 text-emerald-300";
  }

  if (status === "NEEDS_REVIEW") {
    return "border-amber-400/30 bg-amber-500/10 text-amber-300";
  }

  if (
    status === "FAILED" ||
    status === "REJECTED"
  ) {
    return "border-red-400/30 bg-red-500/10 text-red-300";
  }

  return "border-indigo-400/30 bg-indigo-500/10 text-indigo-300";
}

function StatusBadge({
  status,
}: {
  status: Status;
}) {
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${statusClass(
        status,
      )}`}
    >
      {statusLabel(status)}
    </span>
  );
}

function MetricCard({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-2xl border border-[#222a45] bg-[#0b1224] p-4">
      <div className="min-h-[32px] text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
        {label}
      </div>

      <div className="mt-2 text-2xl font-semibold text-white">
        {value.toLocaleString()}
      </div>
    </div>
  );
}

export default function UniversalLibraryStagedHierarchyBrowser() {
  const [data, setData] =
    useState<HierarchyResult | null>(
      null,
    );

  const [
    selectedCategory,
    setSelectedCategory,
  ] =
    useState<BaseEntity | null>(
      null,
    );

  const [
    selectedDomain,
    setSelectedDomain,
  ] =
    useState<DomainEntity | null>(
      null,
    );

  const [
    selectedSystem,
    setSelectedSystem,
  ] =
    useState<SystemEntity | null>(
      null,
    );

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(
      null,
    );

  const [search, setSearch] =
    useState("");

  const load = useCallback(
    async (
      params?: {
        categoryKey?: string;
        domainKey?: string;
        systemKey?: string;
      },
    ) => {
      setLoading(true);
      setError(null);

      try {
        const query =
          new URLSearchParams();

        query.set(
          "limit",
          "100",
        );

        if (params?.categoryKey) {
          query.set(
            "categoryKey",
            params.categoryKey,
          );
        }

        if (params?.domainKey) {
          query.set(
            "domainKey",
            params.domainKey,
          );
        }

        if (params?.systemKey) {
          query.set(
            "systemKey",
            params.systemKey,
          );
        }

        const response =
          await fetch(
            `/api/universal-library/staging/hierarchy?${query.toString()}`,
            {
              cache: "no-store",
            },
          );

        const payload =
          await response.json();

        if (!response.ok) {
          const message =
            payload?.error?.message;

          throw new Error(
            typeof message === "string"
              ? message
              : "Failed to load staged hierarchy.",
          );
        }

        const result =
          extractResult(payload);

        if (!result) {
          throw new Error(
            "Staged hierarchy returned an invalid response.",
          );
        }

        setData(result);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Failed to load staged hierarchy.",
        );
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const visibleItems =
    useMemo<BaseEntity[]>(() => {
      const term =
        search
          .trim()
          .toLowerCase();

      if (!data) {
        return [];
      }

      let items: BaseEntity[];

      if (
        data.level ===
        "CATEGORIES"
      ) {
        items =
          data.categories;
      } else if (
        data.level ===
        "DOMAINS"
      ) {
        items =
          data.domains;
      } else if (
        data.level ===
        "SYSTEMS"
      ) {
        items =
          data.systems;
      } else {
        items =
          data.details.components;
      }

      if (!term) {
        return items;
      }

      return items.filter(
        (item) =>
          item.name
            .toLowerCase()
            .includes(term) ||
          item.externalKey
            .toLowerCase()
            .includes(term) ||
          item.description
            ?.toLowerCase()
            .includes(term),
      );
    }, [
      data,
      search,
    ]);

  async function openCategory(
    category: BaseEntity,
  ) {
    setSelectedCategory(
      category,
    );
    setSelectedDomain(
      null,
    );
    setSelectedSystem(
      null,
    );
    setSearch("");

    await load({
      categoryKey:
        category.externalKey,
    });
  }

  async function openDomain(
    domain: DomainEntity,
  ) {
    setSelectedDomain(
      domain,
    );
    setSelectedSystem(
      null,
    );
    setSearch("");

    await load({
      domainKey:
        domain.externalKey,
    });
  }

  async function openSystem(
    system: SystemEntity,
  ) {
    setSelectedSystem(
      system,
    );
    setSearch("");

    await load({
      systemKey:
        system.externalKey,
    });
  }

  async function backToCategories() {
    setSelectedCategory(
      null,
    );
    setSelectedDomain(
      null,
    );
    setSelectedSystem(
      null,
    );
    setSearch("");

    await load();
  }

  async function backToDomains() {
    if (!selectedCategory) {
      await backToCategories();
      return;
    }

    setSelectedDomain(
      null,
    );
    setSelectedSystem(
      null,
    );
    setSearch("");

    await load({
      categoryKey:
        selectedCategory.externalKey,
    });
  }

  async function backToSystems() {
    if (!selectedDomain) {
      await backToCategories();
      return;
    }

    setSelectedSystem(
      null,
    );
    setSearch("");

    await load({
      domainKey:
        selectedDomain.externalKey,
    });
  }

  return (
    <div className="min-h-screen bg-[#070b16] text-slate-100">
      <div className="border-b border-[#1b2238] bg-[#090e1c]">
        <div className="mx-auto max-w-[1600px] px-5 pt-6">
          <div className="flex flex-wrap items-end justify-between gap-5">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-indigo-400">
                Universal Commercial Library
              </div>

              <h1 className="mt-2 text-2xl font-semibold text-white">
                Staged Hierarchy Explorer
              </h1>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
                Inspect governed staged Categories, Core Domains, Systems and commercial components before publication.
              </p>
            </div>

            <div className="rounded-xl border border-indigo-400/20 bg-indigo-500/5 px-4 py-3 text-xs text-indigo-200">
              Read-only staging view Â· No publication
            </div>
          </div>

          <div className="mt-6 flex gap-2 overflow-x-auto pb-0">
            {tabs.map(
              (tab) =>
                tab.enabled ? (
                  <Link
                    key={tab.label}
                    href={tab.href}
                    className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition ${
                      tab.label ===
                      "Systems"
                        ? "border-indigo-400 text-white"
                        : "border-transparent text-slate-500 hover:text-slate-200"
                    }`}
                  >
                    {tab.label}
                  </Link>
                ) : (
                  <span
                    key={tab.label}
                    className="cursor-not-allowed whitespace-nowrap border-b-2 border-transparent px-4 py-3 text-sm font-medium text-slate-700"
                  >
                    {tab.label}
                  </span>
                ),
            )}
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-[1600px] px-5 py-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <button
              type="button"
              onClick={() => {
                void backToCategories();
              }}
              className="text-slate-400 transition hover:text-white"
            >
              Categories
            </button>

            {selectedCategory ? (
              <>
                <span className="text-slate-700">
                  /
                </span>

                <button
                  type="button"
                  onClick={() => {
                    void backToDomains();
                  }}
                  className="text-slate-300 transition hover:text-white"
                >
                  {
                    selectedCategory.name
                  }
                </button>
              </>
            ) : null}

            {selectedDomain ? (
              <>
                <span className="text-slate-700">
                  /
                </span>

                {selectedSystem ? (
                  <button
                    type="button"
                    onClick={() => {
                      void backToSystems();
                    }}
                    className="text-slate-300 transition hover:text-white"
                  >
                    {
                      selectedDomain.name
                    }
                  </button>
                ) : (
                  <span className="font-medium text-white">
                    {
                      selectedDomain.name
                    }
                  </span>
                )}
              </>
            ) : null}

            {selectedSystem ? (
              <>
                <span className="text-slate-700">
                  /
                </span>

                <span className="font-medium text-white">
                  {
                    selectedSystem.name
                  }
                </span>
              </>
            ) : null}
          </div>

          <input
            value={search}
            onChange={(
              event,
            ) =>
              setSearch(
                event.target.value,
              )
            }
            placeholder={
              data?.level ===
              "SYSTEM_DETAILS"
                ? "Search loaded components..."
                : "Search current level..."
            }
            className="w-full max-w-sm rounded-xl border border-[#222a45] bg-[#0b1224] px-4 py-2.5 text-sm text-white outline-none placeholder:text-slate-600 focus:border-indigo-400/50"
          />
        </div>

        {data?.level === "SYSTEMS" ? (
          <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <MetricCard
              label="Product Models"
              value={
                data.counts
                  .productModels
              }
            />

            <MetricCard
              label="Items"
              value={
                data.counts.items
              }
            />

            <MetricCard
              label="Services"
              value={
                data.counts.services
              }
            />
          </div>
        ) : null}

        {data?.level ===
        "SYSTEM_DETAILS" ? (
          <>
            <div className="mb-5 rounded-2xl border border-[#222a45] bg-[#0b1224] p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-indigo-400">
                    System
                  </div>

                  <h2 className="mt-2 text-xl font-semibold text-white">
                    {
                      data.details
                        .system.name
                    }
                  </h2>

                  <div className="mt-1 break-all text-[10px] text-slate-600">
                    {
                      data.details
                        .system
                        .externalKey
                    }
                  </div>

                  {data.details.system
                    .purpose ? (
                    <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-400">
                      {
                        data.details
                          .system
                          .purpose
                      }
                    </p>
                  ) : null}
                </div>

                <StatusBadge
                  status={
                    data.details
                      .system.status
                  }
                />
              </div>
            </div>

            <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
              <MetricCard
                label="Classifications"
                value={
                  data.details.counts
                    .classifications
                }
              />

              <MetricCard
                label="Components"
                value={
                  data.details.counts
                    .components
                }
              />

              <MetricCard
                label="Families Loaded"
                value={
                  data.details
                    .families.length
                }
              />

              <MetricCard
                label="Manufacturers Loaded"
                value={
                  data.details
                    .manufacturers
                    .length
                }
              />

              <MetricCard
                label="Brands Loaded"
                value={
                  data.details
                    .brands.length
                }
              />
            </div>

            <div className="mb-5 grid grid-cols-1 gap-4 xl:grid-cols-3">
              <div className="rounded-2xl border border-[#222a45] bg-[#0b1224] p-5">
                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                  Product Classifications
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {data.details.classifications.map(
                    (item) => (
                      <span
                        key={
                          item.externalKey
                        }
                        className="rounded-lg border border-indigo-400/20 bg-indigo-500/5 px-3 py-2 text-xs text-indigo-200"
                      >
                        {item.name}
                      </span>
                    ),
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-[#222a45] bg-[#0b1224] p-5">
                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                  Manufacturers
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {data.details.manufacturers.map(
                    (item) => (
                      <span
                        key={
                          item.externalKey
                        }
                        className="rounded-lg border border-[#28304c] bg-[#10182d] px-3 py-2 text-xs text-slate-300"
                      >
                        {item.name}
                      </span>
                    ),
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-[#222a45] bg-[#0b1224] p-5">
                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                  Brands
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {data.details.brands.map(
                    (item) => (
                      <span
                        key={
                          item.externalKey
                        }
                        className="rounded-lg border border-[#28304c] bg-[#10182d] px-3 py-2 text-xs text-slate-300"
                      >
                        {item.name}
                      </span>
                    ),
                  )}
                </div>
              </div>
            </div>

            {data.details.families
              .length > 0 ? (
              <div className="mb-5 rounded-2xl border border-[#222a45] bg-[#0b1224] p-5">
                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                  Product Families
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {data.details.families.map(
                    (item) => (
                      <span
                        key={
                          item.externalKey
                        }
                        className="rounded-lg border border-[#28304c] bg-[#10182d] px-3 py-2 text-xs text-slate-300"
                      >
                        {item.name}
                      </span>
                    ),
                  )}
                </div>
              </div>
            ) : null}
          </>
        ) : null}

        {error ? (
          <div className="rounded-2xl border border-red-400/20 bg-red-500/10 p-5 text-sm text-red-300">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="rounded-2xl border border-[#222a45] bg-[#0b1224] p-8 text-center text-sm text-slate-500">
            Loading staged hierarchy...
          </div>
        ) : null}

        {!loading &&
        !error &&
        visibleItems.length === 0 ? (
          <div className="rounded-2xl border border-[#222a45] bg-[#0b1224] p-8 text-center">
            <div className="text-sm font-medium text-slate-300">
              No records found at this level.
            </div>

            <div className="mt-2 text-xs text-slate-600">
              This does not publish or modify staged data.
            </div>
          </div>
        ) : null}

        {!loading &&
        !error &&
        visibleItems.length > 0 ? (
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            {visibleItems.map(
              (item) => {
                const domain =
                  item as DomainEntity;

                const system =
                  item as SystemEntity;

                const isSystemDetails =
                  data?.level ===
                  "SYSTEM_DETAILS";

                return (
                  <button
                    key={
                      item.externalKey
                    }
                    type="button"
                    disabled={
                      isSystemDetails
                    }
                    onClick={() => {
                      if (
                        data?.level ===
                        "CATEGORIES"
                      ) {
                        void openCategory(
                          item,
                        );
                      }

                      if (
                        data?.level ===
                        "DOMAINS"
                      ) {
                        void openDomain(
                          domain,
                        );
                      }

                      if (
                        data?.level ===
                        "SYSTEMS"
                      ) {
                        void openSystem(
                          system,
                        );
                      }
                    }}
                    className={`rounded-2xl border border-[#222a45] bg-[#0b1224] p-5 text-left transition ${
                      isSystemDetails
                        ? "cursor-default"
                        : "hover:border-indigo-400/40 hover:bg-[#0d152b]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="text-base font-semibold text-white">
                          {
                            item.name
                          }
                        </div>

                        <div className="mt-1 break-all text-[10px] font-medium uppercase tracking-[0.08em] text-slate-600">
                          {
                            item.externalKey
                          }
                        </div>
                      </div>

                      <StatusBadge
                        status={
                          item.status
                        }
                      />
                    </div>

                    {item.description ? (
                      <p className="mt-4 line-clamp-3 text-sm leading-6 text-slate-400">
                        {
                          item.description
                        }
                      </p>
                    ) : null}

                    {data?.level ===
                      "DOMAINS" &&
                    domain
                      .likelySystemFamilies
                      ?.length ? (
                      <div className="mt-4">
                        <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-600">
                          Likely System Families
                        </div>

                        <div className="mt-2 flex flex-wrap gap-2">
                          {domain.likelySystemFamilies
                            .slice(
                              0,
                              4,
                            )
                            .map(
                              (
                                family,
                              ) => (
                                <span
                                  key={
                                    family
                                  }
                                  className="rounded-lg border border-[#28304c] bg-[#10182d] px-2.5 py-1 text-xs text-slate-400"
                                >
                                  {
                                    family
                                  }
                                </span>
                              ),
                            )}
                        </div>
                      </div>
                    ) : null}

                    {data?.level ===
                    "SYSTEMS" ? (
                      <div className="mt-4 space-y-2">
                        {system.domain ? (
                          <div className="text-xs text-slate-500">
                            Domain:{" "}
                            <span className="text-slate-300">
                              {
                                system.domain
                              }
                            </span>
                          </div>
                        ) : null}

                        {system.purpose ? (
                          <div className="text-sm leading-6 text-slate-400">
                            {
                              system.purpose
                            }
                          </div>
                        ) : null}

                        <div className="pt-2 text-xs font-semibold uppercase tracking-[0.12em] text-indigo-400">
                          Open System â†’
                        </div>
                      </div>
                    ) : isSystemDetails ? (
                      <div className="mt-4 text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">
                        {item.entityType.replace(
                          /_/g,
                          " ",
                        )}
                      </div>
                    ) : (
                      <div className="mt-4 text-xs font-semibold uppercase tracking-[0.12em] text-indigo-400">
                        Open â†’
                      </div>
                    )}
                  </button>
                );
              },
            )}
          </div>
        ) : null}
      </main>
    </div>
  );
}
