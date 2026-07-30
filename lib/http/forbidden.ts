import { ApiError } from '../api';

export function forbidden(
  message = 'You do not have permission to perform this action.',
): never {
  throw ApiError.forbidden(message);
}
