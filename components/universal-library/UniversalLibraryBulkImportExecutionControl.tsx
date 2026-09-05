"use client";

import {
  useState,
} from "react";

const DEFAULT_DATA_FACTORY_SOURCE_ID =
  "cmto59ep10000gkt18i4ug9z9";

const RECORDS_PER_CHUNK =
  1000;

type Phase =
  | "IDLE"
  | "SCANNING"
  | "UPLOADING"
  | "COMPLETED"
  | "NEEDS_ATTENTION"
  | "FAILED";

type BatchStatusResult = {
  overallStatus:
    | "COMPLETED"
    | "IN_PROGRESS"
    | "NEEDS_ATTENTION";

  expectedChunks:
    number;

  retryChunkIndexes:
    number[];

  completedChunks:
    number;

  partialChunks:
    number;

  failedChunks:
    number;

  activeChunks:
    number;

  missingChunks:
    number;
};

type Props = {
  selectedFile:
    File | null;

  batchExternalKey:
    string;

  sourceNamespace:
    string;

  onImportFinished:
    () => void;
};

async function* readNonBlankLines(
  file: File,
): AsyncGenerator<string> {
  const reader =
    file.stream()
      .getReader();

  const decoder =
    new TextDecoder(
      "utf-8",
    );

  let buffer = "";

  try {
    while (true) {
      const {
        done,
        value,
      } =
        await reader.read();

      if (done) {
        break;
      }

      buffer +=
        decoder.decode(
          value,
          {
            stream: true,
          },
        );

      let newlineIndex =
        buffer.indexOf(
          "\n",
        );

      while (
        newlineIndex >= 0
      ) {
        const raw =
          buffer.slice(
            0,
            newlineIndex,
          );

        buffer =
          buffer.slice(
            newlineIndex + 1,
          );

        const line =
          raw.endsWith(
            "\r",
          )
            ? raw.slice(
                0,
                -1,
              )
            : raw;

        if (
          line.trim().length >
          0
        ) {
          yield line;
        }

        newlineIndex =
          buffer.indexOf(
            "\n",
          );
      }
    }

    buffer +=
      decoder.decode();

    const finalLine =
      buffer.endsWith(
        "\r",
      )
        ? buffer.slice(
            0,
            -1,
          )
        : buffer;

    if (
      finalLine.trim()
        .length > 0
    ) {
      yield finalLine;
    }
  } finally {
    reader.releaseLock();
  }
}

async function countRecords(
  file: File,
): Promise<number> {
  let count = 0;

  for await (
    const _line of
    readNonBlankLines(
      file,
    )
  ) {
    count += 1;
  }

  return count;
}

async function readStatus(
  sourceId: string,
  batchExternalKey: string,
  sourceNamespace: string,
): Promise<
  BatchStatusResult | null
> {
  const params =
    new URLSearchParams({
      sourceId,
      batchExternalKey,
      sourceNamespace,
    });

  const response =
    await fetch(
      `/api/universal-library/bulk-import/ui/batches/status?${params.toString()}`,
      {
        cache:
          "no-store",
      },
    );

  if (
    response.status ===
    404
  ) {
    return null;
  }

  const body =
    await response.json();

  if (!response.ok) {
    throw new Error(
      body?.error
        ?.message ||
        "Failed to inspect existing batch status.",
    );
  }

  return (
    body.data ??
    body
  ) as BatchStatusResult;
}

export default function UniversalLibraryBulkImportExecutionControl({
  selectedFile,
  batchExternalKey,
  sourceNamespace,
  onImportFinished,
}: Props) {
  const [
    sourceId,
    setSourceId,
  ] = useState(
    DEFAULT_DATA_FACTORY_SOURCE_ID,
  );

  const [
    phase,
    setPhase,
  ] = useState<Phase>(
    "IDLE",
  );

  const [
    totalRecords,
    setTotalRecords,
  ] = useState(0);

  const [
    totalChunks,
    setTotalChunks,
  ] = useState(0);

  const [
    processedChunks,
    setProcessedChunks,
  ] = useState(0);

  const [
    successfulChunks,
    setSuccessfulChunks,
  ] = useState(0);

  const [
    failedChunks,
    setFailedChunks,
  ] = useState<
    number[]
  >([]);

  const [
    message,
    setMessage,
  ] = useState<
    string | null
  >(null);

  const busy =
    phase ===
      "SCANNING" ||
    phase ===
      "UPLOADING";

  const canStart =
    Boolean(
      selectedFile &&
      sourceId.trim() &&
      batchExternalKey.trim() &&
      sourceNamespace.trim() &&
      !busy,
    );

  const handleStart =
    async () => {
      if (
        !selectedFile ||
        !canStart
      ) {
        return;
      }

      const cleanSourceId =
        sourceId.trim();

      const cleanBatchKey =
        batchExternalKey.trim();

      const cleanNamespace =
        sourceNamespace.trim();

      setMessage(null);
      setFailedChunks([]);
      setProcessedChunks(0);
      setSuccessfulChunks(0);
      setTotalRecords(0);
      setTotalChunks(0);

      try {
        setPhase(
          "SCANNING",
        );

        const recordCount =
          await countRecords(
            selectedFile,
          );

        if (
          recordCount < 1
        ) {
          throw new Error(
            "The selected JSONL file contains no records.",
          );
        }

        const chunkCount =
          Math.ceil(
            recordCount /
              RECORDS_PER_CHUNK,
          );

        setTotalRecords(
          recordCount,
        );

        setTotalChunks(
          chunkCount,
        );

        const existing =
          await readStatus(
            cleanSourceId,
            cleanBatchKey,
            cleanNamespace,
          );

        let targetIndexes:
          Set<number>;

        if (existing) {
          if (
            existing.expectedChunks !==
            chunkCount
          ) {
            throw new Error(
              `Existing batch expects ${existing.expectedChunks} chunks, but this file produces ${chunkCount}. Use the original file or a new batch key.`,
            );
          }

          if (
            existing.overallStatus ===
              "COMPLETED" &&
            existing.retryChunkIndexes
              .length === 0
          ) {
            setPhase(
              "COMPLETED",
            );

            setProcessedChunks(
              chunkCount,
            );

            setSuccessfulChunks(
              chunkCount,
            );

            setMessage(
              "This logical batch is already complete. No chunks were replayed.",
            );

            onImportFinished();

            return;
          }

          if (
            existing.overallStatus ===
              "IN_PROGRESS"
          ) {
            throw new Error(
              "This logical batch already has active chunks. Refresh its status before starting another upload.",
            );
          }

          targetIndexes =
            new Set(
              existing.retryChunkIndexes,
            );

          if (
            targetIndexes.size ===
            0
          ) {
            throw new Error(
              "The existing batch has no retryable or missing chunks.",
            );
          }

          setMessage(
            `Resume mode: ${targetIndexes.size} failed, partial, or missing chunks will be uploaded.`,
          );
        } else {
          targetIndexes =
            new Set(
              Array.from(
                {
                  length:
                    chunkCount,
                },
                (
                  _,
                  index,
                ) =>
                  index + 1,
              ),
            );

          setMessage(
            `New logical batch: ${chunkCount} internal chunks will be processed.`,
          );
        }

        setPhase(
          "UPLOADING",
        );

        let chunkIndex = 0;

        let currentLines:
          string[] = [];

        let processed =
          0;

        let succeeded =
          0;

        const failures:
          number[] = [];

        const uploadChunk =
          async (
            index: number,
            lines: string[],
          ) => {
            if (
              !targetIndexes.has(
                index,
              )
            ) {
              return;
            }

            const payload =
              `${lines.join(
                "\n",
              )}\n`;

            try {
              const response =
                await fetch(
                  "/api/universal-library/bulk-import/ui/chunk",
                  {
                    method:
                      "POST",

                    headers: {
                      "content-type":
                        "application/x-ndjson",

                      "x-voka-source-id":
                        cleanSourceId,

                      "x-voka-file-name":
                        selectedFile.name,

                      "x-voka-batch-external-key":
                        cleanBatchKey,

                      "x-voka-source-namespace":
                        cleanNamespace,

                      "x-voka-chunk-index":
                        String(
                          index,
                        ),

                      "x-voka-chunk-count":
                        String(
                          chunkCount,
                        ),
                    },

                    body:
                      payload,
                  },
                );

              const body =
                await response.json();

              if (
                !response.ok
              ) {
                throw new Error(
                  body?.error
                    ?.message ||
                    `Chunk ${index} failed.`,
                );
              }

              if (
                (
                  body.data ??
                  body
                )?.summary
                  ?.publishedRecords !==
                0
              ) {
                throw new Error(
                  `Chunk ${index} violated zero-publication safety.`,
                );
              }

              succeeded +=
                1;
            } catch {
              failures.push(
                index,
              );
            } finally {
              processed +=
                1;

              setProcessedChunks(
                processed,
              );

              setSuccessfulChunks(
                succeeded,
              );

              setFailedChunks(
                [...failures],
              );
            }
          };

        for await (
          const line of
          readNonBlankLines(
            selectedFile,
          )
        ) {
          currentLines.push(
            line,
          );

          if (
            currentLines.length >=
            RECORDS_PER_CHUNK
          ) {
            chunkIndex += 1;

            await uploadChunk(
              chunkIndex,
              currentLines,
            );

            currentLines =
              [];
          }
        }

        if (
          currentLines.length >
          0
        ) {
          chunkIndex += 1;

          await uploadChunk(
            chunkIndex,
            currentLines,
          );
        }

        const finalStatus =
          await readStatus(
            cleanSourceId,
            cleanBatchKey,
            cleanNamespace,
          );

        if (
          !finalStatus
        ) {
          throw new Error(
            "The batch finished uploading but no durable batch status could be found.",
          );
        }

        if (
          finalStatus.overallStatus ===
          "COMPLETED"
        ) {
          setPhase(
            "COMPLETED",
          );

          setMessage(
            `Import completed. ${finalStatus.completedChunks}/${finalStatus.expectedChunks} chunks are durable.`,
          );
        } else {
          setPhase(
            "NEEDS_ATTENTION",
          );

          setFailedChunks(
            finalStatus.retryChunkIndexes,
          );

          setMessage(
            `Import stopped with ${finalStatus.retryChunkIndexes.length} retryable or missing chunks. Re-select the same file and Start Import to resume only those chunks.`,
          );
        }

        onImportFinished();
      } catch (error) {
        setPhase(
          "FAILED",
        );

        setMessage(
          error instanceof Error
            ? error.message
            : "Bulk import failed.",
        );

        onImportFinished();
      }
    };

  const progress =
    totalChunks > 0
      ? Math.round(
          (
            processedChunks /
            totalChunks
          ) * 100,
        )
      : 0;

  return (
    <div className="mt-5 rounded-xl border border-[#222a45] bg-[#080e1c] p-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(260px,1fr)_minmax(0,2fr)_auto] lg:items-end">
        <div>
          <label
            htmlFor="bulk-source-id"
            className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500"
          >
            Universal Source ID
          </label>

          <input
            id="bulk-source-id"
            value={
              sourceId
            }
            disabled={
              busy
            }
            onChange={(
              event,
            ) =>
              setSourceId(
                event.target
                  .value,
              )
            }
            className="h-10 w-full rounded-lg border border-[#313a5a] bg-[#0b1224] px-3 font-mono text-xs text-slate-200 outline-none focus:border-indigo-400 disabled:opacity-60"
          />
        </div>

        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Upload Execution
          </div>

          <div className="mt-1 text-sm text-slate-300">
            {phase ===
            "IDLE"
              ? "Ready for bounded, resumable staging. The browser never receives the operational secret."
              : phase ===
                  "SCANNING"
                ? "Scanning JSONL records and calculating internal chunks..."
                : phase ===
                    "UPLOADING"
                  ? `Processing chunk progress: ${processedChunks}/${totalChunks}`
                  : message ||
                    "Import execution finished."}
          </div>
        </div>

        <button
          type="button"
          disabled={
            !canStart
          }
          onClick={() =>
            void handleStart()
          }
          className="h-10 whitespace-nowrap rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 px-5 text-sm font-semibold text-white transition hover:from-indigo-500 hover:to-violet-500 disabled:cursor-not-allowed disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-500"
        >
          {phase ===
          "SCANNING"
            ? "Scanning..."
            : phase ===
                "UPLOADING"
              ? "Importing..."
              : phase ===
                  "NEEDS_ATTENTION"
                ? "Resume Import"
                : "Start Import"}
        </button>
      </div>

      {totalRecords >
      0 ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-lg border border-[#222a45] bg-[#0b1224] px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">
              Records
            </div>
            <div className="mt-1 text-sm font-semibold text-white">
              {totalRecords.toLocaleString()}
            </div>
          </div>

          <div className="rounded-lg border border-[#222a45] bg-[#0b1224] px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">
              Internal Chunks
            </div>
            <div className="mt-1 text-sm font-semibold text-white">
              {totalChunks.toLocaleString()}
            </div>
          </div>

          <div className="rounded-lg border border-[#222a45] bg-[#0b1224] px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">
              Processed
            </div>
            <div className="mt-1 text-sm font-semibold text-indigo-300">
              {processedChunks.toLocaleString()}
            </div>
          </div>

          <div className="rounded-lg border border-[#222a45] bg-[#0b1224] px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">
              Successful
            </div>
            <div className="mt-1 text-sm font-semibold text-emerald-300">
              {successfulChunks.toLocaleString()}
            </div>
          </div>

          <div className="rounded-lg border border-[#222a45] bg-[#0b1224] px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">
              Retry Required
            </div>
            <div className="mt-1 text-sm font-semibold text-amber-300">
              {failedChunks.length.toLocaleString()}
            </div>
          </div>
        </div>
      ) : null}

      {totalChunks >
      0 ? (
        <div className="mt-4">
          <div className="flex items-center justify-between text-[11px] text-slate-500">
            <span>
              Logical batch progress
            </span>
            <span>
              {progress}%
            </span>
          </div>

          <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#1b2340]">
            <div
              className="h-full rounded-full bg-indigo-500 transition-all"
              style={{
                width: `${Math.min(
                  progress,
                  100,
                )}%`,
              }}
            />
          </div>
        </div>
      ) : null}

      {message &&
      phase !==
        "UPLOADING" ? (
        <div
          className={`mt-4 rounded-lg border px-3 py-2 text-xs ${
            phase ===
            "COMPLETED"
              ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-300"
              : phase ===
                    "NEEDS_ATTENTION"
                  ? "border-amber-400/30 bg-amber-500/10 text-amber-300"
                  : phase ===
                      "FAILED"
                    ? "border-red-400/30 bg-red-500/10 text-red-300"
                    : "border-indigo-400/30 bg-indigo-500/10 text-indigo-300"
          }`}
        >
          {message}

          {failedChunks.length >
          0 ? (
            <div className="mt-1 font-mono">
              Retry chunks:{" "}
              {failedChunks.join(
                ", ",
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
