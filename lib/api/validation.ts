import { ApiError } from './api-error';

export type ValidationSuccess<T> = {
  success: true;
  data: T;
};

export type ValidationFailure = {
  success: false;
  error: unknown;
};

export interface ValidationSchema<T> {
  safeParse(
    value: unknown,
  ): ValidationSuccess<T> | ValidationFailure;
}

export function validateRequest<T>(
  schema: ValidationSchema<T>,
  value: unknown,
): T {
  const result = schema.safeParse(value);

  if (!result.success) {
    throw ApiError.validation(result.error);
  }

  return result.data;
}