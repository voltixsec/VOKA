import { NextResponse } from 'next/server';

import { ApiError } from './ApiError';

export type ApiSuccessResponse<T> = {
  success: true;
  data: T;
  meta?: unknown;
};

export type ApiErrorResponse = {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export type ApiSuccessOptions = {
  status?: number;
  meta?: unknown;
  headers?: HeadersInit;
};

export function apiSuccess<T>(
  data: T,
  options?: ApiSuccessOptions,
): NextResponse<ApiSuccessResponse<T>> {
  return NextResponse.json(
    {
      success: true,
      data,
      ...(options?.meta !== undefined
        ? {
            meta: options.meta,
          }
        : {}),
    },
    {
      status: options?.status ?? 200,
      headers: options?.headers,
    },
  );
}

export function apiFailure(
  error: ApiError,
): NextResponse<ApiErrorResponse> {
  return NextResponse.json(
    {
      success: false,
      error: {
        code: error.code,
        message: error.message,
        ...(error.details !== undefined
          ? {
              details: error.details,
            }
          : {}),
      },
    },
    {
      status: error.statusCode,
    },
  );
}

export function handleApiError(
  error: unknown,
  context?: string,
): NextResponse<ApiErrorResponse> {
  if (error instanceof ApiError) {
    return apiFailure(error);
  }

  if (error instanceof SyntaxError) {
    return apiFailure(
      ApiError.badRequest(
        'INVALID_JSON',
        'Request body must contain valid JSON.',
      ),
    );
  }

  console.error(
    context
      ? `${context}:`
      : 'Unhandled API error:',
    error,
  );

  return apiFailure(
    ApiError.internal(),
  );
}