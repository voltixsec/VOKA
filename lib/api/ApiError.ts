export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  public static badRequest(
    code: string,
    message: string,
    details?: unknown,
  ): ApiError {
    return new ApiError(
      400,
      code,
      message,
      details,
    );
  }

  public static unauthorized(
    code = 'UNAUTHORIZED',
    message = 'Authentication is required.',
  ): ApiError {
    return new ApiError(
      401,
      code,
      message,
    );
  }

  public static forbidden(
    code = 'FORBIDDEN',
    message = 'You do not have permission to perform this action.',
  ): ApiError {
    return new ApiError(
      403,
      code,
      message,
    );
  }

  public static notFound(
    code: string,
    message: string,
  ): ApiError {
    return new ApiError(
      404,
      code,
      message,
    );
  }

  public static conflict(
    code: string,
    message: string,
    details?: unknown,
  ): ApiError {
    return new ApiError(
      409,
      code,
      message,
      details,
    );
  }

  public static internal(
    message = 'An unexpected error occurred.',
  ): ApiError {
    return new ApiError(
      500,
      'INTERNAL_SERVER_ERROR',
      message,
    );
  }
}