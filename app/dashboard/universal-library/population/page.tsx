"use client";

import React, { useState } from "react";

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

export default function PopulationObservabilityPage() {
  const [prompt, setPrompt] = useState("CCTV IP Surveillance System");
  const [domainHint, setDomainHint] = useState("Security Equipment");
  const [useLive, setUseLive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [runSummary, setRunSummary] = useState<PopulationRunSummary | null>(null);

  const handleStartRun = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    setLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch("/api/universal-library/population/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim(),
          domainHint: domainHint.trim() || undefined,
          useLive,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to execute population run.");
      }

      setRunSummary(json.data || json);
    } catch (err: any) {
      setErrorMsg(err.message || "An unexpected error occurred during the population run.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="border-b pb-4">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Governed Universal Library Population Engine
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Discover real-world commercial equipment and solutions, extract web evidence, and stage candidates into the Universal Commercial Library pipeline.
        </p>
      </div>

      {/* Control Panel / Run Form */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
        <h2 className="text-lg font-semibold text-slate-800">Start Population Run</h2>
        <form onSubmit={handleStartRun} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
              Search Query / Prompt
            </label>
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. CCTV IP Surveillance Systems, Fire Alarm Panels"
              className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
              Domain Hint (Optional)
            </label>
            <input
              type="text"
              value={domainHint}
              onChange={(e) => setDomainHint(e.target.value)}
              placeholder="e.g. Security Equipment"
              className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-center pt-5">
            <label className="inline-flex items-center cursor-pointer text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={useLive}
                onChange={(e) => setUseLive(e.target.checked)}
                className="sr-only peer"
              />
              <div className="relative w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              <span className="ms-3 text-sm font-medium text-slate-900">
                Live OpenAI + Web Search Mode (requires OPENAI_API_KEY)
              </span>
            </label>
          </div>

          <div className="md:col-span-2 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 text-white font-medium text-sm rounded-lg shadow transition-colors inline-flex items-center gap-2"
            >
              {loading ? (
                <>
                  <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                  Running Discovery & Governed Pipeline...
                </>
              ) : (
                "Execute Bounded Population Run"
              )}
            </button>
          </div>
        </form>

        {errorMsg && (
          <div className="p-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
            {errorMsg}
          </div>
        )}
      </div>

      {/* Population Run Observability Surface */}
      {runSummary && (
        <div className="space-y-6">
          {/* Status Header */}
          <div className="bg-slate-900 text-white p-6 rounded-xl shadow-md flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono uppercase text-slate-400">Run ID: {runSummary.runId}</span>
                <span
                  className={`px-2.5 py-0.5 text-xs font-semibold rounded-full ${
                    runSummary.status === "COMPLETED"
                      ? "bg-emerald-500 text-white"
                      : runSummary.status === "PARTIAL"
                      ? "bg-amber-500 text-white"
                      : "bg-red-500 text-white"
                  }`}
                >
                  {runSummary.status}
                </span>
              </div>
              <h2 className="text-xl font-bold mt-1">{runSummary.seed.nameEn}</h2>
              <p className="text-xs text-slate-300 mt-0.5">
                Query: &quot;{runSummary.query.prompt}&quot; | Confidence: {(runSummary.seed.confidence * 100).toFixed(0)}%
              </p>
            </div>
          </div>

          {/* Counts Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3">
            <div className="bg-white p-4 rounded-lg border border-slate-200 text-center">
              <span className="block text-2xl font-bold text-slate-800">
                {runSummary.counts.discoveredComponentsCount}
              </span>
              <span className="text-xs text-slate-500 font-medium">Discovered</span>
            </div>

            <div className="bg-white p-4 rounded-lg border border-slate-200 text-center">
              <span className="block text-2xl font-bold text-blue-600">
                {runSummary.counts.plannedWorkItemsCount}
              </span>
              <span className="text-xs text-slate-500 font-medium">Planned Work</span>
            </div>

            <div className="bg-white p-4 rounded-lg border border-slate-200 text-center">
              <span className="block text-2xl font-bold text-emerald-600">
                {runSummary.counts.stagedRecordsCount}
              </span>
              <span className="text-xs text-slate-500 font-medium">Staged Records</span>
            </div>

            <div className="bg-white p-4 rounded-lg border border-slate-200 text-center">
              <span className="block text-2xl font-bold text-amber-600">
                {runSummary.counts.duplicateRecordsCount}
              </span>
              <span className="text-xs text-slate-500 font-medium">Duplicates</span>
            </div>

            <div className="bg-white p-4 rounded-lg border border-slate-200 text-center">
              <span className="block text-2xl font-bold text-purple-600">
                {runSummary.counts.needsReviewCount}
              </span>
              <span className="text-xs text-slate-500 font-medium">Needs Review</span>
            </div>

            <div className="bg-white p-4 rounded-lg border border-slate-200 text-center">
              <span className="block text-2xl font-bold text-red-600">
                {runSummary.counts.rejectedCount}
              </span>
              <span className="text-xs text-slate-500 font-medium">Rejected</span>
            </div>

            <div className="bg-slate-50 p-4 rounded-lg border border-slate-300 text-center">
              <span className="block text-2xl font-bold text-slate-400">
                {runSummary.counts.publishedCount}
              </span>
              <span className="text-[10px] text-slate-500 font-semibold block uppercase">
                Published (0)
              </span>
            </div>
          </div>

          {/* Source Evidence URLs */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-3">
            <h3 className="text-sm font-semibold text-slate-800 uppercase tracking-wider">
              Discovered Web Evidence URLs ({runSummary.evidenceUrls.length})
            </h3>
            {runSummary.evidenceUrls.length > 0 ? (
              <ul className="space-y-1.5 text-sm font-mono text-blue-600">
                {runSummary.evidenceUrls.map((url, idx) => (
                  <li key={idx} className="truncate">
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline flex items-center gap-1"
                    >
                      <span>🌐</span>
                      <span className="truncate">{url}</span>
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500 italic">No web evidence references attached.</p>
            )}
          </div>

          {/* Staged Candidate Items Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-200 bg-slate-50">
              <h3 className="text-sm font-semibold text-slate-800 uppercase tracking-wider">
                Staged Candidates ({runSummary.stagedCandidates.length})
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-700">
                <thead className="bg-slate-100 text-xs font-semibold uppercase text-slate-600 border-b">
                  <tr>
                    <th className="px-4 py-3">Key / Component</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Manufacturer / Brand</th>
                    <th className="px-4 py-3">Model / MPN</th>
                    <th className="px-4 py-3">Evidence URL</th>
                    <th className="px-4 py-3">Staging Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {runSummary.stagedCandidates.map((c, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium">
                        <div>{c.nameEn}</div>
                        <div className="text-xs font-mono text-slate-400">{c.componentKey}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                          {c.componentType}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {c.manufacturer || "N/A"}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">
                        <div>Model: {c.modelNumber || "N/A"}</div>
                        <div>MPN: {c.mpn || "N/A"}</div>
                      </td>
                      <td className="px-4 py-3 text-xs max-w-xs truncate font-mono text-blue-600">
                        {c.evidenceUrl ? (
                          <a
                            href={c.evidenceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:underline"
                          >
                            {c.evidenceUrl}
                          </a>
                        ) : (
                          <span className="text-slate-400">None</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-block px-2.5 py-1 text-xs font-semibold rounded bg-purple-100 text-purple-800">
                          {c.status}
                        </span>
                        {c.ingestionRecordId && (
                          <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                            ID: {c.ingestionRecordId}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Error Summary */}
          {runSummary.errors.length > 0 && (
            <div className="bg-red-50 border border-red-200 p-4 rounded-xl text-sm text-red-700 space-y-1">
              <h4 className="font-semibold text-red-800">Pipeline Errors / Candidate Rejections:</h4>
              <ul className="list-disc list-inside space-y-0.5 font-mono text-xs">
                {runSummary.errors.map((err, idx) => (
                  <li key={idx}>{err}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
