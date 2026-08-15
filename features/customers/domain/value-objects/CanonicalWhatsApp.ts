import { parsePhoneNumberFromString } from 'libphonenumber-js/min';

import { DomainError, Result } from '../../../../lib/core';

export function normalizeCanonicalWhatsApp(
  value: string | null | undefined,
): Result<string | null, DomainError> {
  if (value === undefined || value === null || !value.trim()) {
    return Result.success(null);
  }

  const trimmed = value.trim();
  if (!trimmed.startsWith('+')) {
    return Result.failure(
      new DomainError(
        'Customer WhatsApp number must use E.164 international format.',
        'INVALID_CUSTOMER_WHATSAPP',
      ),
    );
  }

  const parsed = parsePhoneNumberFromString(trimmed);
  if (!parsed?.isValid() || parsed.number !== trimmed) {
    return Result.failure(
      new DomainError(
        'Customer WhatsApp number is invalid.',
        'INVALID_CUSTOMER_WHATSAPP',
      ),
    );
  }

  return Result.success(parsed.number);
}
