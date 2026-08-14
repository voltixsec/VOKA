export function normalizeWhatsAppRecipient(input: string): string {
  const trimmed = input.trim();
  if (!trimmed || !/^\+?[\d\s()-]+$/.test(trimmed)) {
    throw new Error("Invalid WhatsApp recipient.");
  }

  const explicitInternationalPrefix =
    trimmed.startsWith("+") || trimmed.startsWith("00");
  const digits = trimmed.replace(/\D/g, "");
  const normalized = trimmed.startsWith("00")
    ? digits.slice(2)
    : digits;

  if (
    normalized.length < 8 ||
    normalized.length > 15 ||
    normalized.startsWith("0") ||
    (!explicitInternationalPrefix && digits.startsWith("0"))
  ) {
    throw new Error("Invalid WhatsApp recipient.");
  }

  return normalized;
}
