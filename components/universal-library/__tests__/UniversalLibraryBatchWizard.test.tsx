// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  }) => createElement("a", { href, ...props }, children),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/universal-library/batches",
}));

import UniversalLibraryBatchWizard from "../UniversalLibraryBatchWizard";
import { BATCH_WIZARD_STEPS } from "@/features/universal-library/domain/bulk-import/BatchWizardContract";

describe("UniversalLibraryBatchWizard", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the ten operator journey steps", () => {
    render(
      <UniversalLibraryBatchWizard
        sourceId=""
        batchExternalKey=""
        sourceNamespace=""
      />,
    );

    expect(screen.getByTestId("ucl-batch-wizard")).toBeTruthy();
    expect(
      screen.getByText(/File → Upload → Batch → Process → Staging/),
    ).toBeTruthy();
    expect(screen.getByTestId("ucl-batch-wizard-idle")).toBeTruthy();

    for (const step of BATCH_WIZARD_STEPS) {
      const node = screen.getByTestId(`ucl-batch-wizard-step-${step.id}`);
      expect(node).toHaveAttribute("href", step.href);
      expect(node.textContent).toContain(step.label);
    }
  });

  it("shows truthful pending, succeeded and failed counts from durable journey state", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: {
            overallStatus: "READY_TO_PROCESS",
            canProcess: true,
            canRetryFailedRecords: true,
            canResumeChunks: true,
            retryChunkIndexes: [2],
            records: {
              total: 3,
              received: 1,
              needsReview: 1,
              published: 0,
              rejected: 0,
              failed: 1,
              awaitingProcess: 2,
              pending: 1,
              succeeded: 1,
            },
            progress: {
              expectedChunks: 2,
              completedChunks: 1,
              failedChunks: 1,
              partialChunks: 0,
              missingChunks: 0,
              chunkPercent: 50,
              pendingCount: 1,
              succeededCount: 1,
              failedCount: 1,
              publishedCount: 0,
              rejectedCount: 0,
              recordPercent: 33,
            },
            steps: BATCH_WIZARD_STEPS.map((step) => ({
              ...step,
              state: "READY",
            })),
          },
        }),
      }),
    );

    render(
      <UniversalLibraryBatchWizard
        sourceId="source-1"
        batchExternalKey="WIZARD_BATCH_001"
        sourceNamespace="VOKA_UCL_TEST"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("READY TO PROCESS")).toBeTruthy();
    });

    expect(screen.getByTestId("ucl-batch-wizard-pending").textContent).toContain("1");
    expect(screen.getByTestId("ucl-batch-wizard-succeeded").textContent).toContain("1");
    expect(screen.getByTestId("ucl-batch-wizard-failed").textContent).toContain("1");
    expect(screen.getByText(/1\/2 · 50%/)).toBeTruthy();
  });

  it("keeps process, retry, resume and persistence in the operator surface", () => {
    const source = readFileSync(
      "components/universal-library/UniversalLibraryBatchWizard.tsx",
      "utf8",
    );
    const consoleSource = readFileSync(
      "components/universal-library/UniversalLibraryBatchesConsole.tsx",
      "utf8",
    );

    expect(source).toContain("/api/universal-library/bulk-import/ui/process");
    expect(source).toContain("/api/universal-library/bulk-import/ui/journey");
    expect(source).toContain("Retry failed / process remaining");
    expect(source).toContain("Resume failed chunks");
    expect(source).toContain("Partial/failure state");
    expect(source).toContain("Nothing was published");
    expect(consoleSource).toContain("Resume");
    expect(consoleSource).toContain("Process remaining");
    expect(consoleSource).toContain("UniversalLibraryBatchWizard");
    expect(consoleSource).toContain("readBatchWizardSelection()");
    expect(consoleSource).toContain("writeBatchWizardSelection(");
  });
});
