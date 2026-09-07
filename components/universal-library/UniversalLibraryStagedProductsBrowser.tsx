"use client";


import {
  useCallback,
  useEffect,
  useState,
} from "react";

import type {
  StagedProductEntityType,
  StagedProductSummary,
  StagedProductsResult,
} from "@/features/universal-library/application/staging-products/GetStagedProducts";

interface Filters {
  search: string;
  entityType: string;
  manufacturer: string;
  brand: string;
  family: string;
  system: string;
  status: string;
}

const emptyFilters: Filters = {
  search: "",
  entityType: "",
  manufacturer: "",
  brand: "",
  family: "",
  system: "",
  status: "",
};


function objectValue(
  value: unknown,
): Record<string, unknown> {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function extractResult(
  payload: unknown,
): StagedProductsResult {
  const root = objectValue(payload);
  const data = objectValue(
    root.data ?? root,
  );

  const globalTotals =
    objectValue(data.globalTotals);

  return {
    items: Array.isArray(data.items)
      ? (data.items as StagedProductSummary[])
      : [],
    total:
      typeof data.total === "number"
        ? data.total
        : 0,
    nextCursor:
      typeof data.nextCursor ===
      "string"
        ? data.nextCursor
        : null,
    globalTotals: {
      totalStagedCommercialRecords:
        typeof globalTotals.totalStagedCommercialRecords === "number"
          ? globalTotals.totalStagedCommercialRecords
          : 0,
      totalProductModels:
        typeof globalTotals.totalProductModels === "number"
          ? globalTotals.totalProductModels
          : 0,
      totalItems:
        typeof globalTotals.totalItems === "number"
          ? globalTotals.totalItems
          : 0,
      totalServices:
        typeof globalTotals.totalServices === "number"
          ? globalTotals.totalServices
          : 0,
    },
  };
}

function displayType(
  type: StagedProductEntityType,
): string {
  return type.replace(/_/g, " ");
}

function payloadOf(
  product: StagedProductSummary,
): Record<string, unknown> {
  return objectValue(
    product.rawPayload.payload,
  );
}

function textValue(
  value: unknown,
): string | null {
  return typeof value === "string" &&
    value.trim()
    ? value.trim()
    : null;
}

function firstText(
  payload: Record<string, unknown>,
  keys: string[],
): string | null {
  for (const key of keys) {
    const value =
      textValue(payload[key]);

    if (value) {
      return value;
    }
  }

  return null;
}

function statusStyle(
  status: string,
): string {
  if (
    status === "NEEDS_REVIEW"
  ) {
    return "border-amber-400/30 bg-amber-500/10 text-amber-300";
  }

  if (
    status === "RECEIVED"
  ) {
    return "border-indigo-400/30 bg-indigo-500/10 text-indigo-300";
  }

  return "border-slate-500/30 bg-slate-700/30 text-slate-300";
}

function MetricCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string | number;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-[#222a45] bg-[#0b1224] p-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold text-white">
        {value}
      </div>
      <div className="mt-1 text-xs text-slate-600">
        {detail}
      </div>
    </div>
  );
}

function ProductRow({
  product,
}: {
  product: StagedProductSummary;
}) {
  const payload =
    payloadOf(product);

  const model =
    product.modelNumber ??
    firstText(payload, [
      "model",
      "modelNumber",
      "mpn",
      "sku",
    ]);

  const lifecycle =
    product.lifecycle ??
    firstText(payload, [
      "lifecycle",
      "lifecycleStatus",
      "status",
    ]);

  const classification =
    firstText(payload, [
      "category",
      "classification",
      "productType",
    ]);

  const technology =
    firstText(payload, [
      "technology",
      "protocol",
      "systemRole",
    ]);

  return (
    <details className="group overflow-hidden rounded-2xl border border-[#222a45] bg-[#0b1224] transition open:border-indigo-400/40">
      <summary className="grid cursor-pointer list-none gap-4 px-4 py-4 lg:grid-cols-[minmax(220px,2fr)_minmax(120px,1fr)_minmax(140px,1fr)_minmax(140px,1fr)_auto] lg:items-center">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-white">
            {product.name ||
              product.externalKey}
          </div>

          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
            <span>
              {displayType(
                product.entityType,
              )}
            </span>
            <span>
              Model: {model || "-"}
            </span>
          </div>
        </div>

        <div className="min-w-0 text-xs text-slate-400">
          <div className="truncate font-medium text-slate-300">
            {product.manufacturer ||
              "Unassigned"}
          </div>
          <div className="mt-1 truncate text-slate-600">
            {product.brand ||
              "No brand"}
          </div>
        </div>

        <div className="min-w-0 text-xs text-slate-400">
          <div className="truncate">
            {product.family ||
              "No family"}
          </div>
          <div className="mt-1 truncate text-slate-600">
            {classification ||
              "No classification"}
          </div>
        </div>

        <div className="min-w-0 text-xs text-slate-400">
          <div className="truncate">
            {product.system ||
              "No system relation"}
          </div>
          <div className="mt-1 truncate text-slate-600">
            {lifecycle ||
              "Lifecycle unknown"}
          </div>
        </div>

        <div className="flex justify-end">
          <span
            className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${statusStyle(
              product.status,
            )}`}
          >
            {product.status.replace(
              /_/g,
              " ",
            )}
          </span>
        </div>
      </summary>

      <div className="border-t border-[#222a45] bg-[#080e1c]/70 p-5">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            [
              "External Key",
              product.externalKey,
            ],
            [
              "Manufacturer",
              product.manufacturer ||
                "-",
            ],
            [
              "Brand",
              product.brand || "-",
            ],
            [
              "Family",
              product.family || "-",
            ],
            [
              "System",
              product.system || "-",
            ],
            [
              "Model",
              model || "-",
            ],
            [
              "Technology",
              technology || "-",
            ],
            [
              "Lifecycle",
              lifecycle || "-",
            ],
          ].map(([label, value]) => (
            <div
              key={label}
              className="rounded-xl border border-[#1b2340] bg-[#0b1224] p-3"
            >
              <div className="text-[10px] uppercase tracking-[0.14em] text-slate-600">
                {label}
              </div>
              <div className="mt-1 break-words text-sm text-slate-200">
                {value}
              </div>
            </div>
          ))}
        </div>

        {product.description ? (
          <div className="mt-4 rounded-xl border border-[#1b2340] bg-[#0b1224] p-4 text-sm leading-6 text-slate-400">
            {product.description}
          </div>
        ) : null}

        <details className="mt-4">
          <summary className="cursor-pointer text-xs font-medium text-indigo-300">
            View staged payload
          </summary>

          <pre className="mt-3 max-h-[420px] overflow-auto rounded-xl border border-[#1b2340] bg-[#050914] p-4 text-xs leading-5 text-slate-400">
            {JSON.stringify(
              product.rawPayload,
              null,
              2,
            )}
          </pre>
        </details>
      </div>
    </details>
  );
}

export default function UniversalLibraryStagedProductsBrowser() {
  const [filters, setFilters] =
    useState<Filters>(
      emptyFilters,
    );

  const [items, setItems] =
    useState<
      StagedProductSummary[]
    >([]);

  const [total, setTotal] =
    useState(0);

  const [globalTotals, setGlobalTotals] =
    useState<StagedProductsResult["globalTotals"]>({
      totalStagedCommercialRecords: 0,
      totalProductModels: 0,
      totalItems: 0,
      totalServices: 0,
    });

  const [nextCursor, setNextCursor] =
    useState<string | null>(null);

  const [cursorStack, setCursorStack] =
    useState<Array<string | null>>([null]);

  const currentCursor =
    cursorStack.at(-1) ?? null;
const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(null);

  const loadProducts =
    useCallback(async () => {
      setLoading(true);
      setError(null);

      try {
        const params =
          new URLSearchParams();

        params.set(
          "limit",
          "50",
        );


        if (currentCursor) {
          params.set(
            "cursor",
            currentCursor,
          );
        }
for (const [
          key,
          value,
        ] of Object.entries(
          filters,
        )) {
          const trimmed =
            value.trim();

          if (trimmed) {
            params.set(
              key,
              trimmed,
            );
          }
        }

        const response =
          await fetch(
            `/api/universal-library/staging/products?${params.toString()}`,
            {
              cache: "no-store",
            },
          );

        if (!response.ok) {
          throw new Error(
            `Staged products request failed (${response.status}).`,
          );
        }

        const result =
          extractResult(
            await response.json(),
          );

        setItems(result.items);
        setTotal(result.total);
        setGlobalTotals(
          result.globalTotals,
        );

        setNextCursor(
          result.nextCursor ?? null,
        );
} catch (caught) {
        setItems([]);
        setTotal(0);
        setGlobalTotals({
          totalStagedCommercialRecords: 0,
          totalProductModels: 0,
          totalItems: 0,
          totalServices: 0,
        });

        setNextCursor(null);
setError(
          caught instanceof Error
            ? caught.message
            : "Failed to load staged products.",
        );
      } finally {
        setLoading(false);
      }
    }, [currentCursor, filters]);

  useEffect(() => {
    const timeout =
      window.setTimeout(
        () => {
          void loadProducts();
        },
        250,
      );

    return () =>
      window.clearTimeout(
        timeout,
      );
  }, [loadProducts]);

  const updateFilter = (
    key: keyof Filters,
    value: string,
  ) => {

    setCursorStack([null]);
    setNextCursor(null);
setFilters(
      (current) => ({
        ...current,
        [key]: value,
      }),
    );
  };

  return (
    <main
      dir="ltr"
      className="min-h-screen bg-[#060b1a] px-4 py-7 text-slate-200 sm:px-7"
    >
      <div className="w-full min-w-0 space-y-6">
        <header className="rounded-2xl border border-[#222a45] bg-[#0b1224] p-6">
          <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-start">
            <div>
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full border border-indigo-400/30 bg-indigo-500/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-indigo-300">
                  Universal Commercial Library
                </span>

                <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-300">
                  Governed Staging
                </span>
              </div>

              <h1 className="mt-4 text-3xl font-bold tracking-tight text-white">
                Staged Product Intelligence
              </h1>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
                Inspect product models, items and services currently held in governed UCL staging. Nothing shown here is automatically published to the canonical library.
              </p>
            </div>

            <div className="rounded-xl border border-[#313a5a] bg-[#080e1c] px-4 py-3 text-xs text-slate-400">
              <div className="font-semibold text-slate-200">
                Huge Library - Small Working Set
              </div>
              <div className="mt-1">
                Results are returned in bounded pages of 50.
              </div>
            </div>
          </div>


        </header>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
          <MetricCard
            label="Total Staged Commercial Records"
            value={globalTotals.totalStagedCommercialRecords.toLocaleString()}
            detail="Global governed staging"
          />

          <MetricCard
            label="Total Product Models"
            value={globalTotals.totalProductModels.toLocaleString()}
            detail="Global governed staging"
          />

          <MetricCard
            label="Total Items"
            value={globalTotals.totalItems.toLocaleString()}
            detail="Global governed staging"
          />

          <MetricCard
            label="Total Services"
            value={globalTotals.totalServices.toLocaleString()}
            detail="Global governed staging"
          />

          <MetricCard
            label="Matching Records"
            value={total.toLocaleString()}
            detail="Current filtered server result"
          />

          <MetricCard
            label="Loaded / Current Page"
            value={items.length}
            detail="Current bounded page only"
          />
        </section>

        <section className="rounded-2xl border border-[#222a45] bg-[#0b1224] p-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <input
              aria-label="Search staged products"
              value={filters.search}
              onChange={(event) =>
                updateFilter(
                  "search",
                  event.target.value,
                )
              }
              placeholder="Search name, model, manufacturer, family..."
              className="rounded-xl border border-[#313a5a] bg-[#080e1c] px-4 py-2.5 text-sm text-slate-200 outline-none placeholder:text-slate-600 focus:border-indigo-400 md:col-span-2"
            />

            <select
              aria-label="Entity type"
              value={
                filters.entityType
              }
              onChange={(event) =>
                updateFilter(
                  "entityType",
                  event.target.value,
                )
              }
              className="rounded-xl border border-[#313a5a] bg-[#080e1c] px-3 py-2.5 text-sm text-slate-200 outline-none"
            >
              <option value="">
                All entity types
              </option>
              <option value="PRODUCT_MODEL">
                Product Model
              </option>
              <option value="ITEM">
                Item
              </option>
              <option value="SERVICE">
                Service
              </option>
            </select>

            <select
              aria-label="Staging status"
              value={filters.status}
              onChange={(event) =>
                updateFilter(
                  "status",
                  event.target.value,
                )
              }
              className="rounded-xl border border-[#313a5a] bg-[#080e1c] px-3 py-2.5 text-sm text-slate-200 outline-none"
            >
              <option value="">
                All valid statuses
              </option>
              <option value="RECEIVED">
                Received
              </option>
              <option value="NEEDS_REVIEW">
                Needs Review
              </option>
            </select>

            {[
              [
                "manufacturer",
                "Manufacturer",
              ],
              ["brand", "Brand"],
              ["family", "Family"],
              ["system", "System"],
            ].map(
              ([key, label]) => (
                <input
                  key={key}
                  aria-label={label}
                  value={
                    filters[
                      key as keyof Filters
                    ]
                  }
                  onChange={(
                    event,
                  ) =>
                    updateFilter(
                      key as keyof Filters,
                      event.target
                        .value,
                    )
                  }
                  placeholder={label}
                  className="rounded-xl border border-[#313a5a] bg-[#080e1c] px-3 py-2.5 text-sm text-slate-200 outline-none placeholder:text-slate-600 focus:border-indigo-400"
                />
              ),
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[#1b2340] pt-4 text-xs text-slate-500">
            <span>
              Showing{" "}
              <strong className="text-slate-200">
                {items.length}
              </strong>{" "}
              of{" "}
              {total.toLocaleString()}{" "}
              matching records
            </span>

            <div className="flex gap-4">
              <button
                type="button"
                onClick={() => {
                  setCursorStack([null]);
                  setNextCursor(null);
                  setFilters(
                    emptyFilters,
                  );
                }}
                className="text-indigo-300 hover:text-indigo-200"
              >
                Clear filters
              </button>

              <button
                type="button"
                onClick={() =>
                  void loadProducts()
                }
                className="text-indigo-300 hover:text-indigo-200"
              >
                Refresh
              </button>
            </div>
          </div>
        </section>

        {error ? (
          <section className="rounded-2xl border border-red-400/30 bg-red-500/10 p-5 text-sm text-red-300">
            {error}
          </section>
        ) : null}

        {loading ? (
          <section className="rounded-2xl border border-[#222a45] bg-[#0b1224] p-12 text-center text-sm text-slate-400">
            Loading staged products...
          </section>
        ) : null}

        {!loading &&
        !error &&
        items.length === 0 ? (
          <section className="rounded-2xl border border-dashed border-[#313a5a] bg-[#0b1224] p-12 text-center">
            <div className="text-lg font-semibold text-white">
              No staged products match these filters
            </div>
            <div className="mt-2 text-sm text-slate-500">
              Adjust the filters or import additional governed Data Factory records.
            </div>
          </section>
        ) : null}

        {!loading &&
        !error &&
        items.length > 0 ? (
          <section className="space-y-3">
            <div className="hidden grid-cols-[minmax(220px,2fr)_minmax(120px,1fr)_minmax(140px,1fr)_minmax(140px,1fr)_auto] gap-4 px-4 text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-600 lg:grid">
              <span>
                Product Identity
              </span>
              <span>
                Manufacturer
              </span>
              <span>
                Family / Classification
              </span>
              <span>
                System / Lifecycle
              </span>
              <span className="text-right">
                Governance
              </span>
            </div>

            {items.map(
              (product) => (
                <ProductRow
                  key={product.id}
                  product={product}
                />
              ),
            )}
          </section>
        ) : null}

        {!loading && !error && items.length > 0 ? (
          <section className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              disabled={cursorStack.length <= 1}
              onClick={() => {
                setCursorStack(
                  (current) =>
                    current.length > 1
                      ? current.slice(0, -1)
                      : current,
                );
              }}
              className="rounded-xl border border-[#313a5a] bg-[#10182d] px-5 py-2.5 text-sm font-medium text-slate-300 transition hover:border-indigo-400/40 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Previous 50
            </button>

            <span className="px-3 text-xs text-slate-500">
              Page {cursorStack.length}
            </span>

            <button
              type="button"
              disabled={!nextCursor}
              onClick={() => {
                if (!nextCursor) {
                  return;
                }

                setCursorStack(
                  (current) => [
                    ...current,
                    nextCursor,
                  ],
                );
              }}
              className="rounded-xl border border-indigo-400/30 bg-indigo-500/10 px-5 py-2.5 text-sm font-medium text-indigo-300 transition hover:bg-indigo-500/15 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next 50
            </button>
          </section>
        ) : null}
        <footer className="pb-6 text-center text-[11px] text-slate-700">
          VOKA Universal Commercial Library - governed staging - no automatic publication
        </footer>
      </div>
    </main>
  );
}
