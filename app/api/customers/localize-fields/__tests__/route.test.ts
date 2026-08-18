import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

const mocks =
  vi.hoisted(
    () => ({
      translateMany:
        vi.fn(),
    }),
  );

vi.mock(
  '@/src/infrastructure/translation/createTranslationPort',
  () => ({
    createTranslationPort:
      () => ({
        translateMany:
          mocks.translateMany,
      }),
  }),
);

vi.mock(
  '@/lib/api',
  async () => {
    const errors =
      await vi.importActual<
        typeof import(
          '@/lib/api/ApiError'
        )
      >(
        '@/lib/api/ApiError',
      );

    const responses =
      await vi.importActual<
        typeof import(
          '@/lib/api/ApiResponse'
        )
      >(
        '@/lib/api/ApiResponse',
      );

    return {
      ApiError:
        errors.ApiError,

      apiSuccess:
        responses.apiSuccess,

      withCompanyAuth:
        (
          _roles:
            readonly string[],
          handler:
            (
              request:
                Request,
            ) =>
              Promise<Response>,
        ) =>
          async (
            request:
              Request,
          ) => {
            try {
              return await handler(
                request,
              );
            }
            catch (
              error
            ) {
              return responses
                .handleApiError(
                  error,
                );
            }
          },
    };
  },
);

import {
  POST,
} from '../route';

function request(
  body: unknown,
) {
  return new Request(
    'http://localhost/api/customers/localize-fields',
    {
      method:
        'POST',

      body:
        JSON.stringify(
          body,
        ),
    },
  );
}

describe(
  'POST /api/customers/localize-fields',
  () => {
    beforeEach(
      () => {
        vi.clearAllMocks();

        mocks
          .translateMany
          .mockImplementation(
            async (
              input:
                {
                  items:
                    Array<{
                      key:
                        string;

                      text:
                        string;
                    }>;
                },
            ) =>
              Object
                .fromEntries(
                  input
                    .items
                    .map(
                      (
                        item,
                      ) => [
                        item.key,
                        `AR:${item.text}`,
                      ],
                    ),
                ),
          );
      },
    );

    it(
      'localizes only approved Customer free-text fields in one batch',
      async () => {
        const response =
          await POST(
            request({
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
            }),
          );

        expect(
          response.status,
        ).toBe(200);

        const body =
          await response.json();

        expect(
          body.data.fields,
        ).toEqual({
          name:
            'AR:Noor Trading Company',

          addressLine1:
            'AR:Salmiya Block 9',

          city:
            'AR:Salmiya',

          state:
            'AR:Hawally',

          notes:
            'AR:Priority customer',
        });

        expect(
          mocks.translateMany,
        ).toHaveBeenCalledTimes(
          1,
        );
      },
    );

    it(
      'refuses Legal Name automatic translation',
      async () => {
        const response =
          await POST(
            request({
              sourceLocale:
                'en',

              fields: {
                legalName:
                  'Noor Trading Company W.L.L.',
              },
            }),
          );

        expect(
          response.status,
        ).toBe(400);

        expect(
          await response.json(),
        ).toMatchObject({
          error: {
            code:
              'INVALID_LOCALIZATION_FIELD',
          },
        });

        expect(
          mocks.translateMany,
        ).not
          .toHaveBeenCalled();
      },
    );
  },
);