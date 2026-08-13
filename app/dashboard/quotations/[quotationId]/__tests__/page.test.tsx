// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { createElement } from "react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import QuotationDetailsPage from "../page";

let isArabic = false;

vi.mock("@/components/i18n/LanguageProvider", () => ({
  useLanguage: () => ({ isArabic }),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ quotationId: "quotation-1" }),
}));

function quotation(
  localizationStatus: "PENDING" | "COMPLETED" | "FAILED",
  status = "SENT",
) {
  return {
    id: "quotation-1",
    quotationNumber: "QT-1001",
    status,
    issueDate: "2026-08-14T00:00:00.000Z",
    expiryDate: null,
    currencyCode: "KWD",
    customer: { name: "Acme" },
    lines: [],
    totals: {
      subtotal: 0,
      discountAmount: 0,
      taxAmount: 0,
      totalAmount: 0,
    },
    localizationStatus,
  };
}

function response(data: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ data }),
  };
}

beforeEach(() => {
  isArabic = false;
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("QuotationDetailsPage localization visibility", () => {
  it.each([
    ["PENDING", "Preparing translated version"],
    ["COMPLETED", "Arabic and English versions are ready"],
    ["FAILED", "Translation failed"],
  ] as const)("renders %s status", async (status, label) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(quotation(status, "DRAFT"))));

    render(createElement(QuotationDetailsPage));

    const indicator = await screen.findByTestId("localization-status");
    expect(indicator.textContent).toContain(status);
    expect(indicator.textContent).toContain(label);
  });

  it.each([
    ["PENDING", true],
    ["FAILED", true],
    ["COMPLETED", false],
  ] as const)("keeps approval fencing for %s", async (status, disabled) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(quotation(status))));

    render(createElement(QuotationDetailsPage));

    const approve = await screen.findByRole("button", { name: "Approve" });
    expect((approve as HTMLButtonElement).disabled).toBe(disabled);
  });

  it("uses bilingual labels while preserving lifecycle API action names", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(quotation("COMPLETED", "DRAFT")))
      .mockResolvedValueOnce(response({}))
      .mockResolvedValueOnce(response(quotation("COMPLETED", "SENT")));
    vi.stubGlobal("fetch", fetchMock);

    render(createElement(QuotationDetailsPage));

    fireEvent.click(await screen.findByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/quotations/quotation-1/send",
        { method: "POST" },
      );
    });
    expect(screen.queryByRole("button", { name: "send" })).toBeNull();
  });

  it("renders Arabic lifecycle labels", async () => {
    isArabic = true;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(quotation("COMPLETED"))));

    render(createElement(QuotationDetailsPage));

    expect(await screen.findByRole("button", { name: "\u0627\u0639\u062a\u0645\u0627\u062f" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "\u0631\u0641\u0636" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "\u0625\u0644\u063a\u0627\u0621" })).toBeTruthy();
  });

  it("shows a localized valid-until date only when expiry is present", async () => {
    const withExpiry = {
      ...quotation("COMPLETED", "DRAFT"),
      expiryDate: "2026-09-15T20:59:59.999Z",
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(withExpiry)));

    render(createElement(QuotationDetailsPage));

    expect(await screen.findByText("Valid until")).toBeTruthy();
    expect(screen.getByText("15/09/2026")).toBeTruthy();

    cleanup();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      response(quotation("COMPLETED", "DRAFT")),
    ));
    render(createElement(QuotationDetailsPage));

    await screen.findByText("QT-1001");
    expect(screen.queryByText("Valid until")).toBeNull();
  });
});
