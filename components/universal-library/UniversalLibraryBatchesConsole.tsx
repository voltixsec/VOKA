"use client";

import Link from "next/link";
import UniversalLibraryBulkImportExecutionControl from "./UniversalLibraryBulkImportExecutionControl";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type BatchStatus =
  | "COMPLETED"
  | "IN_PROGRESS"
  | "NEEDS_ATTENTION";

type BatchItem = {
  sourceId: string;
  batchExternalKey: string;
  sourceNamespace?: string | null;
  fileName?: string | null;

  status: BatchStatus;

  expectedChunks: number;
  completedChunks: number;
  partialChunks: number;
  failedChunks: number;
  activeChunks: number;

  fetchedCount: number;
  stagedCount: number;
  stagedContributionCount?: number;
  duplicateCount: number;
  changedCount: number;
  reviewRequiredCount: number;
  rejectedCount: number;
  publishedCount: number;

  firstStartedAt: string;
  lastActivityAt: string;
};

type BatchHistoryResult = {
  items: BatchItem[];
  total: number;
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
): BatchHistoryResult {
  if (
    !payload ||
    typeof payload !== "object"
  ) {
    return {
      items: [],
      total: 0,
    };
  }

  const root =
    payload as Record<
      string,
      unknown
    >;

  const nested =
    root.data &&
    typeof root.data === "object"
      ? (
          root.data as Record<
            string,
            unknown
          >
        )
      : root;

  const items =
    Array.isArray(
      nested.items,
    )
      ? (
          nested.items as BatchItem[]
        )
      : [];

  const total =
    typeof nested.total ===
    "number"
      ? nested.total
      : items.length;

  return {
    items,
    total,
  };
}

function formatNumber(
  value: number,
): string {
  return value.toLocaleString();
}

function formatDate(
  value?: string | null,
): string {
  if (!value) {
    return "—";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return "—";
  }

  return date.toLocaleString();
}

function statusClass(
  status: BatchStatus,
): string {
  if (
    status === "COMPLETED"
  ) {
    return "border-emerald-400/30 bg-emerald-500/10 text-emerald-300";
  }

  if (
    status === "IN_PROGRESS"
  ) {
    return "border-indigo-400/30 bg-indigo-500/10 text-indigo-300";
  }

  return "border-amber-400/30 bg-amber-500/10 text-amber-300";
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
      <div className="flex min-h-[34px] items-start text-[11px] font-medium uppercase leading-4 tracking-[0.16em] text-slate-500">
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

export default function UniversalLibraryBatchesConsole() {
  const fileInputRef =
    useRef<HTMLInputElement>(
      null,
    );

  const [
    batches,
    setBatches,
  ] = useState<
    BatchItem[]
  >([]);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    error,
    setError,
  ] = useState<
    string | null
  >(null);

  const [
    selectedFile,
    setSelectedFile,
  ] = useState<
    File | null
  >(null);

  const [
    batchExternalKey,
    setBatchExternalKey,
  ] = useState("");

  const [
    sourceNamespace,
    setSourceNamespace,
  ] = useState(
    "VOKA_UCL_DATA_FACTORY",
  );

  const [
    uploadPanelOpen,
    setUploadPanelOpen,
  ] = useState(false);

  const loadBatches =
    useCallback(async () => {
      setLoading(true);
      setError(null);

      try {
        const response =
          await fetch(
            "/api/universal-library/bulk-import/ui/batches?limit=100",
            {
              cache:
                "no-store",
            },
          );

        const json =
          await response.json();

        if (!response.ok) {
          throw new Error(
            json?.error?.message ||
              "Failed to load bulk import batches.",
          );
        }

        const result =
          extractResult(
            json,
          );

        setBatches(
          result.items,
        );
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : "Failed to load bulk import batches.",
        );
      } finally {
        setLoading(false);
      }
    }, []);

  useEffect(() => {
    void loadBatches();
  }, [loadBatches]);

  const metrics =
    useMemo(() => {
      const completed =
        batches.filter(
          (batch) =>
            batch.status ===
            "COMPLETED",
        ).length;

      const active =
        batches.filter(
          (batch) =>
            batch.status ===
            "IN_PROGRESS",
        ).length;

      const attention =
        batches.filter(
          (batch) =>
            batch.status ===
            "NEEDS_ATTENTION",
        ).length;

      const staged =
        batches.reduce(
          (sum, batch) =>
            sum +
            (
              batch.stagedContributionCount ??
              batch.stagedCount
            ),
          0,
        );

      const duplicates =
        batches.reduce(
          (sum, batch) =>
            sum +
            batch.duplicateCount,
          0,
        );

      const review =
        batches.reduce(
          (sum, batch) =>
            sum +
            batch.reviewRequiredCount,
          0,
        );

      return {
        completed,
        active,
        attention,
        staged,
        duplicates,
        review,
      };
    }, [batches]);

  const handleFile =
    (
      event: React.ChangeEvent<HTMLInputElement>,
    ) => {
      const file =
        event.target.files?.[0] ??
        null;

      setSelectedFile(file);

      if (!file) {
        setBatchExternalKey("");
        return;
      }

      const base =
        file.name.replace(
          /\.[^.]+$/,
          "",
        );

      const derivedBatchKey =
        base
          .replace(
            /[^a-zA-Z0-9_-]+/g,
            "_",
          )
          .replace(
            /^_+|_+$/g,
            "",
          )
          .slice(0, 180);

      setBatchExternalKey(
        derivedBatchKey,
      );
    };

  return (
    <main className="min-h-screen bg-[#060b1a]">
      <div className="mx-auto max-w-[1600px] space-y-6 px-4 py-6 sm:px-6 lg:px-8">

        <section className="overflow-hidden rounded-2xl border border-[#222a45] bg-[#0b1224] shadow-sm">
          <div className="border-b border-[#222a45] px-6 py-6">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
              <div className="max-w-4xl">
                <div className="mb-2 inline-flex rounded-full border border-indigo-400/30 bg-indigo-500/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-indigo-300">
                  Universal Commercial Library
                </div>

                <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
                  Import Operations & Batch Control
                </h1>

                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
                  Run large governed library imports as one logical batch.
                  VOKA processes the file internally in bounded resumable
                  chunks while preserving staging, retry history, and
                  zero-direct-publication governance.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    void loadBatches()
                  }
                  className="h-10 rounded-lg border border-[#313a5a] bg-[#10182d] px-4 text-sm font-semibold text-slate-200 transition hover:border-indigo-400/50"
                >
                  Refresh
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setUploadPanelOpen(
                      true,
                    )
                  }
                  className="h-10 rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 px-5 text-sm font-semibold text-white shadow-sm transition hover:from-indigo-500 hover:to-violet-500"
                >
                  Upload Bulk File
                </button>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto border-b border-[#222a45] px-6">
            <div className="flex min-w-max gap-1">
              {tabs.map(
                (tab) =>
                  tab.enabled ? (
                    <Link
                      key={
                        tab.label
                      }
                      href={
                        tab.href
                      }
                      className={`border-b-2 px-3 py-3 text-xs font-semibold transition ${
                        tab.label ===
                        "Batches"
                          ? "border-indigo-400 text-indigo-300"
                          : "border-transparent text-slate-500 hover:text-slate-200"
                      }`}
                    >
                      {tab.label}
                    </Link>
                  ) : (
                    <span
                      key={
                        tab.label
                      }
                      className="cursor-not-allowed border-b-2 border-transparent px-3 py-3 text-xs font-semibold text-slate-700"
                    >
                      {tab.label}
                    </span>
                  ),
              )}
            </div>
          </div>

          <div className="grid gap-3 px-6 py-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-[#222a45] bg-[#10182d] px-4 py-3">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Import Mode
              </div>
              <div className="mt-1 text-sm font-semibold text-slate-200">
                Resumable Bulk Staging
              </div>
            </div>

            <div className="rounded-xl border border-[#222a45] bg-[#10182d] px-4 py-3">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Internal Chunk
              </div>
              <div className="mt-1 text-sm font-semibold text-slate-200">
                Up to 1,000 records
              </div>
            </div>

            <div className="rounded-xl border border-[#222a45] bg-[#10182d] px-4 py-3">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Logical Batch Size
              </div>
              <div className="mt-1 text-sm font-semibold text-emerald-300">
                Not limited by chunk size
              </div>
            </div>

            <div className="rounded-xl border border-[#222a45] bg-[#10182d] px-4 py-3">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Publication
              </div>
              <div className="mt-1 text-sm font-semibold text-amber-300">
                Review Required
              </div>
            </div>
          </div>
        </section>

        {uploadPanelOpen ? (
          <section className="rounded-2xl border border-indigo-400/30 bg-[#0b1224] p-5 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h2 className="text-base font-bold text-white">
                  New Bulk Import
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Select one JSONL file. The final import will appear as one batch even when VOKA divides it into many internal chunks.
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setUploadPanelOpen(
                    false,
                  )
                }
                className="text-xs font-semibold text-slate-500 hover:text-white"
              >
                Close
              </button>
            </div>

            <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(240px,1fr)_minmax(240px,1fr)]">
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">
                  Bulk File
                </label>

                <input
                  ref={
                    fileInputRef
                  }
                  type="file"
                  accept=".jsonl,.ndjson,.txt,application/x-ndjson,text/plain"
                  onChange={
                    handleFile
                  }
                  className="block w-full rounded-lg border border-[#313a5a] bg-[#080e1c] px-3 py-2.5 text-sm text-slate-300 file:mr-3 file:rounded-md file:border-0 file:bg-indigo-500/10 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-indigo-300"
                />

                {selectedFile ? (
                  <div className="mt-2 text-xs text-slate-500">
                    {selectedFile.name}
                    {" · "}
                    {(
                      selectedFile.size /
                      1024 /
                      1024
                    ).toFixed(2)}
                    {" MB"}
                  </div>
                ) : null}
              </div>

              <div>
                <label
                  htmlFor="batch-external-key"
                  className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500"
                >
                  Batch External Key
                </label>

                <input
                  id="batch-external-key"
                  value={
                    batchExternalKey
                  }
                  onChange={(
                    event,
                  ) =>
                    setBatchExternalKey(
                      event.target.value,
                    )
                  }
                  placeholder="SECURITY_BATCH_010"
                  className="h-11 w-full rounded-lg border border-[#313a5a] bg-[#080e1c] px-3 text-sm text-slate-100 outline-none focus:border-indigo-400"
                />
              </div>

              <div>
                <label
                  htmlFor="source-namespace"
                  className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500"
                >
                  Source Namespace
                </label>

                <input
                  id="source-namespace"
                  value={
                    sourceNamespace
                  }
                  onChange={(
                    event,
                  ) =>
                    setSourceNamespace(
                      event.target.value,
                    )
                  }
                  className="h-11 w-full rounded-lg border border-[#313a5a] bg-[#080e1c] px-3 text-sm text-slate-100 outline-none focus:border-indigo-400"
                />
              </div>
            </div>

            <UniversalLibraryBulkImportExecutionControl
            selectedFile={selectedFile}
            batchExternalKey={batchExternalKey}
            sourceNamespace={sourceNamespace}
            onImportFinished={() => {
              void loadBatches();
            }}
          />
          </section>
        ) : null}

        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          <MetricCard
            label="Completed Batches"
            value={
              formatNumber(
                metrics.completed,
              )
            }
          />

          <MetricCard
            label="Active"
            value={
              formatNumber(
                metrics.active,
              )
            }
          />

          <MetricCard
            label="Needs Attention"
            value={
              formatNumber(
                metrics.attention,
              )
            }
          />

          <MetricCard
            label="Staged Contribution"
            value={
              formatNumber(
                metrics.staged,
              )
            }
          />

          <MetricCard
            label="Duplicates"
            value={
              formatNumber(
                metrics.duplicates,
              )
            }
          />

          <MetricCard
            label="Review Required"
            value={
              formatNumber(
                metrics.review,
              )
            }
          />
        </section>

        {error ? (
          <div className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        ) : null}

        <section className="overflow-hidden rounded-2xl border border-[#222a45] bg-[#0b1224] shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-[#222a45] px-5 py-4">
            <div>
              <h2 className="text-base font-bold text-slate-100">
                Import Batch History
              </h2>

              <p className="mt-1 text-xs text-slate-500">
                One logical batch per row. Internal chunk execution stays grouped and resumable.
              </p>
            </div>

            <div className="shrink-0 rounded-full border border-[#313a5a] bg-[#10182d] px-3 py-1 text-xs font-semibold text-slate-400">
              {batches.length.toLocaleString()} batches
            </div>
          </div>

          <div className="divide-y divide-[#1b2340]">
            {loading ? (
              <div className="px-5 py-12 text-center text-sm text-slate-500">
                Loading import batches...
              </div>
            ) : batches.length === 0 ? (
              <div className="px-5 py-12 text-center">
                <div className="text-sm font-semibold text-slate-300">
                  No bulk import batches yet
                </div>

                <div className="mt-1 text-xs text-slate-500">
                  Upload a governed JSONL file or run the CLI bulk importer.
                </div>
              </div>
            ) : (
              batches.map((batch) => {
                const progress =
                  batch.expectedChunks > 0
                    ? Math.round(
                        (batch.completedChunks / batch.expectedChunks) * 100,
                      )
                    : 0;

                return (
                  <div
                    key={`${batch.sourceId}:${batch.sourceNamespace ?? ""}:${batch.batchExternalKey}`}
                    className="px-5 py-4 transition hover:bg-[#10182d]/60"
                  >
                    <div className="grid gap-4 lg:grid-cols-[minmax(220px,1.25fr)_auto_minmax(220px,1fr)] lg:items-center">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-bold text-white">
                          {batch.batchExternalKey}
                        </div>

                        <div className="mt-1 truncate font-mono text-[10px] text-slate-500">
                          {batch.fileName || "No file name"}
                        </div>

                        <div className="mt-1 truncate text-[10px] text-slate-600">
                          {batch.sourceNamespace || "No namespace"}
                        </div>
                      </div>

                      <div>
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold ${statusClass(
                            batch.status,
                          )}`}
                        >
                          {batch.status}
                        </span>
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center justify-between gap-3 text-[11px] text-slate-400">
                          <span>
                            {batch.completedChunks}/{batch.expectedChunks} chunks
                          </span>

                          <span className="font-semibold text-slate-300">
                            {progress}%
                          </span>
                        </div>

                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#1b2340]">
                          <div
                            className="h-full rounded-full bg-indigo-500"
                            style={{
                              width: `${Math.min(progress, 100)}%`,
                            }}
                          />
                        </div>

                        {batch.failedChunks > 0 || batch.partialChunks > 0 ? (
                          <div className="mt-1 text-[10px] text-amber-300">
                            {batch.failedChunks} failed · {batch.partialChunks} partial
                          </div>
                        ) : null}
                      </div>

                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:col-span-3">
                        <div className="rounded-lg border border-[#222a45] bg-[#10182d] px-2.5 py-2">
                          <div className="flex min-h-[28px] items-start text-[9px] font-bold uppercase leading-3 tracking-wide text-slate-600">
                            Fetched
                          </div>
                          <div className="mt-1 text-xs font-semibold text-slate-200">
                            {formatNumber(batch.fetchedCount)}
                          </div>
                        </div>

                        <div className="rounded-lg border border-[#222a45] bg-[#10182d] px-2.5 py-2">
                          <div className="flex min-h-[28px] items-start text-[9px] font-bold uppercase leading-3 tracking-wide text-slate-600">
                            Staged Contribution
                          </div>
                          <div className="mt-1 text-xs font-semibold text-emerald-300">
                            {formatNumber(
                              batch.stagedContributionCount ??
                                batch.stagedCount,
                            )}
                          </div>
                        </div>

                        <div className="rounded-lg border border-[#222a45] bg-[#10182d] px-2.5 py-2">
                          <div className="flex min-h-[28px] items-start text-[9px] font-bold uppercase leading-3 tracking-wide text-slate-600">
                            Latest Duplicates
                          </div>
                          <div className="mt-1 text-xs font-semibold text-amber-300">
                            {formatNumber(batch.duplicateCount)}
                          </div>
                        </div>

                        <div className="rounded-lg border border-[#222a45] bg-[#10182d] px-2.5 py-2">
                          <div className="flex min-h-[28px] items-start text-[9px] font-bold uppercase leading-3 tracking-wide text-slate-600">
                            Review
                          </div>
                          <div className="mt-1 text-xs font-semibold text-violet-300">
                            {formatNumber(batch.reviewRequiredCount)}
                          </div>
                        </div>
                      </div>

                      <div className="lg:col-span-3 lg:text-right">
                        <div className="flex min-h-[28px] items-start text-[9px] font-bold uppercase leading-3 tracking-wide text-slate-600">
                          Last Activity
                        </div>

                        <div className="mt-1 text-[11px] leading-5 text-slate-400">
                          {formatDate(batch.lastActivityAt)}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
<section className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-[#222a45] bg-[#0b1224] p-5">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Batch Model
            </div>

            <h3 className="mt-2 text-base font-semibold text-slate-100">
              One import, many safe chunks
            </h3>

            <p className="mt-2 text-sm leading-6 text-slate-500">
              Large files remain one logical import operation while execution is divided internally into bounded independent chunks.
            </p>
          </div>

          <div className="rounded-2xl border border-[#222a45] bg-[#0b1224] p-5">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Recovery
            </div>

            <h3 className="mt-2 text-base font-semibold text-slate-100">
              Resume only what failed
            </h3>

            <p className="mt-2 text-sm leading-6 text-slate-500">
              Completed chunks remain durable. Failed or missing chunks can be identified and retried without replaying the complete batch.
            </p>
          </div>

          <div className="rounded-2xl border border-[#222a45] bg-[#0b1224] p-5">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Governance
            </div>

            <h3 className="mt-2 text-base font-semibold text-slate-100">
              Staging only
            </h3>

            <p className="mt-2 text-sm leading-6 text-slate-500">
              Bulk operations never directly publish canonical Universal Library entities. Review and governance remain mandatory.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
