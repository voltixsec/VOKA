"use client";

import React, { useMemo, useState } from "react";

interface CandidateSummary {
  componentKey: string;
  nameEn: string;
  componentType: "PRODUCT" | "SERVICE";
  manufacturer: string | null;
  modelNumber: string | null;
  mpn: string | null;
  evidenceUrl: string | null;
  status: string;
  ingestionRecordId: string | null;
  errorMessage: string | null;
}

interface PopulationRunSummary {
  runId: string;
  status: "COMPLETED" | "FAILED" | "PARTIAL";
  query: {
    prompt: string;
    domainHint: string | null;
    targetMarket: string | null;
  };
  seed: {
    id: string;
    nameEn: string;
    seedType: string;
    confidence: number;
  };
  counts: {
    discoveredComponentsCount: number;
    plannedWorkItemsCount: number;
    stagedRecordsCount: number;
    duplicateRecordsCount: number;
    needsReviewCount: number;
    rejectedCount: number;
    publishedCount: number;
  };
  evidenceUrls: string[];
  stagedCandidates: CandidateSummary[];
  errors: string[];
}

type CandidateStatusFilter = "ALL" | "NEEDS_REVIEW" | "REJECTED" | "OTHER";

function statusClass(status: string): string {
  if (status === "NEEDS_REVIEW" || status === "MATCHED") {
    return "border-amber-400/30 bg-amber-500/10 text-amber-300";
  }

  if (status === "REJECTED" || status === "FAILED") {
    return "border-red-400/30 bg-red-500/10 text-red-300";
  }

  if (status === "PUBLISHED") {
    return "border-emerald-400/30 bg-emerald-500/10 text-emerald-300";
  }

  return "border-[#222a45] bg-[#10182d] text-slate-300";
}

function metricCard(
  label: string,
  value: number,
  valueClass = "text-slate-100",
  note?: string,
) {
  return (
    <div className="rounded-xl border border-[#222a45] bg-[#0b1224] px-4 py-4 shadow-sm">
      <div className={`text-2xl font-bold tracking-tight ${valueClass}`}>
        {value.toLocaleString()}
      </div>
      <div className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </div>
      {note ? (
        <div className="mt-1 text-[11px] leading-4 text-slate-500">
          {note}
        </div>
      ) : null}
    </div>
  );
}

export default function PopulationObservabilityPage() {
  const [prompt, setPrompt] = useState("CCTV IP Surveillance System");
  const [domainHint, setDomainHint] = useState("Security Equipment");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [runSummary, setRunSummary] =
    useState<PopulationRunSummary | null>(null);

  const [candidateSearch, setCandidateSearch] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<CandidateStatusFilter>("ALL");

  const filteredCandidates = useMemo(() => {
    if (!runSummary) {
      return [];
    }

    const normalizedSearch = candidateSearch.trim().toLowerCase();

    return runSummary.stagedCandidates.filter((candidate) => {
      const searchable = [
        candidate.nameEn,
        candidate.componentKey,
        candidate.manufacturer ?? "",
        candidate.modelNumber ?? "",
        candidate.mpn ?? "",
      ]
        .join(" ")
        .toLowerCase();

      const matchesSearch =
        normalizedSearch.length === 0 ||
        searchable.includes(normalizedSearch);

      let matchesStatus = true;

      if (statusFilter === "NEEDS_REVIEW") {
        matchesStatus =
          candidate.status === "NEEDS_REVIEW" ||
          candidate.status === "MATCHED";
      } else if (statusFilter === "REJECTED") {
        matchesStatus =
          candidate.status === "REJECTED" ||
          candidate.status === "FAILED";
      } else if (statusFilter === "OTHER") {
        matchesStatus = ![
          "NEEDS_REVIEW",
          "MATCHED",
          "REJECTED",
          "FAILED",
        ].includes(candidate.status);
      }

      return matchesSearch && matchesStatus;
    });
  }, [candidateSearch, runSummary, statusFilter]);

  const handleStartRun = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!prompt.trim()) {
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      const response = await fetch(
        "/api/universal-library/population/run",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            prompt: prompt.trim(),
            domainHint: domainHint.trim() || undefined,
          }),
        },
      );

      const json = await response.json();

      if (!response.ok) {
        throw new Error(
          json.error || "Failed to execute population run.",
        );
      }

      setRunSummary(json.data || json);
      setCandidateSearch("");
      setStatusFilter("ALL");
    } catch (error) {
      setErrorMsg(
        error instanceof Error
          ? error.message
          : "An unexpected error occurred during the population run.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#060b1a]">
      <div className="mx-auto max-w-[1600px] space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <section className="overflow-hidden rounded-2xl border border-[#222a45] bg-[#0b1224] shadow-sm">
          <div className="border-b border-[#222a45] px-6 py-6">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div className="max-w-4xl">
                <div className="mb-2 inline-flex rounded-full border border-indigo-400/30 bg-indigo-500/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-indigo-300">
                  Universal Commercial Library
                </div>

                <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
                  Governed Universal Library Population Engine
                </h1>

                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
                  Discover commercial systems, products, and services from
                  governed web research, preserve evidence, and stage
                  candidates for review without direct publication.
                </p>
              </div>

              <div className="grid min-w-[280px] grid-cols-2 gap-2">
                <div className="rounded-xl border border-[#222a45] bg-[#10182d] px-3 py-3">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Mode
                  </div>
                  <div className="mt-1 text-sm font-semibold text-slate-200">
                    Governed Staging
                  </div>
                </div>

                <div className="rounded-xl border border-[#222a45] bg-[#10182d] px-3 py-3">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Publication
                  </div>
                  <div className="mt-1 text-sm font-semibold text-slate-200">
                    Review Required
                  </div>
                </div>
              </div>
            </div>
          </div>

          <form
            onSubmit={handleStartRun}
            className="grid grid-cols-1 gap-4 px-6 py-5 lg:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)_auto]"
          >
            <div>
              <label
                htmlFor="population-prompt"
                className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500"
              >
                Search Query / Prompt
              </label>

              <input
                id="population-prompt"
                type="text"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="e.g. CCTV IP Surveillance Systems, Fire Alarm Panels"
                className="h-11 w-full rounded-lg border border-[#313a5a] bg-[#0b1224] px-3 text-sm text-slate-100 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
                required
              />
            </div>

            <div>
              <label
                htmlFor="population-domain"
                className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500"
              >
                Domain Hint
              </label>

              <input
                id="population-domain"
                type="text"
                value={domainHint}
                onChange={(event) =>
                  setDomainHint(event.target.value)
                }
                placeholder="e.g. Security Equipment"
                className="h-11 w-full rounded-lg border border-[#313a5a] bg-[#0b1224] px-3 text-sm text-slate-100 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>

            <div className="flex items-end">
              <button
                type="submit"
                disabled={loading}
                className="h-11 w-full whitespace-nowrap rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 px-5 text-sm font-semibold text-white shadow-sm transition hover:from-indigo-500 hover:to-violet-500 disabled:cursor-not-allowed disabled:bg-slate-400 lg:w-auto"
              >
                {loading
                  ? "Running Discovery & Governed Pipeline..."
                  : "Execute Bounded Population Run"}
              </button>
            </div>
          </form>

          {errorMsg ? (
            <div className="mx-6 mb-5 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {errorMsg}
            </div>
          ) : null}
        </section>

        {!runSummary ? (
          <section className="grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-[#222a45] bg-[#0b1224] p-5 shadow-sm">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Discovery
              </div>
              <h2 className="mt-2 text-base font-semibold text-slate-100">
                System-first research
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Start from a commercial system or solution context and
                discover bounded product and service candidates.
              </p>
            </div>

            <div className="rounded-2xl border border-[#222a45] bg-[#0b1224] p-5 shadow-sm">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Governance
              </div>
              <h2 className="mt-2 text-base font-semibold text-slate-100">
                Evidence before publication
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Candidates remain staged or under review. This console does
                not directly publish discoveries into the Universal Library.
              </p>
            </div>

            <div className="rounded-2xl border border-[#222a45] bg-[#0b1224] p-5 shadow-sm">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Scale
              </div>
              <h2 className="mt-2 text-base font-semibold text-slate-100">
                Huge Library, Small Working Set
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                This live run remains bounded. Large bulk datasets use the
                dedicated governed bulk-import path.
              </p>
            </div>
          </section>
        ) : (
          <>
            <section className="rounded-2xl border border-slate-800 bg-[#070d1b] p-5 text-white shadow-sm">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-slate-500">
                      Run ID: {runSummary.runId}
                    </span>

                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                        runSummary.status === "COMPLETED"
                          ? "bg-emerald-500/100/20 text-emerald-300"
                          : runSummary.status === "PARTIAL"
                            ? "bg-amber-500/100/20 text-amber-300"
                            : "bg-red-500/100/20 text-red-300"
                      }`}
                    >
                      {runSummary.status}
                    </span>
                  </div>

                  <h2 className="mt-2 text-xl font-bold">
                    {runSummary.seed.nameEn}
                  </h2>

                  <p className="mt-1 text-sm text-slate-500">
                    Query: &quot;{runSummary.query.prompt}&quot;
                    {" · "}
                    Confidence:{" "}
                    {(runSummary.seed.confidence * 100).toFixed(0)}%
                    {runSummary.query.domainHint
                      ? ` · Domain: ${runSummary.query.domainHint}`
                      : ""}
                  </p>
                </div>

                <div className="rounded-xl border border-slate-700 bg-[#0a1020] px-4 py-3">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Seed Type
                  </div>
                  <div className="mt-1 text-sm font-semibold text-slate-200">
                    {runSummary.seed.seedType}
                  </div>
                </div>
              </div>
            </section>

            <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
              {metricCard(
                "Discovered",
                runSummary.counts.discoveredComponentsCount,
              )}
              {metricCard(
                "Planned Work",
                runSummary.counts.plannedWorkItemsCount,
                "text-indigo-300",
              )}
              {metricCard(
                "Staged",
                runSummary.counts.stagedRecordsCount,
                "text-emerald-300",
              )}
              {metricCard(
                "Duplicates",
                runSummary.counts.duplicateRecordsCount,
                "text-amber-300",
              )}
              {metricCard(
                "Needs Review",
                runSummary.counts.needsReviewCount,
                "text-violet-300",
              )}
              {metricCard(
                "Rejected",
                runSummary.counts.rejectedCount,
                "text-red-300",
              )}

              <div className="rounded-xl border border-[#313a5a] bg-[#121a30] px-4 py-4 shadow-sm">
                <div className="text-2xl font-bold tracking-tight text-slate-500">
                  {runSummary.counts.publishedCount.toLocaleString()}
                </div>
                <div className="mt-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  Published (0)
                </div>
                <div className="mt-1 text-[11px] leading-4 text-slate-500">
                  Direct publication disabled
                </div>
              </div>
            </section>

            <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
              <div className="overflow-hidden rounded-2xl border border-[#222a45] bg-[#0b1224] shadow-sm">
                <div className="border-b border-[#222a45] px-5 py-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <h3 className="text-base font-bold text-slate-100">
                        Staged Candidates
                      </h3>
                      <p className="mt-1 text-xs text-slate-500">
                        {filteredCandidates.length} shown from{" "}
                        {runSummary.stagedCandidates.length} candidate
                        records
                      </p>
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row">
                      <input
                        type="search"
                        value={candidateSearch}
                        onChange={(event) =>
                          setCandidateSearch(event.target.value)
                        }
                        placeholder="Search model, MPN, manufacturer..."
                        className="h-9 min-w-[240px] rounded-lg border border-[#313a5a] px-3 text-xs outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
                      />

                      <select
                        value={statusFilter}
                        onChange={(event) =>
                          setStatusFilter(
                            event.target.value as CandidateStatusFilter,
                          )
                        }
                        className="h-9 rounded-lg border border-[#313a5a] bg-[#0b1224] px-3 text-xs font-medium text-slate-300 outline-none focus:border-indigo-400"
                      >
                        <option value="ALL">All statuses</option>
                        <option value="NEEDS_REVIEW">
                          Needs review
                        </option>
                        <option value="REJECTED">Rejected</option>
                        <option value="OTHER">Other</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-[#10182d]">
                      <tr>
                        <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">
                          Candidate
                        </th>
                        <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">
                          Identity
                        </th>
                        <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">
                          Type
                        </th>
                        <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">
                          Status
                        </th>
                        <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">
                          Evidence
                        </th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-100">
                      {filteredCandidates.length > 0 ? (
                        filteredCandidates.map((candidate) => (
                          <tr
                            key={candidate.componentKey}
                            className="align-top transition hover:bg-[#10182d]/70"
                          >
                            <td className="px-5 py-4">
                              <div className="max-w-[360px] text-sm font-semibold text-slate-100">
                                {candidate.nameEn}
                              </div>
                              <div className="mt-1 font-mono text-[10px] text-slate-500">
                                {candidate.componentKey}
                              </div>
                              {candidate.errorMessage ? (
                                <div className="mt-2 rounded-md border border-red-100 bg-red-500/10 px-2 py-1 text-[11px] text-red-300">
                                  {candidate.errorMessage}
                                </div>
                              ) : null}
                            </td>

                            <td className="px-4 py-4">
                              <div className="space-y-1 text-xs text-slate-500">
                                <div>
                                  <span className="text-slate-500">
                                    Manufacturer:
                                  </span>{" "}
                                  {candidate.manufacturer || "—"}
                                </div>

                                <div>
                                  Model:{" "}
                                  {candidate.modelNumber || "—"}
                                </div>

                                <div>
                                  <span className="text-slate-500">
                                    MPN:
                                  </span>{" "}
                                  {candidate.mpn || "—"}
                                </div>
                              </div>
                            </td>

                            <td className="px-4 py-4">
                              <span className="rounded-md border border-[#222a45] bg-[#10182d] px-2 py-1 text-[10px] font-bold text-slate-500">
                                {candidate.componentType}
                              </span>
                            </td>

                            <td className="px-4 py-4">
                              <span
                                className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-bold ${statusClass(candidate.status)}`}
                              >
                                {candidate.status}
                              </span>
                            </td>

                            <td className="px-4 py-4">
                              {candidate.evidenceUrl ? (
                                <a
                                  href={candidate.evidenceUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="block max-w-[260px] truncate text-xs font-medium text-indigo-300 hover:underline"
                                >
                                  {candidate.evidenceUrl}
                                </a>
                              ) : (
                                <span className="text-xs text-slate-500">
                                  No evidence URL
                                </span>
                              )}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td
                            colSpan={5}
                            className="px-5 py-12 text-center text-sm text-slate-500"
                          >
                            No candidates match the current filters.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="space-y-6">
                <section className="overflow-hidden rounded-2xl border border-[#222a45] bg-[#0b1224] shadow-sm">
                  <div className="border-b border-[#222a45] px-5 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-bold text-slate-100">
                          Evidence Registry
                        </h3>
                        <p className="mt-1 text-xs text-slate-500">
                          Discovered Web Evidence URLs (
                          {runSummary.evidenceUrls.length})
                        </p>
                      </div>

                      <span className="rounded-full bg-indigo-500/10 px-2.5 py-1 text-xs font-bold text-indigo-300">
                        {runSummary.evidenceUrls.length}
                      </span>
                    </div>
                  </div>

                  <div className="max-h-[420px] overflow-y-auto p-4">
                    {runSummary.evidenceUrls.length > 0 ? (
                      <ul className="space-y-2">
                        {runSummary.evidenceUrls.map((url) => (
                          <li
                            key={url}
                            className="rounded-lg border border-[#222a45] bg-[#10182d] px-3 py-2"
                          >
                            <a
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block break-all text-xs font-medium leading-5 text-indigo-300 hover:underline"
                            >
                              {url}
                            </a>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="py-8 text-center text-xs text-slate-500">
                        No evidence URLs were returned for this run.
                      </div>
                    )}
                  </div>
                </section>

                <section className="rounded-2xl border border-[#222a45] bg-[#0b1224] p-5 shadow-sm">
                  <h3 className="text-sm font-bold text-slate-100">
                    Governance State
                  </h3>

                  <div className="mt-4 space-y-3">
                    <div className="flex items-center justify-between border-b border-[#1b2340] pb-3 text-xs">
                      <span className="text-slate-500">
                        Staged records
                      </span>
                      <span className="font-bold text-slate-100">
                        {runSummary.counts.stagedRecordsCount}
                      </span>
                    </div>

                    <div className="flex items-center justify-between border-b border-[#1b2340] pb-3 text-xs">
                      <span className="text-slate-500">
                        Review queue
                      </span>
                      <span className="font-bold text-amber-300">
                        {runSummary.counts.needsReviewCount}
                      </span>
                    </div>

                    <div className="flex items-center justify-between border-b border-[#1b2340] pb-3 text-xs">
                      <span className="text-slate-500">
                        Rejected / failed
                      </span>
                      <span className="font-bold text-red-300">
                        {runSummary.counts.rejectedCount}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500">
                        Directly published
                      </span>
                      <span className="font-bold text-slate-500">
                        {runSummary.counts.publishedCount}
                      </span>
                    </div>
                  </div>
                </section>

                {runSummary.errors.length > 0 ? (
                  <section className="rounded-2xl border border-red-400/30 bg-red-500/10 p-5">
                    <h3 className="text-sm font-bold text-red-800">
                      Run Errors
                    </h3>

                    <ul className="mt-3 space-y-2 text-xs leading-5 text-red-300">
                      {runSummary.errors.map((error, index) => (
                        <li key={`${index}-${error}`}>{error}</li>
                      ))}
                    </ul>
                  </section>
                ) : null}
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
