import { ApiError } from './api-error';
import { apiFailure } from './api-response';

export function handleApiError(error: unknown) {
  if (error instanceof ApiError) {
    return apiFailure(
      {
        code: error.code,
        message: error.message,
        ...(error.details !== undefined
          ? { details: error.details }
          : {}),
      },
      error.statusCode,
    );
  }

  console.error('[VOKA API ERROR]', error);

  return apiFailure(
    {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred',
    },
    500,
  );
}