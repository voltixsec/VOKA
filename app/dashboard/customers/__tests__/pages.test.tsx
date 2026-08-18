// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';

import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';

import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

const navigation =
  vi.hoisted(
    () => ({
      push:
        vi.fn(),
    }),
  );

vi.mock(
  'next/navigation',
  () => ({
    useParams:
      () => ({
        customerId:
          'customer-1',
      }),

    useRouter:
      () => ({
        push:
          navigation.push,
      }),
  }),
);

vi.mock(
  '@/components/i18n/LanguageProvider',
  () => ({
    useLanguage:
      () => ({
        isArabic:
          false,
      }),
  }),
);

import CustomerDetailPage from '../[customerId]/page';
import EditCustomerPage from '../[customerId]/edit/page';
import NewCustomerPage from '../new/page';

const customer = {
  id:
    'customer-1',

  code:
    'CUST-000001',

  name:
    'Noor Trading Company',

  nameAr:
    'شركة نور للتجارة',

  nameEn:
    'Noor Trading Company',

  addressLine1:
    'Salmiya Block 9',

  addressLine1Ar:
    'السالمية قطعة 9',

  addressLine1En:
    'Salmiya Block 9',

  city:
    'Salmiya',

  cityAr:
    'السالمية',

  cityEn:
    'Salmiya',

  state:
    'Hawally',

  stateAr:
    'حولي',

  stateEn:
    'Hawally',

  notes:
    'Priority customer',

  notesAr:
    'عميل ذو أولوية',

  notesEn:
    'Priority customer',

  type:
    'COMPANY',

  status:
    'ACTIVE',

  email:
    'hello@example.com',

  whatsapp:
    '+96590000000',

  countryCode:
    'KW',

  preferredCurrency:
    'KWD',
};

const response =
  (
    data: unknown,
    status = 200,
  ) =>
    Promise.resolve(
      new Response(
        JSON.stringify(
          data,
        ),
        {
          status,

          headers: {
            'Content-Type':
              'application/json',
          },
        },
      ),
    );

describe(
  'customer management pages',
  () => {
    beforeEach(
      () => {
        vi.restoreAllMocks();

        navigation
          .push
          .mockReset();
      },
    );

    it(
      'renders customer detail without duplicate language-name cards',
      async () => {
        vi.spyOn(
          global,
          'fetch',
        ).mockImplementation(
          () =>
            response({
              data: {
                customer,
              },
            }),
        );

        render(
          <CustomerDetailPage />,
        );

        const matches =
          await screen
            .findAllByText(
              'Noor Trading Company',
            );

        expect(
          matches.length,
        ).toBeGreaterThan(
          0,
        );

        expect(
          screen
            .getByText(
              '+96590000000',
            ),
        ).toBeInTheDocument();

        expect(
          screen
            .queryByText(
              'Arabic name',
            ),
        ).not
          .toBeInTheDocument();

        expect(
          screen
            .queryByText(
              'English name',
            ),
        ).not
          .toBeInTheDocument();

        expect(
          screen
            .getByText(
              /Salmiya Block 9/,
            ),
        ).toBeInTheDocument();

        expect(
          screen
            .getByText(
              'Kuwait',
            ),
        ).toBeInTheDocument();
      },
    );

    it(
      'creates from visible English text and persists generated Arabic text',
      async () => {
        const fetch =
          vi.spyOn(
            global,
            'fetch',
          )
            .mockImplementationOnce(
              () =>
                response({
                  data: {
                    fields: {
                      name:
                        'شركة نور للتجارة',

                      addressLine1:
                        'السالمية قطعة 9',

                      city:
                        'السالمية',

                      state:
                        'حولي',

                      notes:
                        'عميل ذو أولوية',
                    },

                    sourceLocale:
                      'en',

                    targetLocale:
                      'ar',
                  },
                }),
            )
            .mockImplementationOnce(
              () =>
                response(
                  {
                    data: {
                      customer: {
                        id:
                          'customer-new',

                        code:
                          'CUST-000002',
                      },
                    },
                  },
                  201,
                ),
            );

        render(
          <NewCustomerPage />,
        );

        fireEvent.change(
          screen
            .getByLabelText(
              'Customer Name',
            ),
          {
            target: {
              value:
                'Noor Trading Company',
            },
          },
        );

        fireEvent.change(
          screen
            .getByLabelText(
              'Address',
            ),
          {
            target: {
              value:
                'Salmiya Block 9',
            },
          },
        );

        fireEvent.change(
          screen
            .getByLabelText(
              'City',
            ),
          {
            target: {
              value:
                'Salmiya',
            },
          },
        );

        fireEvent.change(
          screen
            .getByLabelText(
              'State / Area',
            ),
          {
            target: {
              value:
                'Hawally',
            },
          },
        );

        fireEvent.change(
          screen
            .getByLabelText(
              'Notes',
            ),
          {
            target: {
              value:
                'Priority customer',
            },
          },
        );

        fireEvent.click(
          screen
            .getByRole(
              'button',
              {
                name:
                  'Create customer',
              },
            ),
        );

        await waitFor(
          () =>
            expect(
              navigation.push,
            ).toHaveBeenCalledWith(
              '/dashboard/customers/customer-new',
            ),
        );

        expect(
          fetch
            .mock
            .calls[0][0],
        ).toBe(
          '/api/customers/localize-fields',
        );

        expect(
          JSON.parse(
            String(
              fetch
                .mock
                .calls[0][1]
                ?.body,
            ),
          ),
        ).toEqual({
          sourceLocale:
            'en',

          fields: {
            name:
              'Noor Trading Company',

            addressLine1:
              'Salmiya Block 9',

            city:
              'Salmiya',

            state:
              'Hawally',

            notes:
              'Priority customer',
          },
        });

        expect(
          fetch
            .mock
            .calls[1][0],
        ).toBe(
          '/api/customers',
        );

        const body =
          JSON.parse(
            String(
              fetch
                .mock
                .calls[1][1]
                ?.body,
            ),
          );

        expect(
          body,
        ).toMatchObject({
          nameEn:
            'Noor Trading Company',

          nameAr:
            'شركة نور للتجارة',

          addressLine1En:
            'Salmiya Block 9',

          addressLine1Ar:
            'السالمية قطعة 9',

          cityEn:
            'Salmiya',

          cityAr:
            'السالمية',

          stateEn:
            'Hawally',

          stateAr:
            'حولي',

          notesEn:
            'Priority customer',

          notesAr:
            'عميل ذو أولوية',
        });
      },
    );

    it(
      'loads edit state and PATCHes changed non-translatable fields only',
      async () => {
        const fetch =
          vi.spyOn(
            global,
            'fetch',
          )
            .mockImplementationOnce(
              () =>
                response({
                  data: {
                    customer,
                  },
                }),
            )
            .mockImplementationOnce(
              () =>
                response({
                  data: {
                    customer: {
                      ...customer,

                      email:
                        'new@example.com',
                    },
                  },
                }),
            );

        render(
          <EditCustomerPage />,
        );

        const email =
          await screen
            .findByLabelText(
              'Email',
            );

        fireEvent.change(
          email,
          {
            target: {
              value:
                'new@example.com',
            },
          },
        );

        fireEvent.click(
          screen
            .getByRole(
              'button',
              {
                name:
                  'Save changes',
              },
            ),
        );

        await waitFor(
          () =>
            expect(
              navigation.push,
            ).toHaveBeenCalledWith(
              '/dashboard/customers/customer-1',
            ),
        );

        expect(
          JSON.parse(
            String(
              fetch
                .mock
                .calls[1][1]
                ?.body,
            ),
          ),
        ).toEqual({
          email:
            'new@example.com',
        });
      },
    );
  },
);