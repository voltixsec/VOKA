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

import NewQuotationPage from "../page";
import { quotationFieldFixture, quotationPrompt, nationalCustomer } from '@/src/application/ai-sales-assistant/__tests__/quotation-field-fixture';

const push = vi.fn();
let isArabic = false;

vi.mock("@/components/i18n/LanguageProvider", () => ({
  useLanguage: () => ({ isArabic }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

function response(data: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ data }),
  };
}

function fetchForCreate() {
  return vi.fn().mockImplementation(
    (input: string, init?: RequestInit) => {
      if (input === "/api/auth/me") {
        return Promise.resolve(
          response({
            activeCompanyId: "company-1",
          }),
        );
      }

      if (input.startsWith("/api/customers")) {
        return Promise.resolve(
          response({
            customers: [
              {
                id: "customer-1",
                name: "Acme",
              },
            ],
          }),
        );
      }

      if (
        input.startsWith("/api/catalog/items") &&
        init?.method !== "POST"
      ) {
        return Promise.resolve(
          response([
            {
              id: "catalog-1",
              name: "Taxed service",
              code: "SRV-1",
              type: "SERVICE",
              salePrice: 100,
              taxRateId: "tax-10",
              unitId: "unit-pcs",
              description: "Catalog scope",
              isActive: true,
            },
          ]),
        );
      }

      if (
        input === "/api/catalog/items" &&
        init?.method === "POST"
      ) {
        return Promise.resolve(
          response({
            id: "catalog-created",
            companyId: "company-1",
            name: "Created product",
            nameEn: "Created product",
            nameAr: null,
            code: "PROD-100",
            type: "PRODUCT",
            salePrice: 25,
            purchasePrice: null,
            taxRateId: "tax-5",
            unitId: "unit-pcs",
            description: null,
            descriptionAr: null,
            descriptionEn: null,
            sku: null,
            barcode: null,
            isActive: true,
          }),
        );
      }

      if (input === "/api/units") {
        return Promise.resolve(
          response([
            {
              id: "unit-pcs",
              name: "Pieces",
              nameAr: "\u0639\u062f\u062f",
              nameEn: "Pieces",
              symbol: "PCS",
            },
          ]),
        );
      }

      if (input === "/api/tax-rates") {
        return Promise.resolve(
          response([
            {
              id: "tax-5",
              name: "VAT 5",
              percentage: 5,
              isSystem: false,
            },
            {
              id: "tax-10",
              name: "VAT 10",
              percentage: 10,
              isSystem: true,
            },
          ]),
        );
      }

      if (
        input ===
        "/api/companies/current/quotation-terms"
      ) {
        return Promise.resolve(
          response({
            templates: [],
          }),
        );
      }

      if (input === "/api/companies/current") {
        return Promise.resolve(
          response({
            defaultCurrency: "KWD",
          }),
        );
      }

      if (
        input === "/api/quotations" &&
        init?.method === "POST"
      ) {
        return Promise.resolve(
          response({
            id: "quotation-1",
          }),
        );
      }

      throw new Error(
        `Unexpected fetch: ${input}`,
      );
    },
  );
}

describe('proposed customer in the real quotation composer', () => {
  it('preserves matched HDD identity/code/count but excludes its internal allocation from the saved quotation', async () => {
    sessionStorage.setItem('voka_ai_proposal_draft', JSON.stringify({
      customer: { id: 'customer-1' }, proposal: { scopeType: 'SUPPLY_ONLY', currencyCode: 'KWD' },
      lines: [{ catalogItemId: 'real-hdd-18', itemCode: 'HDD-18', type: 'PRODUCT', itemName: 'Surveillance HDD 18TB', itemNameEn: 'Surveillance HDD 18TB', quantity: 26, unitName: 'Unit', unitPrice: 125,
        commercialRequirement: { category: 'SURVEILLANCE_STORAGE_CAPACITY', quantity: 26, unit: 'Unit', matchStatus: 'COMMERCIAL_MATCH_CONFIRMED', reviewRequired: true, source: { ruleVersion: '1.2.0' } },
        provenance: 'CALCULATED', formulaExplanation: 'ceil(467 TB / 18 TB) = 26 disks; design unverified.',
      }],
    }));
    const fetchMock = fetchForCreate();
    vi.stubGlobal('fetch', fetchMock);
    render(<NewQuotationPage />);
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Item 1' })).toHaveValue('Surveillance HDD 18TB'));
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
    fireEvent.submit(screen.getByRole('spinbutton', { name: 'Unit price 1' }).closest('form')!);
    await waitFor(() => expect(fetchMock.mock.calls.some(([url, init]) => url === '/api/quotations' && init?.method === 'POST')).toBe(true));
    expect(postBody(fetchMock).lines[0]).toMatchObject({ catalogItemId: 'real-hdd-18', itemCode: 'HDD-18', itemName: 'Surveillance HDD 18TB', quantity: 26, unitName: 'Unit', unitPrice: 125 });
    expect(JSON.stringify(postBody(fetchMock))).not.toMatch(/commercialRequirement|ruleVersion|formulaExplanation|467|design unverified/);
  });
  it.each([true, false])('shows localized units (%s) but preserves canonical unit values on save', async (arabic) => {
    isArabic = arabic;
    const units = ['Unit', 'Package', 'Roll', 'Set', 'Point', 'TB'];
    sessionStorage.setItem('voka_ai_proposal_draft', JSON.stringify({ customer: { id: 'customer-1' }, proposal: { scopeType: 'SUPPLY_ONLY', currencyCode: 'KWD' }, lines: units.map((unitName) => ({ itemName: 'NVR', unitName, unitNameAr: unitName, unitNameEn: unitName, quantity: 1, unitPrice: 10 })) }));
    const fetchMock = fetchForCreate();
    vi.stubGlobal('fetch', fetchMock);
    render(<NewQuotationPage />);
    await screen.findByRole('spinbutton', { name: arabic ? 'سعر الوحدة 6' : 'Unit price 6' });
    const expected = arabic ? ['وحدة', 'حزمة', 'بكرة', 'طقم', 'نقطة', 'TB'] : units;
    expected.forEach((label, i) => expect(screen.getByRole('textbox', { name: `${arabic ? 'الوحدة' : 'Unit'} ${i + 1}` })).toHaveValue(label));
    fireEvent.submit(screen.getByRole('spinbutton', { name: arabic ? 'سعر الوحدة 1' : 'Unit price 1' }).closest('form')!);
    await waitFor(() => expect(fetchMock.mock.calls.some(([url, init]) => url === '/api/quotations' && init?.method === 'POST')).toBe(true));
    expect(postBody(fetchMock).lines.map((line: { unitName: string }) => line.unitName)).toEqual(units);
  });

  it.each(['resolved', 'proposed'] as const)('receives the same %s customer and owned fields after four real clarification turns', async (state) => {
    isArabic = true;
    const { run } = quotationFieldFixture({ names: state === 'proposed' ? [] : [nationalCustomer] });
    let draft = await run(quotationPrompt);
    draft = await run('مصنع الشويخ', draft);
    draft = await run('المهندس خالد', draft, { replySource: 'VOICE' });
    draft = await run('خمستاشر يوم', draft, { replySource: 'VOICE' });
    draft = await run('ملاحظة: التواصل قبل التسليم', draft);
    expect(draft.status).toBe('READY_FOR_REVIEW');
    sessionStorage.setItem('voka_ai_proposal_draft', JSON.stringify(draft.canonicalProposal));
    const fallback = fetchForCreate();
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => url.startsWith('/api/customers') ? Promise.resolve(response({ customers: [{ id: 'customer-1', name: nationalCustomer }] })) : fallback(url, init));
    vi.stubGlobal('fetch', fetchMock);
    render(<NewQuotationPage />);
    await screen.findByDisplayValue('مصنع الشويخ');
    expect(screen.getByDisplayValue('المهندس خالد')).toBeTruthy();
    expect(screen.getByDisplayValue(draft.canonicalProposal!.proposal.expiryDate!)).toBeTruthy();
    expect(screen.getByDisplayValue(draft.canonicalProposal!.proposal.subject)).toBeTruthy();
    expect(screen.getByDisplayValue('التواصل قبل التسليم')).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'الشروط والأحكام' })).toHaveValue(draft.canonicalProposal!.termsAndConditions!);
    expect(screen.getByRole('note')).toHaveTextContent('الحسابات الهندسية');
    expect(screen.queryAllByText(nationalCustomer).length + screen.queryAllByDisplayValue(nationalCustomer).length).toBeGreaterThan(0);
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
  });

  it('hydrates and submits commercial rows only; engineering capacity remains in internal review', async () => {
    sessionStorage.setItem('voka_ai_proposal_draft', JSON.stringify({
      customer: { id: 'customer-1' }, estimateNotice: true,
      proposal: { subjectEn: 'Storage supply', scopeType: 'SUPPLY_ONLY', currencyCode: 'KWD' },
      smartSystem: { requirements: [{ componentKey: 'SURVEILLANCE_STORAGE_CAPACITY', name: 'Required storage capacity', nameEn: 'Required storage capacity', nameAr: 'سعة التخزين المطلوبة', quantity: 337, unit: 'TB', provenance: 'CALCULATED', formulaExplanation: 'Internal storage formula: 337 TB', formulaExplanationAr: 'حساب داخلي للسعة المطلوبة' }] },
      lines: [{ itemName: 'Surveillance storage supply package', itemNameEn: 'Surveillance storage supply package', itemNameAr: 'حزمة توريد وحدات تخزين المراقبة', type: 'CUSTOM', quantity: 1, unitName: 'Package', unitNameEn: 'Package', unitNameAr: 'حزمة', unitPrice: null, catalogItemId: null, commercializationPending: true, provenance: 'SUGGESTED', formulaExplanation: 'Disk selection and price require review.' }],
    }));
    const fetchMock = fetchForCreate();
    vi.stubGlobal('fetch', fetchMock);
    render(<NewQuotationPage />);
    await screen.findByText('Internal storage formula: 337 TB');
    expect(screen.getByRole('combobox', { name: 'Item 1' })).toHaveValue('Surveillance storage supply package');
    expect(fetchMock.mock.calls.some(([url, init]) => url === '/api/quotations' && init?.method === 'POST')).toBe(false);
    expect(screen.getByRole('spinbutton', { name: 'Unit price 1' })).toHaveValue(null);
    expect(screen.getByRole('button', { name: 'Create proposal' })).toBeDisabled();
    expect(screen.getByText('Enter unresolved item prices to calculate totals and save the quotation.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Create proposal' }));
    expect(fetchMock.mock.calls.some(([url, init]) => url === '/api/quotations' && init?.method === 'POST')).toBe(false);
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Unit price 1' }), { target: { value: '120' } });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Unit price 1' }), { target: { value: '' } });
    expect(screen.getByRole('button', { name: 'Create proposal' })).toBeDisabled();
    // An explicitly entered zero is distinct from a missing price.
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Unit price 1' }), { target: { value: '0' } });
    expect(screen.getByRole('button', { name: 'Create proposal' })).not.toBeDisabled();
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Unit price 1' }), { target: { value: '120' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create proposal' }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([url, init]) => url === '/api/quotations' && init?.method === 'POST')).toBe(true));
    const body = postBody(fetchMock);
    expect(body.lines).toHaveLength(1);
    expect(body.lines[0]).toMatchObject({ itemName: 'Surveillance storage supply package', quantity: 1, unitName: 'Package' });
    expect(JSON.stringify(body)).not.toMatch(/337|Required storage|Internal storage formula|formulaExplanation|requirements/);
    expect(body.lines[0].catalogItemId).toBeFalsy();
    expect(body.lines[0].unitPrice).toBe(120);
    expect(body.notes).toBe('');
    expect(body.termsAndConditions).toBe('');
    expect(screen.getByRole('note')).toHaveTextContent('engineering calculations are approximate');
  });

  it.each(['Create', 'Create and edit'])('%s binds in place and preserves edited commercial data', async (action) => {
    sessionStorage.setItem('voka_ai_proposal_draft', JSON.stringify({
      customer: { id: null, proposedCustomerName: 'Horizon' }, estimateNotice: true,
      proposal: { projectName: 'Factory', attentionName: 'Engineer Khaled', expiryDate: '2030-09-27', subjectEn: 'CCTV system', briefEn: 'Supply and install', scopeType: 'SUPPLY_AND_INSTALLATION', currencyCode: 'KWD' },
      lines: [{ itemName: 'IP (commercial)', itemNameAr: 'كاميرا IP تجارية', itemNameEn: 'Commercial IP camera', quantity: 36, unitPrice: 10, quantitySource: 'RULE_CALCULATED', formulaExplanation: '36 requested cameras', formulaExplanationAr: '٣٦ كاميرا حسب الطلب', priceSource: 'AI_ESTIMATED' }],
    }));
    const fallback = fetchForCreate();
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => url === '/api/customers' && init?.method === 'POST'
      ? Promise.resolve(response({ customer: { id: 'created-customer', name: 'Horizon' } })) : fallback(url, init));
    vi.stubGlobal('fetch', fetchMock);
    render(<NewQuotationPage />);
    await screen.findByText('Unregistered');
    expect(screen.getByRole('button', { name: 'Create proposal' })).toBeDisabled();
    expect(inputFor('Project name').value).toBe('Factory');
    expect(screen.getByDisplayValue('Engineer Khaled')).toBeTruthy();
    expect(screen.getByDisplayValue('2030-09-27')).toBeTruthy();
    expect((screen.getByRole('combobox', { name: 'Item 1' }) as HTMLInputElement).value).toBe('Commercial IP camera');
    fireEvent.change(inputFor('Project name'), { target: { value: 'CEO edited factory' } });
    fireEvent.change(inputFor('Proposal subject'), { target: { value: 'CEO edited subject' } });
    fireEvent.click(screen.getByRole('button', { name: action }));
    if (action === 'Create and edit') {
      expect(screen.getByRole('dialog')).toBeTruthy();
      expect(screen.getByDisplayValue('Horizon')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Create and continue' }));
    }
    await waitFor(() => expect(screen.queryByText('Unregistered')).toBeNull());
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(inputFor('Project name').value).toBe('CEO edited factory');
    expect(inputFor('Proposal subject').value).toBe('CEO edited subject');
    expect(screen.getByRole('combobox', { name: 'Item 1' })).toHaveValue('Commercial IP camera');
    expect(screen.getByText('36 requested cameras')).toBeTruthy();
    expect(fetchMock.mock.calls.filter(([url, init]) => url === '/api/quotations' && init?.method === 'POST')).toHaveLength(0);
    const creation = fetchMock.mock.calls.find(([url, init]) => url === '/api/customers' && init?.method === 'POST')!;
    expect(JSON.parse(creation[1].body)).toMatchObject({ nameEn: 'Horizon', checkDuplicates: true });
    fireEvent.click(screen.getByRole('button', { name: 'Create proposal' }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([url, init]) => url === '/api/quotations' && init?.method === 'POST')).toBe(true));
    const saved = JSON.parse(fetchMock.mock.calls.find(([url, init]) => url === '/api/quotations' && init?.method === 'POST')![1].body);
    expect(saved).toMatchObject({ customerId: 'created-customer', projectName: 'CEO edited factory', attentionName: 'Engineer Khaled', subjectEn: 'CEO edited subject', lines: [{ quantity: 36, unitPrice: 10 }] });
    expect(saved.expiryDate).toContain('2030-09-27');
    expect(push).toHaveBeenCalledWith('/dashboard/quotations/quotation-1');
  });
});

describe('approved default terms replacement', () => {
  const templates = [
    { scopeType: 'SUPPLY_ONLY', termsAr: 'شروط الدفع: نقداً\nمدة التوريد: 14 يوم', termsEn: 'Payment: cash\nDelivery: 14 days' },
    { scopeType: 'SUPPLY_AND_INSTALLATION', termsAr: 'شروط الدفع: 50% مقدم\nالضمان: سنة', termsEn: 'Payment: 50% advance\nWarranty: 1 year' },
  ];
  const termsInput = () => screen.getByRole('textbox', { name: isArabic ? 'الشروط والأحكام' : 'Terms and conditions' }) as HTMLTextAreaElement;
  const replaceButton = () => screen.getByRole('button', { name: isArabic ? 'استبدال بالشروط الافتراضية' : 'Replace with default terms' });
  const scopeInput = () => selectFor(isArabic ? 'نوع نطاق العمل' : 'Scope type');

  it.each([true, false])('exactly replaces custom and empty terms and uses the latest selected scope (%s)', async (arabic) => {
    isArabic = arabic;
    const fallback = fetchForCreate();
    let requests = 0;
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/api/companies/current/quotation-terms') {
        requests++;
        return Promise.resolve(response({ templates: requests === 1 ? [] : templates }));
      }
      return fallback(url, init);
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<NewQuotationPage />);
    await screen.findByText(arabic ? 'نوع نطاق العمل' : 'Scope type');
    fireEvent.change(scopeInput(), { target: { value: 'SUPPLY_ONLY' } });
    fireEvent.change(termsInput(), { target: { value: 'Custom stale terms that must disappear' } });
    fireEvent.click(replaceButton());
    const expected = arabic ? templates[0].termsAr : templates[0].termsEn;
    await waitFor(() => expect(termsInput()).toHaveValue(expected));
    fireEvent.change(termsInput(), { target: { value: '' } });
    fireEvent.click(replaceButton());
    await waitFor(() => expect(termsInput()).toHaveValue(expected));
    fireEvent.change(scopeInput(), { target: { value: 'SUPPLY_AND_INSTALLATION' } });
    fireEvent.click(replaceButton());
    await waitFor(() => expect(termsInput()).toHaveValue(arabic ? templates[1].termsAr : templates[1].termsEn));
    expect(termsInput().value).not.toMatch(/Custom|14/);
    expect(requests).toBe(4);
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('ignores a late template for an old scope and preserves current terms on failure/missing defaults', async () => {
    const fallback = fetchForCreate();
    let finish: (value: unknown) => void = () => undefined;
    let requests = 0;
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url !== '/api/companies/current/quotation-terms') return fallback(url, init);
      requests++;
      if (requests === 2) return new Promise((resolve) => { finish = resolve; });
      if (requests === 3) return Promise.resolve({ ok: false });
      return Promise.resolve(response({ templates: [] }));
    }));
    render(<NewQuotationPage />);
    await screen.findByText('Scope type');
    fireEvent.change(scopeInput(), { target: { value: 'SUPPLY_ONLY' } });
    fireEvent.change(termsInput(), { target: { value: 'Keep this text' } });
    fireEvent.click(replaceButton());
    fireEvent.change(scopeInput(), { target: { value: 'SUPPLY_AND_INSTALLATION' } });
    finish(response({ templates }));
    await waitFor(() => expect(replaceButton()).not.toBeDisabled());
    expect(termsInput()).toHaveValue('Keep this text');
    fireEvent.click(replaceButton());
    await screen.findByText('Could not load approved terms. Current text was kept; please retry.');
    expect(termsInput()).toHaveValue('Keep this text');
    fireEvent.click(replaceButton());
    await screen.findByText('No approved default terms for this scope and language. Current text was kept.');
    expect(termsInput()).toHaveValue('Keep this text');
  });
});

function selectFor(
  label: string,
): HTMLSelectElement {
  const select = screen
    .getByText(label)
    .closest("label")
    ?.querySelector("select");

  if (!select) {
    throw new Error(
      `Select missing for ${label}`,
    );
  }

  return select;
}

function inputFor(
  label: string,
): HTMLInputElement {
  const input = screen
    .getByText(label)
    .closest("label")
    ?.querySelector("input");

  if (!input) {
    throw new Error(
      `Input missing for ${label}`,
    );
  }

  return input;
}

function postBody(
  fetchMock: ReturnType<typeof vi.fn>,
) {
  const call =
    fetchMock.mock.calls.find(
      ([input, init]) =>
        input === "/api/quotations" &&
        init?.method === "POST",
    );

  if (!call) {
    throw new Error(
      "POST request missing",
    );
  }

  return JSON.parse(
    String(call[1]?.body),
  );
}

async function chooseCustomer() {
  const search = await screen.findByRole("textbox", { name: "Customer search" });
  fireEvent.focus(search);
  fireEvent.click(await screen.findByRole("button", { name: "Acme" }));
}

async function quickCreateLine(
  value: string,
  index = 1,
) {
  const item = await screen.findByRole(
    "combobox",
    {
      name: `Item ${index}`,
    },
  );

  fireEvent.focus(item);

  fireEvent.change(item, {
    target: {
      value,
    },
  });

  const createButton =
    await screen.findByRole(
      "button",
      {
        name: `Create "${value}"`,
      },
    );

  fireEvent.click(createButton);

  return item as HTMLInputElement;
}

async function selectCatalogItem(
  index = 1,
) {
  const item = await screen.findByRole(
    "combobox",
    {
      name: `Item ${index}`,
    },
  );

  fireEvent.focus(item);

  const option =
    await screen.findByRole(
      "button",
      {
        name: /Taxed service/,
      },
    );

  fireEvent.click(option);

  return item as HTMLInputElement;
}

beforeEach(() => {
  isArabic = false;
  sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  push.mockReset();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe(
  "NewQuotationPage dense composer",
  () => {
    it(
      "starts with one blank quotation row",
      async () => {
        vi.stubGlobal(
          "fetch",
          fetchForCreate(),
        );

        render(
          createElement(
            NewQuotationPage,
          ),
        );

        await screen.findByText(
          "Quotation information",
        );

        const item =
          await screen.findByRole(
            "combobox",
            {
              name: "Item 1",
            },
          );

        expect(
          (
            item as HTMLInputElement
          ).value,
        ).toBe("");

        expect(
          screen.getByRole(
            "button",
            {
              name: "Add",
            },
          ),
        ).toBeTruthy();
      },
    );

    it.each([
      [
        "2026-09-15",
        "2026-09-15T23:59:59.999+03:00",
      ],
      ["", undefined],
    ] as const)(
      "submits optional expiry %s",
      async (
        selected,
        expected,
      ) => {
        const fetchMock =
          fetchForCreate();

        vi.stubGlobal(
          "fetch",
          fetchMock,
        );

        render(
          createElement(
            NewQuotationPage,
          ),
        );

        await screen.findByText(
          "Quotation information",
        );

        await chooseCustomer();

        await quickCreateLine(
          "Custom line",
        );

        if (selected) {
          fireEvent.change(
            inputFor(
              "Quotation expiry date",
            ),
            {
              target: {
                value: selected,
              },
            },
          );
        }

        fireEvent.click(
          screen.getByRole(
            "button",
            {
              name: "Create proposal",
            },
          ),
        );

        await waitFor(() =>
          expect(
            fetchMock.mock.calls.some(
              ([input, init]) =>
                input ===
                  "/api/quotations" &&
                init?.method ===
                  "POST",
            ),
          ).toBe(true),
        );

        const body =
          postBody(fetchMock);

        if (
          expected === undefined
        ) {
          expect(
            body,
          ).not.toHaveProperty(
            "expiryDate",
          );
        } else {
          expect(
            body.expiryDate,
          ).toBe(expected);
        }
      },
    );

    it(
      "quick Create makes a custom line with default PCS and no tax",
      async () => {
        const fetchMock =
          fetchForCreate();

        vi.stubGlobal(
          "fetch",
          fetchMock,
        );

        render(
          createElement(
            NewQuotationPage,
          ),
        );

        await screen.findByText(
          "Quotation information",
        );

        await chooseCustomer();

        const item =
          await quickCreateLine(
            "Custom service",
          );

        expect(
          item.value,
        ).toBe("Custom service");

        expect(
          (
            screen.getByRole(
              "textbox",
              {
                name: "Unit 1",
              },
            ) as HTMLInputElement
          ).value,
        ).toBe("PCS");

        fireEvent.click(
          screen.getByRole(
            "button",
            {
              name: "Create proposal",
            },
          ),
        );

        await waitFor(() =>
          expect(
            fetchMock.mock.calls.some(
              ([input, init]) =>
                input ===
                  "/api/quotations" &&
                init?.method ===
                  "POST",
            ),
          ).toBe(true),
        );

        const body =
          postBody(fetchMock);

        expect(
          body.lines[0],
        ).toMatchObject({
          catalogItemId: null,
          type: "CUSTOM",
          itemName:
            "Custom service",
          unitName: "PCS",
          taxRateId: null,
          taxPercentage: 0,
        });
      },
    );

    it(
      "selecting a catalog item inherits unit price and tax",
      async () => {
        const fetchMock =
          fetchForCreate();

        vi.stubGlobal(
          "fetch",
          fetchMock,
        );

        render(
          createElement(
            NewQuotationPage,
          ),
        );

        await screen.findByText(
          "Quotation information",
        );

        await chooseCustomer();

        const item =
          await selectCatalogItem();

        expect(
          item.value,
        ).toBe("Taxed service");

        expect(
          (
            screen.getByRole(
              "textbox",
              {
                name: "Unit 1",
              },
            ) as HTMLInputElement
          ).value,
        ).toBe("Pieces (PCS)");

        const unitPrice =
          screen.getByRole(
            "spinbutton",
            {
              name: "Unit price 1",
            },
          ) as HTMLInputElement;

        expect(
          Number(
            unitPrice.value,
          ),
        ).toBe(100);

        expect(
          screen.getAllByText(
            "10.000 KWD",
          ).length,
        ).toBeGreaterThanOrEqual(1);

        expect(
          screen.getByText(
            "110.000 KWD",
          ),
        ).toBeTruthy();

        fireEvent.click(
          screen.getByRole(
            "button",
            {
              name: "Create proposal",
            },
          ),
        );

        await waitFor(() =>
          expect(
            fetchMock.mock.calls.some(
              ([input, init]) =>
                input ===
                  "/api/quotations" &&
                init?.method ===
                  "POST",
            ),
          ).toBe(true),
        );

        const body =
          postBody(fetchMock);

        expect(
          body.lines[0],
        ).toMatchObject({
          catalogItemId:
            "catalog-1",
          taxRateId: "tax-10",
          taxPercentage: 10,
          unitPrice: 100,
        });
      },
    );

    it(
      "Add appends and focuses a new blank Item row",
      async () => {
        vi.stubGlobal(
          "fetch",
          fetchForCreate(),
        );

        render(
          createElement(
            NewQuotationPage,
          ),
        );

        await screen.findByText(
          "Quotation information",
        );

        await quickCreateLine(
          "First line",
        );

        fireEvent.click(
          screen.getByRole(
            "button",
            {
              name: "Add",
            },
          ),
        );

        const nextItem =
          await screen.findByRole(
            "combobox",
            {
              name: "Item 2",
            },
          );

        expect(
          (
            nextItem as HTMLInputElement
          ).value,
        ).toBe("");

        await waitFor(() => {
          expect(
            document.activeElement,
          ).toBe(nextItem);
        });
      },
    );

    it(
      "drops an unavailable catalog tax from totals and submission",
      async () => {
        const fetchMock = vi
          .fn()
          .mockImplementation(
            (
              input: string,
              init?: RequestInit,
            ) => {
              if (
                input ===
                "/api/auth/me"
              ) {
                return Promise.resolve(
                  response({
                    activeCompanyId:
                      "company-1",
                  }),
                );
              }

              if (
                input.startsWith(
                  "/api/customers",
                )
              ) {
                return Promise.resolve(
                  response({
                    customers: [
                      {
                        id:
                          "customer-1",
                        name:
                          "Acme",
                      },
                    ],
                  }),
                );
              }

              if (
                input.startsWith(
                  "/api/catalog/items",
                )
              ) {
                return Promise.resolve(
                  response([
                    {
                      id:
                        "catalog-1",
                      name:
                        "Taxed service",
                      code:
                        "SRV-1",
                      type:
                        "SERVICE",
                      salePrice:
                        100,
                      taxRateId:
                        "tax-inactive",
                      unitId:
                        "unit-pcs",
                      isActive:
                        true,
                    },
                  ]),
                );
              }

              if (
                input ===
                "/api/units"
              ) {
                return Promise.resolve(
                  response([
                    {
                      id:
                        "unit-pcs",
                      name:
                        "Pieces",
                      nameEn:
                        "Pieces",
                      nameAr:
                        "\u0639\u062f\u062f",
                      symbol:
                        "PCS",
                    },
                  ]),
                );
              }

              if (
                input ===
                "/api/tax-rates"
              ) {
                return Promise.resolve(
                  response([
                    {
                      id:
                        "tax-10",
                      name:
                        "VAT 10",
                      percentage:
                        10,
                      isSystem:
                        true,
                    },
                  ]),
                );
              }

              if (
                input ===
                "/api/companies/current/quotation-terms"
              ) {
                return Promise.resolve(
                  response({
                    templates: [],
                  }),
                );
              }

              if (
                input ===
                "/api/companies/current"
              ) {
                return Promise.resolve(
                  response({
                    defaultCurrency:
                      "KWD",
                  }),
                );
              }

              if (
                input ===
                  "/api/quotations" &&
                init?.method ===
                  "POST"
              ) {
                return Promise.resolve(
                  response({
                    id:
                      "quotation-1",
                  }),
                );
              }

              throw new Error(
                `Unexpected fetch: ${input}`,
              );
            },
          );

        vi.stubGlobal(
          "fetch",
          fetchMock,
        );

        render(
          createElement(
            NewQuotationPage,
          ),
        );

        await screen.findByText(
          "Quotation information",
        );

        await chooseCustomer();

        await selectCatalogItem();

        expect(
          screen.queryByText(
            "10.000 KWD",
          ),
        ).toBeNull();

        expect(
          screen.getAllByText(
            "100.000 KWD",
          ).length,
        ).toBeGreaterThanOrEqual(1);

        fireEvent.click(
          screen.getByRole(
            "button",
            {
              name: "Create proposal",
            },
          ),
        );

        await waitFor(() =>
          expect(
            fetchMock.mock.calls.some(
              ([input, init]) =>
                input ===
                  "/api/quotations" &&
                init?.method ===
                  "POST",
            ),
          ).toBe(true),
        );

        const body =
          postBody(fetchMock);

        expect(
          body.lines[0],
        ).toMatchObject({
          taxRateId: null,
          taxPercentage: 0,
        });

        expect(
          body.lines[0],
        ).not.toHaveProperty(
          "taxUnavailable",
        );
      },
    );

    it(
      "Create & Edit saves a catalog product and returns it to the same row",
      async () => {
        const fetchMock =
          fetchForCreate();

        vi.stubGlobal(
          "fetch",
          fetchMock,
        );

        render(
          createElement(
            NewQuotationPage,
          ),
        );

        await screen.findByText(
          "Quotation information",
        );

        const item =
          await screen.findByRole(
            "combobox",
            {
              name: "Item 1",
            },
          );

        fireEvent.focus(item);

        fireEvent.change(item, {
          target: {
            value:
              "Created product",
          },
        });

        fireEvent.click(
          await screen.findByRole(
            "button",
            {
              name:
                'Create & Edit "Created product"',
            },
          ),
        );

        expect(
          await screen.findByText(
            "Add New Product",
          ),
        ).toBeTruthy();

        const unitSelect =
          screen.getByRole(
            "combobox",
            {
              name: "Unit",
            },
          ) as HTMLSelectElement;

        fireEvent.change(
          unitSelect,
          {
            target: {
              value:
                "unit-pcs",
            },
          },
        );

        const taxSelect =
          screen.getByRole(
            "combobox",
            {
              name:
                "Default Tax Rate",
            },
          ) as HTMLSelectElement;

        fireEvent.change(
          taxSelect,
          {
            target: {
              value: "tax-5",
            },
          },
        );

        const price =
          screen.getByRole(
            "spinbutton",
            {
              name: /Sale Price/,
            },
          ) as HTMLInputElement;

        fireEvent.change(price, {
          target: {
            value: "25",
          },
        });

        fireEvent.click(
          screen.getByRole(
            "button",
            {
              name: "Save",
            },
          ),
        );

        await waitFor(() =>
          expect(
            fetchMock.mock.calls.some(
              ([input, init]) =>
                input ===
                  "/api/catalog/items" &&
                init?.method ===
                  "POST",
            ),
          ).toBe(true),
        );

        await waitFor(() => {
          expect(
            (
              screen.getByRole(
                "combobox",
                {
                  name: "Item 1",
                },
              ) as HTMLInputElement
            ).value,
          ).toBe(
            "Created product",
          );
        });

        expect(
          (
            screen.getByRole(
              "textbox",
              {
                name: "Unit 1",
              },
            ) as HTMLInputElement
          ).value,
        ).toBe("Pieces (PCS)");

        const unitPrice =
          screen.getByRole(
            "spinbutton",
            {
              name: "Unit price 1",
            },
          ) as HTMLInputElement;

        expect(
          Number(
            unitPrice.value,
          ),
        ).toBe(25);
      },
    );
  },
);
