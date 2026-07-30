import { ApiError } from '../api';

export function unauthorized(
  message = 'Authentication is required.',
): never {
  throw ApiError.unauthorized(message);
}
