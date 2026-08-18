import {
  ApiError,
  apiSuccess,
  withCompanyAuth,
} from '@/lib/api';
import {
  BilingualTranslationService,
} from '@/src/application/translation';
import {
  createTranslationPort,
} from '@/src/infrastructure/translation/createTranslationPort';

export const runtime = 'nodejs';

const ALLOWED_FIELDS = new Set([
  'name',
  'addressLine1',
  'addressLine2',
  'city',
  'state',
  'notes',
]);

export const POST = withCompanyAuth(
  ['OWNER', 'ADMIN', 'SALES'],
  async (request) => {
    const body =
      (await request.json()) as Record<string, unknown>;

    const sourceLocale = body.sourceLocale;

    if (
      sourceLocale !== 'ar' &&
      sourceLocale !== 'en'
    ) {
      throw ApiError.badRequest(
        'INVALID_SOURCE_LOCALE',
        'sourceLocale must be ar or en.',
      );
    }

    if (
      !body.fields ||
      typeof body.fields !== 'object' ||
      Array.isArray(body.fields)
    ) {
      throw ApiError.badRequest(
        'INVALID_LOCALIZATION_FIELDS',
        'fields must be an object.',
      );
    }

    const rawFields =
      body.fields as Record<string, unknown>;

    const fields:
      Record<string, string | null> = {};

    for (const [key, rawValue] of Object.entries(rawFields)) {
      if (!ALLOWED_FIELDS.has(key)) {
        throw ApiError.badRequest(
          'INVALID_LOCALIZATION_FIELD',
          `Field "${key}" cannot be automatically localized.`,
          { field: key },
        );
      }

      if (
        rawValue !== null &&
        typeof rawValue !== 'string'
      ) {
        throw ApiError.badRequest(
          'INVALID_LOCALIZATION_FIELD',
          `${key} must be a string or null.`,
          { field: key },
        );
      }

      fields[key] =
        typeof rawValue === 'string'
          ? rawValue.trim() || null
          : null;
    }

    if (Object.keys(fields).length === 0) {
      throw ApiError.badRequest(
        'LOCALIZATION_FIELDS_REQUIRED',
        'At least one localizable field is required.',
      );
    }

    const nonEmptyFields =
      Object.fromEntries(
        Object.entries(fields).filter(
          ([, value]) => Boolean(value),
        ),
      );

    if (Object.keys(nonEmptyFields).length === 0) {
      return apiSuccess(
        {
          fields,
          sourceLocale,
          targetLocale:
            sourceLocale === 'ar'
              ? 'en'
              : 'ar',
        },
        {
          headers: {
            'Cache-Control': 'no-store',
          },
        },
      );
    }

    const translationPort =
      createTranslationPort();

    if (!translationPort) {
      throw new ApiError(
        503,
        'CUSTOMER_LOCALIZATION_UNAVAILABLE',
        'Customer localization is currently unavailable.',
      );
    }

    try {
      const service =
        new BilingualTranslationService(
          translationPort,
        );

      const result =
        await service.translateSourceFields(
          sourceLocale,
          nonEmptyFields,
        );

      return apiSuccess(
        {
          fields: {
            ...fields,
            ...result.translated,
          },
          sourceLocale,
          targetLocale:
            result.targetLocale,
        },
        {
          headers: {
            'Cache-Control': 'no-store',
          },
        },
      );
    }
    catch {
      throw new ApiError(
        503,
        'CUSTOMER_LOCALIZATION_UNAVAILABLE',
        'Customer localization is currently unavailable.',
      );
    }
  },
);