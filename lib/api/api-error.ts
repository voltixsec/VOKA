export type ApiErrorDetails = unknown;

export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: ApiErrorDetails,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  static badRequest(
    message = 'Bad request',
    details?: ApiErrorDetails,
  ): ApiError {
    return new ApiError(400, 'BAD_REQUEST', message, details);
  }

  static unauthorized(message = 'Unauthorized'): ApiError {
    return new ApiError(401, 'UNAUTHORIZED', message);
  }

  static forbidden(message = 'Forbidden'): ApiError {
    return new ApiError(403, 'FORBIDDEN', message);
  }

  static notFound(message = 'Resource not found'): ApiError {
    return new ApiError(404, 'NOT_FOUND', message);
  }

  static conflict(
    message = 'Resource conflict',
    details?: ApiErrorDetails,
  ): ApiError {
    return new ApiError(409, 'CONFLICT', message, details);
  }

  static validation(
    details: ApiErrorDetails,
    message = 'Validation failed',
  ): ApiError {
    return new ApiError(422, 'VALIDATION_ERROR', message, details);
  }
}