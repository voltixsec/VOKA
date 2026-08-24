export function sanitizeReturnTo(returnTo?: string | null): string {
  const DEFAULT_DESTINATION = '/dashboard';

  if (!returnTo || typeof returnTo !== 'string') {
    return DEFAULT_DESTINATION;
  }

  const trimmed = returnTo.trim();

  if (
    !trimmed.startsWith('/') ||
    trimmed.startsWith('//') ||
    trimmed.startsWith('/\\') ||
    trimmed.includes('\\')
  ) {
    return DEFAULT_DESTINATION;
  }

  try {
    const url = new URL(trimmed, 'https://voka.local');

    if (url.origin !== 'https://voka.local') {
      return DEFAULT_DESTINATION;
    }

    const pathname = url.pathname;

    if (
      pathname !== '/dashboard' &&
      !pathname.startsWith('/dashboard/')
    ) {
      return DEFAULT_DESTINATION;
    }

    return `${pathname}${url.search}${url.hash}`;
  } catch {
    return DEFAULT_DESTINATION;
  }
}
