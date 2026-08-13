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

import EditQuotationPage from "../page";

let isArabic = false;
const push = vi.fn();

vi.mock("@/components/i18n/LanguageProvider", () => ({
  useLanguage: () => ({ isArabic }),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ quotationId: "quotation-1" }),
  useRouter: () => ({ push }),
}));

const quotation = {
  id: "quotation-1",
  quotationNumber: "QT-1001",
  status: "DRAFT",
  currencyCode: "KWD",
  lines: [
    {
      id: "line-1",
      position: 1,
      type: "PRODUCT",
      itemName: "Item",
      itemNameAr: "\u0635\u0646\u0641",
      itemNameEn: "Item",
      unitName: "unit",
      unitNameAr: "\u0648\u062d\u062f\u0629",
      unitNameEn: "unit",
      quantity: 1,
      unitPrice: 10,
    },
  ],
  projectName: "Project",
  projectNameAr: "\u0645\u0634\u0631\u0648\u0639",
  projectNameEn: "Project",
  attentionName: "Attention",
  attentionNameAr: "\u0639\u0646\u0627\u064a\u0629",
  attentionNameEn: "Attention",
  subjectAr: "\u0645\u0648\u0636\u0648\u0639 \u0639\u0631\u0628\u064a",
  subjectEn: "English subject",
  briefAr: "\u0645\u0644\u062e\u0635 \u0639\u0631\u0628\u064a",
  briefEn: "English brief",
  notes: "Notes",
  notesAr: "\u0645\u0644\u0627\u062d\u0638\u0627\u062a",
  notesEn: "Notes",
  termsAndConditions: "Terms",
  termsAndConditionsAr: "\u0634\u0631\u0648\u0637",
  termsAndConditionsEn: "Terms",
  discount: null,
};

function response(data: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ data }),
  };
}

function controlFor(label: string) {
  const wrapper = screen.getByText(label).closest("label");
  const control = wrapper?.querySelector("input, textarea");

  if (!control) {
    throw new Error(`Control missing for ${label}`);
  }

  return control as HTMLInputElement | HTMLTextAreaElement;
}

beforeEach(() => {
  isArabic = false;
  push.mockReset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("EditQuotationPage active language", () => {
  it.each([
    {
      arabic: false,
      subject: "English subject",
      brief: "English brief",
      hiddenSubject: "\u0645\u0648\u0636\u0648\u0639 \u0639\u0631\u0628\u064a",
      hiddenBrief: "\u0645\u0644\u062e\u0635 \u0639\u0631\u0628\u064a",
    },
    {
      arabic: true,
      subject: "\u0645\u0648\u0636\u0648\u0639 \u0639\u0631\u0628\u064a",
      brief: "\u0645\u0644\u062e\u0635 \u0639\u0631\u0628\u064a",
      hiddenSubject: "English subject",
      hiddenBrief: "English brief",
    },
  ])("shows only the $arabic active-language subject and brief", async ({
    arabic,
    subject,
    brief,
    hiddenSubject,
    hiddenBrief,
  }) => {
    isArabic = arabic;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(quotation)));

    render(createElement(EditQuotationPage));

    expect(await screen.findByDisplayValue(subject)).toBeTruthy();
    expect(screen.getByDisplayValue(brief)).toBeTruthy();
    expect(screen.queryByDisplayValue(hiddenSubject)).toBeNull();
    expect(screen.queryByDisplayValue(hiddenBrief)).toBeNull();
  });

  it.each([
    {
      arabic: false,
      label: "Proposal subject",
      next: "Updated English",
      sourceLocale: "en",
      expected: {
        subjectAr: "\u0645\u0648\u0636\u0648\u0639 \u0639\u0631\u0628\u064a",
        subjectEn: "Updated English",
      },
    },
    {
      arabic: true,
      label: "\u0645\u0648\u0636\u0648\u0639 \u0627\u0644\u0639\u0631\u0636",
      next: "\u0645\u0648\u0636\u0648\u0639 \u0645\u062d\u062f\u062b",
      sourceLocale: "ar",
      expected: {
        subjectAr: "\u0645\u0648\u0636\u0648\u0639 \u0645\u062d\u062f\u062b",
        subjectEn: "English subject",
      },
    },
  ])("preserves the inactive language when saving", async ({
    arabic,
    label,
    next,
    sourceLocale,
    expected,
  }) => {
    isArabic = arabic;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(quotation))
      .mockResolvedValueOnce(response(quotation));
    vi.stubGlobal("fetch", fetchMock);

    render(createElement(EditQuotationPage));

    await screen.findByText(label);
    fireEvent.change(controlFor(label), { target: { value: next } });
    fireEvent.click(screen.getByRole("button", {
      name: arabic ? "\u062d\u0641\u0638 \u0627\u0644\u062a\u0639\u062f\u064a\u0644\u0627\u062a" : "Save changes",
    }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const request = fetchMock.mock.calls[1]?.[1] as RequestInit;
    const body = JSON.parse(String(request.body));

    expect(body).toMatchObject({
      localizationSourceLocale: sourceLocale,
      ...expected,
    });
  });
});
