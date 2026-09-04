"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

type Identifier = {
  id: string;
  identifierType: string;
  value: string;
  manufacturerId?: string | null;
  source?: string | null;
};

type AttributeValue = {
  id: string;
  valueString?: string | null;
  valueNumber?: number | null;
  valueBoolean?: boolean | null;
  valueJson?: unknown;
  unit?: string | null;
  attributeDefinition?: {
    id: string;
    code: string;
    name: string;
    nameAr?: string | null;
    nameEn?: string | null;
    dataType: string;
    unitOfMeasure?: string | null;
  } | null;
};

type Provenance = {
  id: string;
  externalRef?: string | null;
  confidence?: string | number | null;
  observedAt: string;
  source?: {
    id: string;
    name: string;
    type?: string | null;
    url?: string | null;
    verificationStatus?: string | null;
  } | null;
};

type NamedEntity = {
  id: string;
  name: string;
  code?: string | null;
};

type FamilyEntity = NamedEntity & {
  brand?: {
    id: string;
    name: string;
    manufacturer?: {
      id: string;
      name: string;
    } | null;
  } | null;
};

export type UniversalProduct = {
  id: string;
  type: string;
  name: string;
  nameAr?: string | null;
  nameEn?: string | null;
  searchName?: string | null;
  description?: string | null;
  descriptionAr?: string | null;
  descriptionEn?: string | null;
  categoryId?: string | null;
  manufacturerId?: string | null;
  brandId?: string | null;
  familyId?: string | null;
  modelNumber?: string | null;
  variantName?: string | null;
  parentId?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  category?: NamedEntity | null;
  manufacturer?: NamedEntity | null;
  brand?: NamedEntity | null;
  family?: FamilyEntity | null;
  identifiers?: Identifier[];
  attributeValues?: AttributeValue[];
  provenances?: Provenance[];
};

type ApiResult = {
  items: UniversalProduct[];
  total: number;
  nextCursor?: string | null;
};

type FilterState = {
  search: string;
  type: string;
  manufacturer: string;
  brand: string;
  family: string;
  category: string;
  lifecycle: string;
  identity: string;
  evidence: string;
};

const emptyFilters: FilterState = {
  search: "",
  type: "",
  manufacturer: "",
  brand: "",
  family: "",
  category: "",
  lifecycle: "",
  identity: "",
  evidence: "",
};

const tabs = [
  { label: "Overview", href: "/dashboard/universal-library", enabled: false },
  { label: "Batches", href: "#", enabled: false },
  { label: "Systems", href: "#", enabled: false },
  {
    label: "Products",
    href: "/dashboard/universal-library/products",
    enabled: true,
  },
  { label: "Manufacturers", href: "#", enabled: false },
  { label: "Families", href: "#", enabled: false },
  { label: "Evidence", href: "#", enabled: false },
  { label: "Review", href: "#", enabled: false },
  {
    label: "Population",
    href: "/dashboard/universal-library/population",
    enabled: true,
  },
] as const;

function extractApiResult(payload: unknown): ApiResult {
  if (!payload || typeof payload !== "object") {
    return { items: [], total: 0 };
  }

  const root = payload as Record<string, unknown>;
  const nested =
    root.data && typeof root.data === "object"
      ? (root.data as Record<string, unknown>)
      : root;

  const items = Array.isArray(nested.items)
    ? (nested.items as UniversalProduct[])
    : [];

  const total =
    typeof nested.total === "number"
      ? nested.total
      : items.length;

  const nextCursor =
    typeof nested.nextCursor === "string"
      ? nested.nextCursor
      : null;

  return { items, total, nextCursor };
}

function identifierValue(
  product: UniversalProduct,
  types: string[],
): string | null {
  const wanted = new Set(types.map((type) => type.toUpperCase()));

  return (
    product.identifiers?.find((identifier) =>
      wanted.has(identifier.identifierType.toUpperCase()),
    )?.value ?? null
  );
}

function productIdentity(product: UniversalProduct) {
  return {
    mpn: identifierValue(product, ["MPN"]),
    model:
      product.modelNumber ||
      identifierValue(product, ["MODEL_NO"]),
    gtin: identifierValue(product, [
      "GTIN",
      "GTIN_8",
      "GTIN_12",
      "GTIN_13",
      "GTIN_14",
      "EAN",
      "UPC",
    ]),
  };
}

function confidenceLabel(product: UniversalProduct): string {
  if (!product.provenances?.length) {
    return "NO EVIDENCE";
  }

  const values = product.provenances
    .map((row) => row.confidence)
    .filter((value) => value !== null && value !== undefined);

  if (!values.length) {
    return "EVIDENCE";
  }

  const textual = values
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.toUpperCase());

  if (textual.includes("HIGH")) return "HIGH";
  if (textual.includes("MEDIUM")) return "MEDIUM";
  if (textual.includes("LOW")) return "LOW";

  return "EVIDENCE";
}

function evidenceStyle(label: string): string {
  if (label === "HIGH") {
    return "border-emerald-400/30 bg-emerald-500/10 text-emerald-300";
  }

  if (label === "NO EVIDENCE") {
    return "border-amber-400/30 bg-amber-500/10 text-amber-300";
  }

  return "border-indigo-400/30 bg-indigo-500/10 text-indigo-300";
}

function valueToText(attribute: AttributeValue): string {
  if (attribute.valueString != null) {
    return attribute.valueString;
  }

  if (attribute.valueNumber != null) {
    return `${attribute.valueNumber}${
      attribute.unit ? ` ${attribute.unit}` : ""
    }`;
  }

  if (attribute.valueBoolean != null) {
    return attribute.valueBoolean ? "Yes" : "No";
  }

  if (attribute.valueJson != null) {
    try {
      return JSON.stringify(attribute.valueJson);
    } catch {
      return "Structured value";
    }
  }

  return "—";
}

function MetricCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string | number;
  detail?: string;
}) {
  return (
    <div className="rounded-2xl border border-[#222a45] bg-[#0b1224] p-4">
      <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500">
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold text-white">
        {value}
      </div>
      {detail ? (
        <div className="mt-1 text-xs text-slate-500">
          {detail}
        </div>
      ) : null}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="w-full min-w-0 rounded-xl border border-[#313a5a] bg-[#080e1c] px-3 py-2.5 text-sm text-slate-200 outline-none transition focus:border-indigo-400"
    >
      <option value="">{label}</option>
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}

function ProductRow({
  product,
  selected,
  onToggleComparison,
}: {
  product: UniversalProduct;
  selected: boolean;
  onToggleComparison: () => void;
}) {
  const identity = productIdentity(product);
  const evidence = confidenceLabel(product);
  const attributes = product.attributeValues ?? [];
  const provenances = product.provenances ?? [];

  return (
    <details className="group overflow-hidden rounded-2xl border border-[#222a45] bg-[#0b1224] transition open:border-indigo-400/40">
      <summary className="grid min-w-0 cursor-pointer list-none gap-4 px-4 py-4 lg:grid-cols-[36px_minmax(120px,1fr)_minmax(220px,2fr)_minmax(140px,1.2fr)_minmax(120px,1fr)_auto] lg:items-center">
        <div onClick={(event) => event.stopPropagation()}>
          <input
            aria-label={`Compare ${product.name}`}
            type="checkbox"
            checked={selected}
            onChange={onToggleComparison}
            className="h-4 w-4 rounded border-slate-600 bg-[#080e1c]"
          />
        </div>

        <div>
          <div className="font-semibold text-white">
            {product.manufacturer?.name ||
              product.brand?.name ||
              "Unassigned"}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {product.brand?.name
              ? `Brand · ${product.brand.name}`
              : product.type}
          </div>
        </div>

        <div>
          <div className="text-sm font-medium text-slate-100">
            {product.name}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
            <span>
              Model: {identity.model || "—"}
            </span>
            <span>
              MPN: {identity.mpn || "—"}
            </span>
            <span>
              GTIN: {identity.gtin || "—"}
            </span>
          </div>
        </div>

        <div className="text-xs text-slate-400">
          <div>
            {product.family?.name ||
              product.category?.name ||
              "No family"}
          </div>
          <div className="mt-1 text-slate-600">
            {product.category?.name || "Uncategorized"}
          </div>
        </div>

        <div className="text-xs text-slate-400">
          <div>{attributes.length} specifications</div>
          <div className="mt-1">
            {provenances.length} evidence records
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          <span
            className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${evidenceStyle(
              evidence,
            )}`}
          >
            {evidence}
          </span>
          <span
            className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${
              product.isActive
                ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-300"
                : "border-slate-600 bg-slate-800/60 text-slate-400"
            }`}
          >
            {product.isActive ? "ACTIVE" : "INACTIVE"}
          </span>
        </div>
      </summary>

      <div className="border-t border-[#222a45] bg-[#080e1c]/70 p-5">
        <div className="grid gap-5 xl:grid-cols-[1.15fr_1fr]">
          <div>
            <div className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-indigo-300">
              Product intelligence
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {[
                ["Type", product.type],
                ["Manufacturer", product.manufacturer?.name || "—"],
                ["Brand", product.brand?.name || "—"],
                ["Family", product.family?.name || "—"],
                ["Category", product.category?.name || "—"],
                ["Variant", product.variantName || "—"],
                ["Model", identity.model || "—"],
                ["MPN", identity.mpn || "—"],
                ["GTIN / EAN / UPC", identity.gtin || "—"],
                ["Universal ID", product.id],
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

            {product.description ||
            product.descriptionEn ||
            product.descriptionAr ? (
              <div className="mt-4 rounded-xl border border-[#1b2340] bg-[#0b1224] p-4 text-sm leading-6 text-slate-400">
                {product.description ||
                  product.descriptionEn ||
                  product.descriptionAr}
              </div>
            ) : null}
          </div>

          <div className="space-y-5">
            <section>
              <div className="mb-3 flex items-center justify-between">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-300">
                  Specifications
                </div>
                <span className="text-xs text-slate-500">
                  {attributes.length} total
                </span>
              </div>

              {attributes.length ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {attributes.slice(0, 12).map((attribute) => (
                    <div
                      key={attribute.id}
                      className="rounded-xl border border-[#1b2340] bg-[#0b1224] p-3"
                    >
                      <div className="text-[10px] text-slate-600">
                        {attribute.attributeDefinition?.name ||
                          attribute.attributeDefinition?.code ||
                          "Attribute"}
                      </div>
                      <div className="mt-1 text-sm text-slate-200">
                        {valueToText(attribute)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-[#313a5a] p-4 text-sm text-slate-500">
                  No structured specifications are attached to this
                  published item yet.
                </div>
              )}
            </section>

            <section>
              <div className="mb-3 flex items-center justify-between">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-300">
                  Evidence & provenance
                </div>
                <span className="text-xs text-slate-500">
                  {provenances.length} records
                </span>
              </div>

              {provenances.length ? (
                <div className="space-y-2">
                  {provenances.slice(0, 8).map((provenance) => (
                    <div
                      key={provenance.id}
                      className="rounded-xl border border-[#1b2340] bg-[#0b1224] p-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm font-medium text-slate-200">
                          {provenance.source?.name || "Source"}
                        </span>
                        <span className="text-[10px] uppercase tracking-wide text-slate-500">
                          {provenance.source?.verificationStatus ||
                            provenance.confidence ||
                            "Recorded"}
                        </span>
                      </div>

                      <div className="mt-1 break-all text-xs text-slate-500">
                        {provenance.externalRef ||
                          provenance.source?.url ||
                          "No external reference"}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-amber-400/20 bg-amber-500/5 p-4 text-sm text-amber-200/70">
                  This item currently has no published provenance
                  records.
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </details>
  );
}

export default function UniversalLibraryProductsBrowser() {
  const [products, setProducts] = useState<UniversalProduct[]>([]);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] =
    useState<FilterState>(emptyFilters);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        "/api/universal-library/items?limit=50&isActive=true",
        {
          cache: "no-store",
        },
      );

      if (!response.ok) {
        throw new Error(
          `Universal Library request failed (${response.status}).`,
        );
      }

      const payload = extractApiResult(await response.json());

      setProducts(payload.items);
      setTotal(payload.total);
    } catch (caught) {
      setProducts([]);
      setTotal(0);
      setError(
        caught instanceof Error
          ? caught.message
          : "Failed to load Universal Library products.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  const options = useMemo(() => {
    const unique = (values: Array<string | null | undefined>) =>
      Array.from(
        new Set(
          values.filter(
            (value): value is string =>
              typeof value === "string" && value.trim().length > 0,
          ),
        ),
      ).sort((left, right) => left.localeCompare(right));

    return {
      types: unique(products.map((product) => product.type)),
      manufacturers: unique(
        products.map((product) => product.manufacturer?.name),
      ),
      brands: unique(
        products.map((product) => product.brand?.name),
      ),
      families: unique(
        products.map((product) => product.family?.name),
      ),
      categories: unique(
        products.map((product) => product.category?.name),
      ),
    };
  }, [products]);

  const filtered = useMemo(() => {
    const query = filters.search.trim().toLowerCase();

    return products.filter((product) => {
      const identity = productIdentity(product);
      const haystack = [
        product.name,
        product.nameEn,
        product.nameAr,
        product.searchName,
        product.manufacturer?.name,
        product.brand?.name,
        product.family?.name,
        product.category?.name,
        identity.model,
        identity.mpn,
        identity.gtin,
        ...(product.identifiers ?? []).map(
          (identifier) => identifier.value,
        ),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      if (query && !haystack.includes(query)) {
        return false;
      }

      if (
        filters.type &&
        product.type !== filters.type
      ) {
        return false;
      }

      if (
        filters.manufacturer &&
        product.manufacturer?.name !== filters.manufacturer
      ) {
        return false;
      }

      if (
        filters.brand &&
        product.brand?.name !== filters.brand
      ) {
        return false;
      }

      if (
        filters.family &&
        product.family?.name !== filters.family
      ) {
        return false;
      }

      if (
        filters.category &&
        product.category?.name !== filters.category
      ) {
        return false;
      }

      if (
        filters.lifecycle === "active" &&
        !product.isActive
      ) {
        return false;
      }

      if (
        filters.lifecycle === "inactive" &&
        product.isActive
      ) {
        return false;
      }

      if (
        filters.identity === "gtin" &&
        !identity.gtin
      ) {
        return false;
      }

      if (
        filters.identity === "mpn" &&
        !identity.mpn
      ) {
        return false;
      }

      if (
        filters.identity === "model" &&
        !identity.model
      ) {
        return false;
      }

      if (
        filters.evidence === "with" &&
        !(product.provenances?.length)
      ) {
        return false;
      }

      if (
        filters.evidence === "without" &&
        product.provenances?.length
      ) {
        return false;
      }

      return true;
    });
  }, [products, filters]);

  const loadedWithEvidence = products.filter(
    (product) => product.provenances?.length,
  ).length;

  const loadedWithSpecs = products.filter(
    (product) => product.attributeValues?.length,
  ).length;

  const loadedManufacturers = new Set(
    products
      .map((product) => product.manufacturer?.id)
      .filter(Boolean),
  ).size;

  const loadedFamilies = new Set(
    products
      .map((product) => product.family?.id)
      .filter(Boolean),
  ).size;

  const toggleComparison = (id: string) => {
    setSelected((current) => {
      if (current.includes(id)) {
        return current.filter((value) => value !== id);
      }

      if (current.length >= 4) {
        return current;
      }

      return [...current, id];
    });
  };

  const selectedProducts = selected
    .map((id) => products.find((product) => product.id === id))
    .filter(
      (product): product is UniversalProduct =>
        product !== undefined,
    );

  return (
    <main
      dir="ltr"
      className="min-h-screen bg-[#060b1a] px-4 py-7 text-slate-200 sm:px-7"
    >
      <div className="w-full min-w-0 space-y-6">
        <header className="rounded-2xl border border-[#222a45] bg-[#0b1224] p-6">
          <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-start">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-indigo-400/30 bg-indigo-500/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-indigo-300">
                  Universal Commercial Library
                </span>
                <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300">
                  Published Library Browser
                </span>
              </div>

              <h1 className="mt-4 text-3xl font-bold tracking-tight text-white">
                Global Product Intelligence
              </h1>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
                Search and inspect published Universal Library items,
                commercial identity, structured specifications and
                provenance. Population staging remains governed and
                separate from publication.
              </p>
            </div>

            <div className="rounded-xl border border-[#313a5a] bg-[#080e1c] px-4 py-3 text-xs text-slate-400">
              <div className="font-semibold text-slate-200">
                Huge Library · Small Working Set
              </div>
              <div className="mt-1">
                Browser loads a bounded server-side result set.
              </div>
            </div>
          </div>

          <nav className="mt-6 flex flex-wrap gap-2 border-t border-[#222a45] pt-5">
            {tabs.map((tab) =>
              tab.enabled ? (
                <Link
                  key={tab.label}
                  href={tab.href}
                  className={`rounded-xl px-3.5 py-2 text-xs font-medium transition ${
                    tab.label === "Products"
                      ? "bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-950/20"
                      : "border border-[#313a5a] bg-[#10182d] text-slate-300 hover:border-indigo-400/40"
                  }`}
                >
                  {tab.label}
                </Link>
              ) : (
                <span
                  key={tab.label}
                  title="Backend/UI slice not connected yet"
                  className="cursor-default rounded-xl border border-[#222a45] bg-[#0a1020] px-3.5 py-2 text-xs text-slate-600"
                >
                  {tab.label}
                </span>
              ),
            )}
          </nav>
        </header>

        <section className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
          <MetricCard
            label="Published Items"
            value={total.toLocaleString()}
            detail="Server-reported total"
          />
          <MetricCard
            label="Loaded Working Set"
            value={products.length}
            detail="Bounded to 50"
          />
          <MetricCard
            label="Manufacturers"
            value={loadedManufacturers}
            detail="In current working set"
          />
          <MetricCard
            label="Families"
            value={loadedFamilies}
            detail="In current working set"
          />
          <MetricCard
            label="With Evidence"
            value={loadedWithEvidence}
            detail="Published provenance"
          />
          <MetricCard
            label="With Specs"
            value={loadedWithSpecs}
            detail="Structured attributes"
          />
        </section>

        <section className="rounded-2xl border border-[#222a45] bg-[#0b1224] p-4">
          <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <input
              aria-label="Search products"
              value={filters.search}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  search: event.target.value,
                }))
              }
              placeholder="Search product, model, MPN, GTIN, manufacturer..."
              className="min-w-0 rounded-xl border border-[#313a5a] bg-[#080e1c] px-4 py-2.5 text-sm text-slate-200 outline-none placeholder:text-slate-600 focus:border-indigo-400 sm:col-span-2 lg:col-span-2"
            />

            <FilterSelect
              label="All types"
              value={filters.type}
              options={options.types}
              onChange={(value) =>
                setFilters((current) => ({
                  ...current,
                  type: value,
                }))
              }
            />

            <FilterSelect
              label="All manufacturers"
              value={filters.manufacturer}
              options={options.manufacturers}
              onChange={(value) =>
                setFilters((current) => ({
                  ...current,
                  manufacturer: value,
                }))
              }
            />

            <FilterSelect
              label="All brands"
              value={filters.brand}
              options={options.brands}
              onChange={(value) =>
                setFilters((current) => ({
                  ...current,
                  brand: value,
                }))
              }
            />

            <FilterSelect
              label="All families"
              value={filters.family}
              options={options.families}
              onChange={(value) =>
                setFilters((current) => ({
                  ...current,
                  family: value,
                }))
              }
            />

            <FilterSelect
              label="All categories"
              value={filters.category}
              options={options.categories}
              onChange={(value) =>
                setFilters((current) => ({
                  ...current,
                  category: value,
                }))
              }
            />

            <FilterSelect
              label="Lifecycle"
              value={filters.lifecycle}
              options={["active", "inactive"]}
              onChange={(value) =>
                setFilters((current) => ({
                  ...current,
                  lifecycle: value,
                }))
              }
            />

            <FilterSelect
              label="Identity"
              value={filters.identity}
              options={["gtin", "mpn", "model"]}
              onChange={(value) =>
                setFilters((current) => ({
                  ...current,
                  identity: value,
                }))
              }
            />

            <FilterSelect
              label="Evidence"
              value={filters.evidence}
              options={["with", "without"]}
              onChange={(value) =>
                setFilters((current) => ({
                  ...current,
                  evidence: value,
                }))
              }
            />
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[#1b2340] pt-4 text-xs text-slate-500">
            <span>
              Showing{" "}
              <strong className="text-slate-200">
                {filtered.length}
              </strong>{" "}
              of {products.length} loaded records
            </span>

            <div className="flex gap-4">
              <button
                type="button"
                onClick={() => setFilters(emptyFilters)}
                className="text-indigo-300 hover:text-indigo-200"
              >
                Clear filters
              </button>

              <button
                type="button"
                onClick={() => void loadProducts()}
                className="text-indigo-300 hover:text-indigo-200"
              >
                Refresh library
              </button>
            </div>
          </div>
        </section>

        {error ? (
          <section className="rounded-2xl border border-red-400/30 bg-red-500/10 p-5">
            <div className="font-semibold text-red-300">
              Unable to load Universal Library
            </div>
            <div className="mt-1 text-sm text-red-200/70">
              {error}
            </div>
          </section>
        ) : null}

        {loading ? (
          <section className="rounded-2xl border border-[#222a45] bg-[#0b1224] p-12 text-center">
            <div className="text-sm font-medium text-slate-300">
              Loading published Universal Library...
            </div>
          </section>
        ) : null}

        {!loading && !error && products.length === 0 ? (
          <section className="rounded-2xl border border-[#222a45] bg-[#0b1224] p-12 text-center">
            <div className="text-lg font-semibold text-white">
              No published products yet
            </div>

            <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-500">
              The Products Browser is connected to the real Universal
              Library API. Bulk JSONL records currently live in governed
              staging and will not appear here until they pass the
              processing, review and publication boundary.
            </p>

            <Link
              href="/dashboard/universal-library/population"
              className="mt-5 inline-flex rounded-xl border border-indigo-400/30 bg-indigo-500/10 px-4 py-2 text-sm font-medium text-indigo-300"
            >
              Open Population Console
            </Link>
          </section>
        ) : null}

        {!loading && filtered.length > 0 ? (
          <section className="space-y-3">
            <div className="hidden min-w-0 grid-cols-[36px_minmax(120px,1fr)_minmax(220px,2fr)_minmax(140px,1.2fr)_minmax(120px,1fr)_auto] gap-4 px-4 text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-600 lg:grid">
              <span />
              <span>Manufacturer</span>
              <span>Product Identity</span>
              <span>Family / Category</span>
              <span>Intelligence</span>
              <span className="text-right">Governance</span>
            </div>

            {filtered.map((product) => (
              <ProductRow
                key={product.id}
                product={product}
                selected={selected.includes(product.id)}
                onToggleComparison={() =>
                  toggleComparison(product.id)
                }
              />
            ))}
          </section>
        ) : null}

        {!loading &&
        products.length > 0 &&
        filtered.length === 0 ? (
          <section className="rounded-2xl border border-dashed border-[#313a5a] bg-[#0b1224] p-10 text-center text-sm text-slate-500">
            No products match the current filters.
          </section>
        ) : null}

        {selectedProducts.length > 0 ? (
          <section className="sticky bottom-4 z-20 rounded-2xl border border-indigo-400/30 bg-[#0a1020]/95 p-4 shadow-2xl shadow-black/40 backdrop-blur">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <div className="text-sm font-semibold text-white">
                  Comparison workspace
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {selectedProducts.length}/4 products selected
                </div>
              </div>

              <div className="flex flex-1 flex-wrap gap-2 xl:justify-center">
                {selectedProducts.map((product) => (
                  <div
                    key={product.id}
                    className="rounded-xl border border-[#313a5a] bg-[#10182d] px-3 py-2 text-xs"
                  >
                    <span className="font-medium text-slate-200">
                      {product.manufacturer?.name || "—"}
                    </span>
                    <span className="mx-2 text-slate-600">·</span>
                    <span className="text-slate-400">
                      {product.modelNumber || product.name}
                    </span>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setSelected([])}
                className="rounded-xl border border-[#313a5a] px-3 py-2 text-xs text-slate-400 hover:text-white"
              >
                Clear comparison
              </button>
            </div>
          </section>
        ) : null}

        <footer className="pb-6 text-center text-[11px] text-slate-700">
          VOKA Universal Commercial Library · published global
          knowledge only · tenant-private commercial data excluded
        </footer>
      </div>
    </main>
  );
}