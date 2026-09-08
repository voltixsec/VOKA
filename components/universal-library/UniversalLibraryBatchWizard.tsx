"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { BATCH_WIZARD_STEPS } from "@/features/universal-library/domain/bulk-import/BatchWizardContract";

type StepState =
  | "LOCKED"
  | "READY"
  | "IN_PROGRESS"
  | "COMPLETE"
  | "PARTIAL"
  | "ERROR";

type Journey = {
  overallStatus: string;
  canProcess: boolean;
  canRetryFailedRecords: boolean;
  canResumeChunks: boolean;
  retryChunkIndexes: number[];
  records: {
    total: number;
    received: number;
    needsReview: number;
    published: number;
    rejected: number;
    failed: number;
    awaitingProcess: number;
  };
  steps: Array<{
    id: string;
    label: string;
    href: string;
    state: StepState;
  }>;
};

function stepClass(state: StepState): string {
  if (state === "COMPLETE") {
    return "border-emerald-400/30 bg-emerald-500/10 text-emerald-300";
  }
  if (state === "READY" || state === "IN_PROGRESS") {
    return "border-indigo-400/30 bg-indigo-500/10 text-indigo-300";
  }
  if (state === "PARTIAL") {
    return "border-amber-400/30 bg-amber-500/10 text-amber-300";
  }
  if (state === "ERROR") {
    return "border-red-400/30 bg-red-500/10 text-red-300";
  }
  return "border-[#222a45] bg-[#10182d] text-slate-500";
}

export default function UniversalLibraryBatchWizard({
  sourceId,
  batchExternalKey,
  sourceNamespace,
  onResumeRequested,
}: {
  sourceId: string;
  batchExternalKey: string;
  sourceNamespace: string;
  onResumeRequested?: () => void;
}) {
  const [journey, setJourney] = useState<Journey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const loadJourney = useCallback(async () => {
    if (!sourceId.trim() || !batchExternalKey.trim()) {
      setJourney(null);
      return;
    }

    const params = new URLSearchParams({
      sourceId: sourceId.trim(),
      batchExternalKey: batchExternalKey.trim(),
      sourceNamespace: sourceNamespace.trim(),
    });

    const response = await fetch(
      `/api/universal-library/bulk-import/ui/journey?${params.toString()}`,
      { cache: "no-store" },
    );
    const body = await response.json();

    if (!response.ok) {
      throw new Error(
        body?.error?.message || "Failed to load batch wizard journey.",
      );
    }

    setJourney((body.data ?? body) as Journey);
  }, [sourceId, batchExternalKey, sourceNamespace]);

  useEffect(() => {
    void loadJourney().catch((caught) => {
      setError(
        caught instanceof Error
          ? caught.message
          : "Failed to load batch wizard journey.",
      );
    });
  }, [loadJourney]);

  async function processBatch() {
    if (!sourceId.trim() || !batchExternalKey.trim()) {
      return;
    }

    setBusy(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(
        "/api/universal-library/bulk-import/ui/process",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            sourceId: sourceId.trim(),
            batchExternalKey: batchExternalKey.trim(),
            sourceNamespace: sourceNamespace.trim() || undefined,
          }),
        },
      );

      const body = await response.json();

      if (!response.ok) {
        throw new Error(
          body?.error?.message || "Batch wizard process failed.",
        );
      }

      const result = body.data ?? body;

      if (result.publishedCount !== 0) {
        throw new Error(
          "Bulk wizard safety violation: publication occurred during process.",
        );
      }

      setMessage(
        `Processed ${result.processedCount} records. ${result.needsReviewCount} sent to review. ${result.failedCount} failed. Remaining: ${result.remainingCount}.`,
      );

      await loadJourney();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Batch wizard process failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  const steps = journey?.steps ?? BATCH_WIZARD_STEPS.map((step) => ({
    id: step.id,
    label: step.label,
    href: step.href,
    state: "LOCKED" as StepState,
  }));

  return (
    <section
      data-testid="ucl-batch-wizard"
      className="rounded-2xl border border-[#222a45] bg-[#0b1224] p-5"
    >
      <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.16em] text-indigo-300">
            E2E Batch Wizard
          </div>
          <h2 className="mt-2 text-lg font-semibold text-white">
            File → Upload → Batch → Process → Staging → Hierarchy → Products → Review → Publish → Status / History
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Bounded operator journey. Import never publishes. Failed or missing chunks can resume. Failed records can retry.
          </p>
        </div>
        {journey ? (
          <div className="rounded-xl border border-[#313a5a] bg-[#10182d] px-3 py-2 text-xs font-semibold text-slate-300">
            {journey.overallStatus.replace(/_/g, " ")}
          </div>
        ) : null}
      </div>

      <ol className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        {steps.map((step, index) => (
          <li key={step.id}>
            <Link
              href={step.href}
              data-testid={`ucl-batch-wizard-step-${step.id}`}
              className={`block rounded-xl border px-3 py-3 ${stepClass(step.state)}`}
            >
              <div className="text-[10px] font-bold uppercase tracking-wider">
                {index + 1}. {step.label}
              </div>
              <div className="mt-1 text-[11px]">{step.state.replace(/_/g, " ")}</div>
            </Link>
          </li>
        ))}
      </ol>

      {journey ? (
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <div className="rounded-lg border border-[#222a45] bg-[#10182d] px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">Awaiting process</div>
            <div className="mt-1 text-sm font-semibold text-white">{journey.records.awaitingProcess}</div>
          </div>
          <div className="rounded-lg border border-[#222a45] bg-[#10182d] px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">Needs review</div>
            <div className="mt-1 text-sm font-semibold text-violet-300">{journey.records.needsReview}</div>
          </div>
          <div className="rounded-lg border border-[#222a45] bg-[#10182d] px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">Failed</div>
            <div className="mt-1 text-sm font-semibold text-amber-300">{journey.records.failed}</div>
          </div>
          <div className="rounded-lg border border-[#222a45] bg-[#10182d] px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">Published</div>
            <div className="mt-1 text-sm font-semibold text-emerald-300">{journey.records.published}</div>
          </div>
          <div className="rounded-lg border border-[#222a45] bg-[#10182d] px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">Retry chunks</div>
            <div className="mt-1 text-sm font-semibold text-slate-200">{journey.retryChunkIndexes.length}</div>
          </div>
          <div className="rounded-lg border border-[#222a45] bg-[#10182d] px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">Rejected</div>
            <div className="mt-1 text-sm font-semibold text-red-300">{journey.records.rejected}</div>
          </div>
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-2">
        <button
          type="button"
          data-testid="ucl-batch-wizard-process"
          disabled={busy || !journey?.canProcess}
          onClick={() => void processBatch()}
          className="h-10 rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-500"
        >
          {busy
            ? "Processing..."
            : journey?.canRetryFailedRecords
              ? "Retry failed / process remaining"
              : "Process batch"}
        </button>

        {journey?.canResumeChunks && onResumeRequested ? (
          <button
            type="button"
            data-testid="ucl-batch-wizard-resume"
            onClick={onResumeRequested}
            className="h-10 rounded-lg border border-amber-400/30 bg-amber-500/10 px-4 text-sm font-semibold text-amber-200"
          >
            Resume failed chunks
          </button>
        ) : null}

        <button
          type="button"
          onClick={() => void loadJourney()}
          className="h-10 rounded-lg border border-[#313a5a] bg-[#10182d] px-4 text-sm font-semibold text-slate-200"
        >
          Refresh journey
        </button>
      </div>

      {message ? (
        <div className="mt-4 rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
          {message}
        </div>
      ) : null}

      {error ? (
        <div
          data-testid="ucl-batch-wizard-error"
          className="mt-4 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-300"
        >
          {error}
        </div>
      ) : null}

      {journey?.canResumeChunks ? (
        <div className="mt-3 text-xs text-amber-300">
          Partial/failure state: retry chunks {journey.retryChunkIndexes.join(", ")}. Re-select the original file to resume only those chunks.
        </div>
      ) : null}
    </section>
  );
}
