// @vitest-environment jsdom

import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import PopulationObservabilityPage from "../page";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("PopulationObservabilityPage", () => {
  it("renders page title and initial form inputs", () => {
    render(createElement(PopulationObservabilityPage));

    expect(
      screen.getByText("Governed Universal Library Population Engine")
    ).toBeTruthy();
    expect(screen.getByDisplayValue("CCTV IP Surveillance System")).toBeTruthy();
    expect(screen.getByDisplayValue("Security Equipment")).toBeTruthy();
    expect(screen.getByText("Execute Bounded Population Run")).toBeTruthy();
  });

  it("submits run form and displays run summary results and evidence URLs", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          runId: "run-test-999",
          status: "COMPLETED",
          query: { prompt: "CCTV IP Surveillance System", domainHint: "Security Equipment" },
          seed: { id: "seed-1", nameEn: "Enterprise IP Video Surveillance", seedType: "SYSTEM", confidence: 0.95 },
          counts: {
            discoveredComponentsCount: 2,
            plannedWorkItemsCount: 2,
            stagedRecordsCount: 2,
            duplicateRecordsCount: 0,
            needsReviewCount: 2,
            rejectedCount: 0,
            publishedCount: 0,
          },
          evidenceUrls: ["https://www.hikvision.com/en/products/IP-Products/"],
          stagedCandidates: [
            {
              componentKey: "hikvision_4k_dome",
              nameEn: "Hikvision 4K Vandal Dome Camera",
              componentType: "PRODUCT",
              manufacturer: "Hikvision",
              modelNumber: "DS-2CD2143G0-I",
              mpn: "DS-2CD2143G0-I-4MM",
              evidenceUrl: "https://www.hikvision.com/en/products/IP-Products/",
              status: "NEEDS_REVIEW",
              ingestionRecordId: "ir-123",
              errorMessage: null,
            },
          ],
          errors: [],
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(createElement(PopulationObservabilityPage));

    const submitBtn = screen.getByText("Execute Bounded Population Run");
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText("Enterprise IP Video Surveillance")).toBeTruthy();
    });

    expect(screen.getByText(/Run ID: run-test-999/)).toBeTruthy();
    expect(screen.getAllByText("https://www.hikvision.com/en/products/IP-Products/").length).toBeGreaterThan(0);
    expect(screen.getByText("Hikvision 4K Vandal Dome Camera")).toBeTruthy();
    expect(screen.getByText("Model: DS-2CD2143G0-I")).toBeTruthy();
    expect(screen.getByText("Published (0)")).toBeTruthy();
  });
});
