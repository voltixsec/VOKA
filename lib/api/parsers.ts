import { ApiError } from './ApiError';

export function parsePositiveInteger(
  value: string | null,
  fieldName: string,
): number | undefined {
  if (value === null || value.trim() === '') {
    return undefined;
  }

  const parsed = Number(value);

  if (
    !Number.isInteger(parsed) ||
    parsed < 1
  ) {
    throw ApiError.badRequest(
      'INVALID_POSITIVE_INTEGER',
      `${fieldName} must be a positive integer.`,
      {
        field: fieldName,
      },
    );
  }

  return parsed;
}

export function parseBoolean(
  value: string | null,
  fieldName: string,
): boolean | undefined {
  if (value === null || value.trim() === '') {
    return undefined;
  }

  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  throw ApiError.badRequest(
    'INVALID_BOOLEAN',
    `${fieldName} must be true or false.`,
    {
      field: fieldName,
    },
  );
}

export function requireString(
  value: unknown,
  fieldName: string,
): string {
  if (
    typeof value !== 'string' ||
    value.trim() === ''
  ) {
    throw ApiError.badRequest(
      'REQUIRED_STRING',
      `${fieldName} is required.`,
      {
        field: fieldName,
      },
    );
  }

  return value.trim();
}

export function optionalString(
  value: unknown,
  fieldName: string,
): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (typeof value !== 'string') {
    throw ApiError.badRequest(
      'INVALID_STRING',
      `${fieldName} must be a string or null.`,
      {
        field: fieldName,
      },
    );
  }

  const normalized = value.trim();

  return normalized || null;
}

export function requireNumber(
  value: unknown,
  fieldName: string,
): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value)
  ) {
    throw ApiError.badRequest(
      'REQUIRED_NUMBER',
      `${fieldName} must be a valid number.`,
      {
        field: fieldName,
      },
    );
  }

  return value;
}

export function optionalNumber(
  value: unknown,
  fieldName: string,
): number | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (
    typeof value !== 'number' ||
    !Number.isFinite(value)
  ) {
    throw ApiError.badRequest(
      'INVALID_NUMBER',
      `${fieldName} must be a valid number or null.`,
      {
        field: fieldName,
      },
    );
  }

  return value;
}

export function optionalBoolean(
  value: unknown,
  fieldName: string,
): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'boolean') {
    throw ApiError.badRequest(
      'INVALID_BOOLEAN',
      `${fieldName} must be true or false.`,
      {
        field: fieldName,
      },
    );
  }

  return value;
}