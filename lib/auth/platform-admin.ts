import type { AuthContext } from "../../types/auth";

function configuredValues(
  raw: string | undefined,
  normalize: (value: string) => string,
): Set<string> {
  if (!raw?.trim()) {
    return new Set();
  }

  return new Set(
    raw
      .split(",")
      .map((value) => normalize(value.trim()))
      .filter(Boolean),
  );
}

export function isPlatformAdmin(
  auth: Pick<AuthContext, "user">,
): boolean {
  const userIds = configuredValues(
    process.env.VOKA_PLATFORM_ADMIN_USER_IDS,
    (value) => value,
  );

  const emails = configuredValues(
    process.env.VOKA_PLATFORM_ADMIN_EMAILS,
    (value) => value.toLowerCase(),
  );

  const userId =
    auth.user.id.trim();

  const email =
    auth.user.email
      .trim()
      .toLowerCase();

  return (
    userIds.has(userId) ||
    emails.has(email)
  );
}
