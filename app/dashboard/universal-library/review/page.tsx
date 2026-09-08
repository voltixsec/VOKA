"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import type {
  StagedProductSummary,
} from "@/features/universal-library/application/staging-products/GetStagedProducts";

function extractItems(payload: unknown): {
  items: StagedProductSummary[];
  total: number;
} {
  const root =
    payload &&
    typeof payload === "object"
      ? payload as Record<string, unknown>
      : {};

  const data =
    root.data &&
    typeof root.data === "object"
      ? root.data as Record<string, unknown>
      : root;

  return {
    items: Array.isArray(data.items)
      ? data.items as StagedProductSummary[]
      : [],
    total:
      typeof data.total === "number"
        ? data.total
        : 0,
  };
}

function safeHttpUrl(
  value: string | null,
): string | null {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);

    return url.protocol === "http:" ||
      url.protocol === "https:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

export default function UniversalLibraryReviewPage() {
  const [items, setItems] =
    useState<StagedProductSummary[]>([]);

  const [total, setTotal] =
    useState(0);

  const [queueTotal, setQueueTotal] =
    useState(0);

  const [searchDraft, setSearchDraft] =
    useState("");

  const [appliedSearch, setAppliedSearch] =
    useState("");

  const [loading, setLoading] =
    useState(true);

  const [busyId, setBusyId] =
    useState<string | null>(null);

  const [error, setError] =
    useState<string | null>(null);

  const requestSequence = useRef(0);

  const load = useCallback(
    async () => {
      const sequence =
        ++requestSequence.current;
      const query =
        appliedSearch.trim();

      setLoading(true);
      setError(null);

      try {
        const baseUrl =
          "/api/universal-library/staging/products?status=NEEDS_REVIEW&limit=50";
        const url = query
          ? `${baseUrl}&search=${encodeURIComponent(query)}`
          : baseUrl;

        const response =
          await fetch(
            url,
            {
              cache: "no-store",
            },
          );

        if (!response.ok) {
          throw new Error(
            `Review queue request failed (${response.status}).`,
          );
        }

        const result =
          extractItems(
            await response.json(),
          );

        if (
          sequence !==
          requestSequence.current
        ) {
          return;
        }

        setItems(result.items);
        setTotal(result.total);

        if (!query) {
          setQueueTotal(result.total);
        }
      } catch (caught) {
        if (
          sequence !==
          requestSequence.current
        ) {
          return;
        }

        setItems([]);
        setTotal(0);
        setError(
          caught instanceof Error
            ? caught.message
            : "Failed to load review queue.",
        );
      } finally {
        if (
          sequence ===
          requestSequence.current
        ) {
          setLoading(false);
        }
      }
    },
    [appliedSearch],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const submitSearch = useCallback(() => {
    const next = searchDraft.trim();

    if (next === appliedSearch) {
      void load();
      return;
    }

    setAppliedSearch(next);
  }, [appliedSearch, load, searchDraft]);

  const clearSearch = useCallback(() => {
    setSearchDraft("");

    if (appliedSearch) {
      setAppliedSearch("");
    } else {
      void load();
    }
  }, [appliedSearch, load]);

  async function decide(
    item: StagedProductSummary,
    decision: "APPROVE" | "REJECT",
  ) {
    if (
      decision === "REJECT" &&
      !window.confirm(
        `Reject "${item.name || item.externalKey}"?`,
      )
    ) {
      return;
    }

    setBusyId(item.id);
    setError(null);

    try {
      const response =
        await fetch(
          "/api/universal-library/review",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              ingestionRecordId:
                item.id,
              decision,
            }),
          },
        );

      const body =
        await response.json();

      if (!response.ok) {
        throw new Error(
          body?.error?.message ||
            `Review decision failed (${response.status}).`,
        );
      }

      await load();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Review decision failed.",
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main
      dir="ltr"
      className="min-h-screen bg-[#060b1a] px-4 py-7 text-slate-200 sm:px-7"
    >
      <div className="space-y-6">
        <header className="rounded-2xl border border-[#222a45] bg-[#0b1224] p-6">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">
            Governed Review Queue
          </div>

          <h1 className="mt-3 text-3xl font-bold text-white">
            Review â†’ Approve / Reject â†’ Publish
          </h1>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            Records remain outside the canonical Universal Library until an explicit platform review decision is made.
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <div className="inline-flex rounded-xl border border-amber-400/20 bg-amber-500/10 px-4 py-2 text-sm text-amber-200">
              {queueTotal.toLocaleString()} records awaiting review
            </div>

            {appliedSearch ? (
              <div className="inline-flex rounded-xl border border-indigo-400/30 bg-indigo-500/10 px-4 py-2 text-sm text-indigo-200">
                {loading
                  ? "Searching..."
                  : `${total.toLocaleString()} matching record${
                      total === 1 ? "" : "s"
                    }`}
              </div>
            ) : null}
          </div>
        </header>

        <section className="rounded-2xl border border-[#222a45] bg-[#0b1224] p-4">
          <form
            role="search"
            onSubmit={(event) => {
              event.preventDefault();
              submitSearch();
            }}
            className="flex flex-col gap-2 sm:flex-row"
          >
            <input
              aria-label="Search review queue"
              type="search"
              value={searchDraft}
              onChange={(event) =>
                setSearchDraft(event.target.value)
              }
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  submitSearch();
                }
              }}
              placeholder="Search external key, name, model, manufacturer, brand, family..."
              className="min-w-0 flex-1 rounded-xl border border-[#313a5a] bg-[#080e1c] px-4 py-2.5 text-sm text-slate-200 outline-none placeholder:text-slate-600 focus:border-amber-400"
            />

            <div className="flex shrink-0 gap-2">
              <button
                type="submit"
                disabled={loading}
                className="rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
              >
                Search
              </button>

              <button
                type="button"
                disabled={loading}
                onClick={clearSearch}
                className="rounded-xl border border-[#313a5a] px-4 py-2.5 text-sm font-medium text-slate-300 hover:text-white disabled:opacity-40"
              >
                Clear search
              </button>
            </div>
          </form>

          {appliedSearch && !loading && !error ? (
            <div
              role="status"
              className="mt-3 text-sm text-slate-400"
            >
              {total > 0 ? (
                <>
                  <strong className="text-slate-200">
                    {total.toLocaleString()}
                  </strong>{" "}
                  matching{" "}
                  {total === 1 ? "record" : "records"} for{" "}
                  <span className="text-amber-200">
                    &ldquo;{appliedSearch}&rdquo;
                  </span>{" "}
                  <span className="text-slate-600">
                    (NEEDS_REVIEW only)
                  </span>
                </>
              ) : (
                <span className="text-slate-300">
                  No staged records match &ldquo;{appliedSearch}&rdquo;
                  in the NEEDS_REVIEW queue.
                </span>
              )}
            </div>
          ) : null}
        </section>

        {error ? (
          <div className="rounded-xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-300">
            {error}

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void load()}
                className="rounded-lg border border-red-400/30 px-3 py-1.5 text-xs font-medium text-red-200 hover:bg-red-500/10"
              >
                Retry
              </button>

              {appliedSearch ? (
                <button
                  type="button"
                  onClick={clearSearch}
                  className="rounded-lg border border-[#313a5a] px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white"
                >
                  Clear search
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        {loading ? (
          <div className="rounded-2xl border border-[#222a45] bg-[#0b1224] p-8 text-sm text-slate-400">
            {appliedSearch
              ? `Searching NEEDS_REVIEW records for "${appliedSearch}"...`
              : "Loading governed review queue..."}
          </div>
        ) : null}

        {!loading &&
        !error &&
        appliedSearch &&
        items.length === 0 ? (
          <div className="rounded-2xl border border-[#222a45] bg-[#0b1224] p-8 text-center">
            <div className="text-lg font-semibold text-white">
              No staged records match this search.
            </div>

            <div className="mt-2 text-sm text-slate-500">
              No NEEDS_REVIEW record matches &ldquo;{appliedSearch}&rdquo;.
              Clear the search to return to the full governed review queue.
            </div>

            <button
              type="button"
              onClick={clearSearch}
              className="mt-4 inline-flex rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-2 text-sm font-medium text-amber-200"
            >
              Clear search
            </button>
          </div>
        ) : null}

        {!loading &&
        !error &&
        !appliedSearch &&
        items.length === 0 ? (
          <div className="rounded-2xl border border-[#222a45] bg-[#0b1224] p-8 text-center">
            <div className="text-lg font-semibold text-white">
              Review queue is clear
            </div>

            <div className="mt-2 text-sm text-slate-500">
              No staged records currently require a platform decision.
            </div>
          </div>
        ) : null}

        <section className="space-y-3">
          {items.map((item) => {
            const busy =
            busyId === item.id;

          const canonicalUrl =
            safeHttpUrl(
              item.canonicalSourceUrl ||
                item.sourceUrl,
            );

          const licenseUrl =
            safeHttpUrl(
              item.sourceLicenseReferenceUrl,
            );

            return (
              <article
                key={item.id}
                className="rounded-2xl border border-[#222a45] bg-[#0b1224] p-5"
              >
                <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white">
                      {item.name ||
                        item.externalKey}
                    </div>

                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                      <span>
                        {item.entityType.replace(
                          /_/g,
                          " ",
                        )}
                      </span>

                      <span>
                        Model:{" "}
                        {item.modelNumber ||
                          "-"}
                      </span>

                      <span>
                        Manufacturer:{" "}
                        {item.manufacturer ||
                          "-"}
                      </span>

                      <span>
                        Brand:{" "}
                        {item.brand ||
                          "-"}
                      </span>
                    </div>

                    <div className="mt-2 font-mono text-[11px] text-slate-600">
                    {item.id}
                  </div>

                  <div className="mt-4 rounded-xl border border-sky-400/15 bg-sky-500/5 p-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-300">
                      Evidence before publication
                    </div>

                    <div className="mt-3 grid gap-2 text-xs text-slate-400 sm:grid-cols-2 xl:grid-cols-3">
                      <div>
                        Source:{" "}
                        <span className="text-slate-200">
                          {item.sourceName}
                        </span>
                      </div>

                      <div>
                        Verification:{" "}
                        <span className="text-slate-200">
                          {item.sourceVerificationStatus.replace(
                            /_/g,
                            " ",
                          )}
                        </span>
                      </div>

                      <div>
                        Trust score:{" "}
                        <span className="text-slate-200">
                          {item.sourceTrustScore !== null
                            ? item.sourceTrustScore.toFixed(2)
                            : "-"}
                        </span>
                      </div>

                      <div>
                        Source type:{" "}
                        <span className="text-slate-200">
                          {item.sourceType.replace(
                            /_/g,
                            " ",
                          )}
                        </span>
                      </div>

                      <div>
                        External key:{" "}
                        <span className="font-mono text-slate-200">
                          {item.externalKey}
                        </span>
                      </div>

                      <div>
                        Publication target:{" "}
                        <span className="text-slate-200">
                          {item.matchedItemId
                            ? "Existing canonical item " +
                              item.matchedItemId
                            : "New canonical item"}
                        </span>
                      </div>

                      <div>
                        Fetched:{" "}
                        <span className="text-slate-200">
                          {item.fetchedAt
                            ? new Date(
                                item.fetchedAt,
                              ).toLocaleString()
                            : "-"}
                        </span>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-3 text-xs">
                      {canonicalUrl ? (
                        <a
                          href={canonicalUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="font-semibold text-sky-300 underline underline-offset-4"
                        >
                          Open canonical source
                        </a>
                      ) : (
                        <span className="text-slate-500">
                          Canonical source URL not provided
                        </span>
                      )}

                      {licenseUrl ? (
                        <a
                          href={licenseUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="font-semibold text-sky-300 underline underline-offset-4"
                        >
                          Source / license reference
                        </a>
                      ) : null}
                    </div>

                    {item.attributionText ? (
                      <div className="mt-3 text-xs leading-5 text-slate-400">
                        Attribution:{" "}
                        <span className="text-slate-200">
                          {item.attributionText}
                        </span>
                      </div>
                    ) : null}

                    <details
                      open
                      className="mt-4 rounded-lg border border-[#222a45] bg-[#080e1d] p-3"
                    >
                      <summary className="cursor-pointer text-xs font-semibold text-emerald-300">
                        Normalized candidate
                      </summary>

                      <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-5 text-slate-400">
                        {item.normalizedData
                          ? JSON.stringify(
                              item.normalizedData,
                              null,
                              2,
                            )
                          : "No normalized candidate payload."}
                      </pre>
                    </details>

                    <details className="mt-3 rounded-lg border border-[#222a45] bg-[#080e1d] p-3">
                      <summary className="cursor-pointer text-xs font-semibold text-amber-300">
                        Raw source payload
                      </summary>

                      <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-5 text-slate-400">
                        {JSON.stringify(
                          item.rawPayload,
                          null,
                          2,
                        )}
                      </pre>
                    </details>
                  </div>
                  </div>

                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void decide(
                          item,
                          "REJECT",
                        )
                      }
                      className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-300 disabled:opacity-40"
                    >
                      Reject
                    </button>

                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void decide(
                          item,
                          "APPROVE",
                        )
                      }
                      className="rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
                    >
                      {busy
                        ? "Working..."
                        : "Approve & Publish"}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      </div>
    </main>
  );
}
