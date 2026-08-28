/** Customer identity matching only. Never infer a canonical ID from a name. */
export function normalizeCustomerIdentity(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase()
    .replace(/[أإآٱ]/g, 'ا').replace(/[\u064B-\u065F\u0670ـ]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ')
    .replace(/^(?:شركة|الشركة)\s+/, '');
}

export type SearchableCustomer = {
  name: string; code?: string | null; nameAr?: string | null; nameEn?: string | null;
  legalName?: string | null; email?: string | null; aliases?: readonly string[];
  phone?: string | null; mobile?: string | null; whatsapp?: string | null; taxNumber?: string | null;
};

function oneEditApart(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length >= b.length) i++;
    if (b.length >= a.length) j++;
  }
  return edits + (i < a.length || j < b.length ? 1 : 0) <= 1;
}

/** Exact > prefix > contained name > conservative typo suggestion. Fuzzy never auto-resolves. */
export function customerMatchScore(customer: SearchableCustomer, query: string): number {
  const needle = normalizeCustomerIdentity(query);
  if (!needle) return 0;
  const values = [customer.code, customer.name, customer.nameAr, customer.nameEn, customer.legalName,
    customer.email, customer.phone, customer.mobile, customer.whatsapp, customer.taxNumber, ...(customer.aliases ?? [])];
  return Math.max(0, ...values.filter((value): value is string => Boolean(value)).map((value) => {
    const name = normalizeCustomerIdentity(value);
    if (name === needle) return 100;
    if (name.startsWith(needle + ' ')) return 80;
    if ((' ' + name + ' ').includes(' ' + needle + ' ')) return 70;
    if (needle.length >= 3 && name.includes(needle)) return 60;
    if (needle.length >= 5 && (oneEditApart(name, needle) || name.split(' ').some((word) => oneEditApart(word, needle)))) return 40;
    return 0;
  }));
}
