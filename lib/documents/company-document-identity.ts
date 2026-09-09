export type CompanyBrandRecord = {
  name?: string | null;
  nameAr?: string | null;
  nameEn?: string | null;
  addressAr?: string | null;
  addressEn?: string | null;
  poBox?: string | null;
  phone?: string | null;
  mobile?: string | null;
  whatsapp?: string | null;
  logoUrl?: string | null;
  letterheadUrl?: string | null;
  brandTheme?: string | null;
};

export type CompanyDocumentIdentity = {
  name: string;
  address: string | null;
  poBox: string | null;
  phone: string | null;
  mobile: string | null;
  whatsapp: string | null;
  logoUrl: string | null;
  letterheadUrl: string | null;
  brandTheme: string | null;
};

export const COMPANY_IDENTITY_SELECT = {
  name: true,
  nameAr: true,
  nameEn: true,
  addressAr: true,
  addressEn: true,
  poBox: true,
  phone: true,
  mobile: true,
  whatsapp: true,
  logoUrl: true,
  letterheadUrl: true,
  brandTheme: true,
} as const;

export function localizeCompanyDocumentIdentity(
  company: CompanyBrandRecord | null | undefined,
  locale: "ar" | "en",
  fallbackName = "VOKA",
): CompanyDocumentIdentity {
  const nameAr = company?.nameAr?.trim() || null;
  const nameEn = company?.nameEn?.trim() || company?.name?.trim() || null;
  const addressAr = company?.addressAr?.trim() || null;
  const addressEn = company?.addressEn?.trim() || null;
  return {
    name:
      locale === "ar"
        ? nameAr || nameEn || fallbackName
        : nameEn || nameAr || fallbackName,
    address: locale === "ar" ? addressAr || addressEn : addressEn || addressAr,
    poBox: company?.poBox?.trim() || null,
    phone: company?.phone?.trim() || null,
    mobile: company?.mobile?.trim() || null,
    whatsapp: company?.whatsapp?.trim() || null,
    logoUrl: company?.logoUrl?.trim() || null,
    letterheadUrl: company?.letterheadUrl?.trim() || null,
    brandTheme: company?.brandTheme ?? null,
  };
}

export function decodeCompanyDocumentImage(
  value: string | null | undefined,
): Buffer | null {
  if (!value) return null;
  const match = /^data:image\/(?:png|jpe?g);base64,([A-Za-z0-9+/]+={0,2})$/i.exec(value);
  if (!match) return null;
  try {
    const buffer = Buffer.from(match[1], "base64");
    const png =
      buffer.length >= 8 &&
      buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const jpeg = buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    return png || jpeg ? buffer : null;
  } catch {
    return null;
  }
}

export function drawCompanyDocumentIdentity(
  doc: PDFKit.PDFDocument,
  identity: CompanyDocumentIdentity,
  locale: "ar" | "en",
  title: string,
  number: string,
) {
  const align = locale === "ar" ? ("right" as const) : ("left" as const);
  const letterhead = decodeCompanyDocumentImage(identity.letterheadUrl);
  if (letterhead) {
    try {
      doc.image(letterhead, 0, 0, {
        fit: [doc.page.width, doc.page.height],
        align: "center",
        valign: "center",
      });
    } catch {
      /* Invalid letterhead must not stop generation. */
    }
  }
  const logo = decodeCompanyDocumentImage(identity.logoUrl);
  if (logo) {
    try {
      doc.image(logo, locale === "ar" ? doc.page.width - 42 - 96 : 42, 28, {
        fit: [96, 48],
        align: "center",
        valign: "center",
      });
    } catch {
      /* Invalid logo must not stop generation. */
    }
  }
  const labels =
    locale === "ar"
      ? { poBox: "ص.ب", phone: "هاتف", mobile: "موبايل", whatsapp: "واتساب" }
      : { poBox: "P.O. Box", phone: "Tel", mobile: "Mobile", whatsapp: "WhatsApp" };
  const contacts = [
    identity.poBox ? `${labels.poBox}: ${identity.poBox}` : null,
    identity.phone ? `${labels.phone}: ${identity.phone}` : null,
    identity.mobile ? `${labels.mobile}: ${identity.mobile}` : null,
    identity.whatsapp ? `${labels.whatsapp}: ${identity.whatsapp}` : null,
  ]
    .filter((value): value is string => Boolean(value))
    .join("  |  ");

  doc.fillColor("#0f172a").fontSize(16).text(identity.name, { align });
  if (identity.address) {
    doc.fontSize(9).fillColor("#475569").text(identity.address, { align });
  }
  if (contacts) {
    doc.fontSize(8).fillColor("#64748b").text(contacts, { align });
  }
  doc.moveDown(0.4).fontSize(11).fillColor("#64748b").text(title, { align });
  doc.fontSize(18).fillColor("#0369a1").text(number, { align }).moveDown();
}
