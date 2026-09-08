// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import UniversalLibraryBatchesConsole from "../UniversalLibraryBatchesConsole";
import { BATCH_WIZARD_SELECTION_KEY } from "../batchWizardSelection";

vi.mock("../UniversalLibraryBulkImportExecutionControl", () => ({ default: ({ onImportFinished }: { onImportFinished: () => void }) => <button onClick={onImportFinished}>Complete synthetic upload</button> }));
vi.mock("next/link", () => ({ default: ({ children, href }: any) => <a href={href}>{children}</a> }));
afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

it("reloads the selected batch journey after upload completes", async () => {
  localStorage.setItem(BATCH_WIZARD_SELECTION_KEY, JSON.stringify({ sourceId: "source-1", batchExternalKey: "batch-1", sourceNamespace: "synthetic" }));
  const fetchMock = vi.fn(async (url: string) => ({ ok: true, json: async () => url.includes("/journey?") ? { data: {
    overallStatus: "READY_TO_PROCESS", canProcess: true, canResumeChunks: false, canRetryFailedRecords: false,
    records: { total: 1, pending: 1, succeeded: 0, failed: 0, published: 0, rejected: 0 },
    progress: { completedChunks: 1, expectedChunks: 1, chunkPercent: 100, recordPercent: 0 }, steps: [],
  } } : { data: { items: [] } } }));
  vi.stubGlobal("fetch", fetchMock);
  render(<UniversalLibraryBatchesConsole />);
  await screen.findByText("READY TO PROCESS");
  const before = fetchMock.mock.calls.filter(([url]) => url.includes("/journey?")).length;
  fireEvent.click(screen.getByRole("button", { name: "Upload Bulk File" }));
  fireEvent.click(screen.getByText("Complete synthetic upload"));
  await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => url.includes("/journey?")).length).toBe(before + 1));
  expect(JSON.parse(localStorage.getItem(BATCH_WIZARD_SELECTION_KEY)!)).toMatchObject({ sourceId: "source-1", batchExternalKey: "batch-1" });
});
