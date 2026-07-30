import { NextResponse } from 'next/server';

export type ApiSuccessResponse<T> = {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
};

export type ApiErrorBody = {
  code: string;
  message: string;
  details?: unknown;
};

export type ApiErrorResponse = {
  success: false;
  error: ApiErrorBody;
};

export type ApiResponse<T> =
  | ApiSuccessResponse<T>
  | ApiErrorResponse;

export function apiSuccess<T>(
  data: T,
  init?: ResponseInit,
  meta?: Record<string, unknown>,
) {
  const body: ApiSuccessResponse<T> = {
    success: true,
    data,
    ...(meta ? { meta } : {}),
  };

  return NextResponse.json(body, init);
}

export function apiFailure(
  error: ApiErrorBody,
  statusCode = 500,
) {
  const body: ApiErrorResponse = {
    success: false,
    error,
  };

  return NextResponse.json(body, {
    status: statusCode,
  });
}