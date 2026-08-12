import path from "node:path";

import PDFDocument from "pdfkit";
import QRCode from "qrcode";

import type {
  IQuotationDocumentRenderer,
  QuotationDocumentSnapshot,
} from "@/src/application/document";

import {
  drawProposalBoq,
} from "./ProposalPdfBoq";

import {
  drawProposalCover,
} from "./ProposalPdfCover";

import {
  PROPOSAL_COLOR,
  LETTERHEAD_SAFE_AREA,
  configureProposalTextDirection,
  type ProposalPdfDocument,
  type ProposalSnapshot,
} from "./ProposalPdfShared";

function drawSafeFooter(
  doc: ProposalPdfDocument,
  snapshot: ProposalSnapshot,
  _qrBuffer: Buffer,
  pageNumber: number,
  pageCount: number,
): void {
  const pageWidth =
    doc.page.width;

  const pageHeight =
    doc.page.height;

  const left = 38;

  const width =
    pageWidth - 76;

  /*
   * Keep the complete footer above the
   * PDFKit bottom-margin boundary.
   * Drawing text below that boundary
   * creates automatic blank pages.
   */
  const lineY =
    pageHeight - 72;

  const textY =
    pageHeight - 63;

  doc.save();

  doc
    .moveTo(
      left,
      lineY,
    )
    .lineTo(
      left + width,
      lineY,
    )
    .lineWidth(0.35)
    .strokeColor(
      PROPOSAL_COLOR.line,
    )
    .stroke();

  doc
    .fillColor(
      PROPOSAL_COLOR.muted,
    )
    .fontSize(5.8)
    .text(
      snapshot.company.name +
        " — " +
        snapshot.quotation.number,
      left,
      textY,
      {
        width: 210,
        align: "left",
        lineBreak: false,
      },
    );

  doc
    .fillColor(
      PROPOSAL_COLOR.muted,
    )
    .fontSize(5.8)
    .text(
      String(pageNumber) +
        " / " +
        String(pageCount),
      pageWidth / 2 - 30,
      textY,
      {
        width: 60,
        align: "center",
        lineBreak: false,
      },
    );

  doc.restore();
}

export function decorateExistingPages(
  doc: ProposalPdfDocument,
  snapshot: ProposalSnapshot,
  qrBuffer: Buffer,
  letterheadPages: readonly boolean[],
): void {
  const range =
    doc.bufferedPageRange();

  if (range.count !== 2) {
    throw new Error(
      "Quotation PDF must contain exactly two pages before decoration. Current page count: " +
        String(range.count),
    );
  }

  for (
    let index = 0;
    index < range.count;
    index += 1
  ) {
    doc.switchToPage(
      range.start + index,
    );

    const letterheadMode = letterheadPages[index];

    if (letterheadMode) {
      doc
        .fillColor(PROPOSAL_COLOR.muted)
        .fontSize(5.8)
        .text(
          snapshot.quotation.number + " · " + String(index + 1) + " / " + String(range.count),
          38,
          doc.page.height - LETTERHEAD_SAFE_AREA.bottom - LETTERHEAD_SAFE_AREA.traceOffset,
          { width: doc.page.width - 76, align: "center", lineBreak: false },
        );
    } else {
      drawSafeFooter(
        doc,
        snapshot,
        qrBuffer,
        index + 1,
        range.count,
      );
    }
  }

  /*
   * Check again after drawing the footer.
   * This prevents footer text from silently
   * generating additional blank pages.
   */
  const finalRange =
    doc.bufferedPageRange();

  if (finalRange.count !== 2) {
    throw new Error(
      "Footer decoration generated unexpected pages. Current page count: " +
        String(finalRange.count),
    );
  }
}

export class PdfKitQuotationDocumentRenderer
  implements
    IQuotationDocumentRenderer {
  async render(
    snapshot:
      QuotationDocumentSnapshot,
  ): Promise<Uint8Array> {
    const qrDataUrl = snapshot.verificationUrl
      ? await QRCode.toDataURL(
        snapshot.verificationUrl,
        {
          margin: 1,
          width: 140,
          errorCorrectionLevel:
            "M",
        },
      ) : null;

    const encodedQr =
      qrDataUrl?.split(",")[1];

    const qrBuffer = encodedQr
      ? Buffer.from(
        encodedQr,
        "base64",
      )
      : null;

    const fontPath =
      path.join(
        process.cwd(),
        "assets",
        "fonts",
        "Cairo-Variable.ttf",
      );

    const doc =
      new PDFDocument({
        size: "A4",

        margins: {
          top: 32,
          right: 38,
          bottom: 48,
          left: 38,
        },

        bufferPages: true,

        autoFirstPage: true,

        info: {
          Title:
            (
              snapshot.locale === "ar"
                ? "عرض سعر "
                : "Quotation "
            ) +
            snapshot.quotation.number,

          Author:
            snapshot.company.name,

          Subject:
            snapshot.locale === "ar"
              ? snapshot.quotation
                  .subjectAr ||
                "عرض سعر"
              : snapshot.quotation
                  .subjectEn ||
                "Quotation",
        },
      });

    const chunks: Buffer[] = [];

    doc.on(
      "data",
      (chunk: Buffer) => {
        chunks.push(chunk);
      },
    );

    const completed =
      new Promise<Uint8Array>(
        (resolve, reject) => {
          doc.on(
            "end",
            () => {
              resolve(
                new Uint8Array(
                  Buffer.concat(
                    chunks,
                  ),
                ),
              );
            },
          );

          doc.on(
            "error",
            reject,
          );
        },
      );

    doc
      .registerFont(
        "VOKA",
        fontPath,
      )
      .font("VOKA");

    configureProposalTextDirection(doc, snapshot.locale);

    /*
     * Page 1:
     * Quotation cover and company approval.
     */
    const coverHasLetterhead = drawProposalCover(
      doc,
      snapshot,
    );

    /*
     * Page 2:
     * Repeated header, quotation items,
     * totals, terms and company approval.
     */
    const boqHasLetterhead = drawProposalBoq(
      doc,
      snapshot,
      qrBuffer,
    );

    /*
     * Footer is drawn with lineBreak false
     * inside the physical page boundary.
     * This prevents PDFKit from creating
     * additional blank pages.
     */
    decorateExistingPages(
      doc,
      snapshot,
      qrBuffer ?? Buffer.alloc(0),
      [coverHasLetterhead, boqHasLetterhead],
    );

    doc.end();

    return completed;
  }
}
