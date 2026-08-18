// @vitest-environment jsdom

import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';

import {
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import {
  useState,
} from 'react';

import {
  CustomerForm,
  emptyCustomerForm,
} from '../CustomerForm';

import {
  CustomerTable,
} from '../CustomerTable';

import {
  CountryWhatsAppInput,
} from '../CountryWhatsAppInput';

describe(
  'customer contact UI',
  () => {
    it(
      'renders accessible customer navigation links with visible focus styling',
      () => {
        render(
          <CustomerTable
            customers={[
              {
                id:
                  'customer 1',
                code:
                  'C-1',
                name:
                  'Acme',
                type:
                  'COMPANY',
                status:
                  'ACTIVE',
              },
            ]}
          />,
        );

        const links =
          screen
            .getAllByRole(
              'link',
            );

        expect(
          links[0],
        ).toHaveAttribute(
          'href',
          '/dashboard/customers/customer%201',
        );

        expect(
          links[0]
            .className,
        ).toContain(
          'focus-visible:ring-2',
        );
      },
    );

    it(
      'uses one WhatsApp country dropdown and emits canonical E.164',
      () => {
        const onChange =
          vi.fn();

        function Harness() {
          const [
            value,
            setValue,
          ] =
            useState('');

          return (
            <CountryWhatsAppInput
              value={value}
              countryCode={
                null
              }
              isArabic={
                false
              }
              onChange={
                (
                  next,
                  valid,
                ) => {
                  onChange(
                    next,
                    valid,
                  );

                  setValue(
                    next,
                  );
                }
              }
            />
          );
        }

        render(
          <Harness />,
        );

        expect(
          screen
            .getByLabelText(
              'WhatsApp country',
            ),
        ).toHaveValue(
          'KW',
        );

        expect(
          screen
            .queryByLabelText(
              'Search countries',
            ),
        ).not
          .toBeInTheDocument();

        fireEvent.change(
          screen
            .getByLabelText(
              'National number',
            ),
          {
            target: {
              value:
                '90000000',
            },
          },
        );

        expect(
          onChange,
        ).toHaveBeenLastCalledWith(
          '+96590000000',
          true,
        );
      },
    );

    it(
      'switches every bilingual Customer text value with the UI language',
      () => {
        const initial = {
          ...emptyCustomerForm,

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
        };

        const {
          rerender,
        } = render(
          <CustomerForm
            initialValue={
              initial
            }
            isArabic={
              false
            }
            isEdit
            submitLabel="Save changes"
            onSubmit={
              vi.fn()
            }
          />,
        );

        expect(
          screen
            .getByLabelText(
              'Customer Name',
            ),
        ).toHaveValue(
          'Noor Trading Company',
        );

        expect(
          screen
            .getByLabelText(
              'Address',
            ),
        ).toHaveValue(
          'Salmiya Block 9',
        );

        expect(
          screen
            .getByLabelText(
              'City',
            ),
        ).toHaveValue(
          'Salmiya',
        );

        expect(
          screen
            .getByLabelText(
              'State / Area',
            ),
        ).toHaveValue(
          'Hawally',
        );

        expect(
          screen
            .getByLabelText(
              'Notes',
            ),
        ).toHaveValue(
          'Priority customer',
        );

        rerender(
          <CustomerForm
            initialValue={
              initial
            }
            isArabic
            isEdit
            submitLabel="حفظ التغييرات"
            onSubmit={
              vi.fn()
            }
          />,
        );

        expect(
          screen
            .getByLabelText(
              'اسم العميل',
            ),
        ).toHaveValue(
          'شركة نور للتجارة',
        );

        expect(
          screen
            .getByLabelText(
              'العنوان',
            ),
        ).toHaveValue(
          'السالمية قطعة 9',
        );

        expect(
          screen
            .getByLabelText(
              'المدينة',
            ),
        ).toHaveValue(
          'السالمية',
        );

        expect(
          screen
            .getByLabelText(
              'المنطقة',
            ),
        ).toHaveValue(
          'حولي',
        );

        expect(
          screen
            .getByLabelText(
              'ملاحظات',
            ),
        ).toHaveValue(
          'عميل ذو أولوية',
        );
      },
    );

    it(
      'localizes missing target text when the UI language changes',
      async () => {
        const fetch =
          vi.spyOn(
            global,
            'fetch',
          ).mockResolvedValue(
            new Response(
              JSON.stringify({
                data: {
                  fields: {
                    name:
                      'شركة نور للتجارة',

                    addressLine1:
                      'السالمية قطعة 9',
                  },

                  sourceLocale:
                    'en',

                  targetLocale:
                    'ar',
                },
              }),
              {
                status: 200,

                headers: {
                  'Content-Type':
                    'application/json',
                },
              },
            ),
          );

        const initial = {
          ...emptyCustomerForm,

          name:
            'Noor Trading Company',

          nameEn:
            'Noor Trading Company',

          addressLine1:
            'Salmiya Block 9',

          addressLine1En:
            'Salmiya Block 9',
        };

        const {
          rerender,
        } = render(
          <CustomerForm
            initialValue={
              initial
            }
            isArabic={
              false
            }
            isEdit
            submitLabel="Save"
            onSubmit={
              vi.fn()
            }
          />,
        );

        rerender(
          <CustomerForm
            initialValue={
              initial
            }
            isArabic
            isEdit
            submitLabel="حفظ"
            onSubmit={
              vi.fn()
            }
          />,
        );

        await waitFor(
          () =>
            expect(
              screen
                .getByLabelText(
                  'اسم العميل',
                ),
            ).toHaveValue(
              'شركة نور للتجارة',
            ),
        );

        expect(
          screen
            .getByLabelText(
              'العنوان',
            ),
        ).toHaveValue(
          'السالمية قطعة 9',
        );

        expect(
          fetch,
        ).toHaveBeenCalledWith(
          '/api/customers/localize-fields',
          expect.objectContaining({
            method:
              'POST',
          }),
        );
      },
    );
  },
);