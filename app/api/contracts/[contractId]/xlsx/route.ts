import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { withCompanyAuth } from "@/lib/api";
import {
  contractIdFromDocumentRequest,
  getContractDocumentSnapshot,
} from "@/lib/documents/contract-snapshot";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = withCompanyAuth(
  ["OWNER", "ADMIN", "SALES", "VIEWER"],
  async (request, auth, company) => {
    const s = await getContractDocumentSnapshot(
      company.companyId,
      contractIdFromDocumentRequest(request, "xlsx"),
    );
    const ar = auth.user.locale.startsWith("ar"),
      t = (a: string, e: string) => (ar ? a : e),
    text = (a: string | null | undefined, e: string | null | undefined, f = "") =>
        ar ? (a ?? e ?? f) : (e ?? a ?? f);
    const b = new ExcelJS.Workbook();
    b.creator = "VOKA";
    b.created = new Date();
    const sh = b.addWorksheet(t("العقد", "Contract"), {
      views: [{ rightToLeft: ar }],
    });
    sh.addRows([
      [t("رقم العقد", "Contract number"), s.number],
      [t("الحالة", "Status"), s.status],
      [
        t("العميل", "Customer"),
        text(s.customer.nameAr, s.customer.nameEn, s.customer.name),
      ],
      [t("تاريخ العقد", "Contract date"), new Date(s.contractDate)],
      [t("البداية", "Start date"), s.startDate ? new Date(s.startDate) : null],
      [t("النهاية", "End date"), s.endDate ? new Date(s.endDate) : null],
      [t("العملة", "Currency"), s.currencyCode],
      [
        t("المشروع", "Project"),
        text(s.projectNameAr, s.projectNameEn, s.projectName ?? ""),
      ],
      [
        t("لعناية", "Attention"),
        text(s.attentionNameAr, s.attentionNameEn, s.attentionName ?? ""),
      ],
      [
        t("المصدر", "Source"),
        `${s.provenance.origin} / ${s.provenance.sourceKind ?? ""} / ${s.provenance.sourceId ?? ""}`,
      ],
      [],
    ]);
    sh.addRow([
      t("الترتيب", "Position"),
      t("النوع", "Type"),
      t("الرمز", "Code"),
      t("البند", "Item"),
      t("الوصف", "Description"),
      t("الوحدة", "Unit"),
      t("الكمية", "Quantity"),
      t("سعر الوحدة", "Unit price"),
      t("الخصم", "Discount"),
      t("الضريبة", "Tax"),
      t("الإجمالي", "Total"),
    ]);
    s.lines.forEach((l) =>
      sh.addRow([
        l.position,
        l.type,
        l.itemCode,
        text(l.itemNameAr, l.itemNameEn, l.itemName),
        text(l.descriptionAr, l.descriptionEn, l.description ?? ""),
        text(l.unitNameAr, l.unitNameEn, l.unitName ?? ""),
        l.quantity,
        l.unitPrice,
        l.discountAmount,
        l.taxAmount,
        l.totalAmount,
      ]),
    );
    sh.addRows([
      [],
      [t("المجموع الفرعي", "Subtotal"), s.subtotal],
      [t("الخصم", "Discount"), s.discountAmount],
      [t("الضريبة", "Tax"), s.taxAmount],
      [t("الإجمالي", "Total"), s.totalAmount],
      [
        t("الشروط", "Terms"),
        text(
          s.termsAndConditionsAr,
          s.termsAndConditionsEn,
          s.termsAndConditions ?? "",
        ),
      ],
      [t("ملاحظات", "Notes"), text(s.notesAr, s.notesEn, s.notes ?? "")],
    ]);
    sh.columns = [
      { width: 12 },
      { width: 16 },
      { width: 18 },
      { width: 32 },
      { width: 40 },
      { width: 16 },
      { width: 14 },
      { width: 18 },
      { width: 16 },
      { width: 16 },
      { width: 18 },
    ];
    for (const c of [7, 8, 9, 10, 11]) sh.getColumn(c).numFmt = "#,##0.000";
    if (s.milestones.length) {
      const ms = b.addWorksheet(t("الدفعات", "Milestones"), {
        views: [{ rightToLeft: ar }],
      });
      ms.addRow([
        t("الترتيب", "Position"),
        t("العنوان", "Title"),
        t("الوصف", "Description"),
        t("نوع القيمة", "Amount type"),
        t("القيمة", "Value"),
        t("الاستحقاق", "Due date"),
      ]);
      s.milestones.forEach((m) =>
        ms.addRow([
          m.position,
          text(m.titleAr, m.titleEn, m.title),
          m.description,
          m.amountType,
        m.amountType === "PERCENTAGE" ? m.percentage : m.fixedAmount,
          m.dueDate ? new Date(m.dueDate) : null,
        ]),
      );
    }
    const bytes = await b.xlsx.writeBuffer();
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="contract-${s.number.replace(/[^A-Za-z0-9._-]/g, "-")}.xlsx"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  },
);
