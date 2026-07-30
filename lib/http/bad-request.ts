import { ApiError } from '../api';

export function badRequest(
  message = 'The request is invalid.',
  details?: unknown,
): never {
  throw ApiError.badRequest(message, details);
}
