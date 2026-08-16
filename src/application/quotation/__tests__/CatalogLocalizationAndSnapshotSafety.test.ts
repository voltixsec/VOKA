import { describe, expect, it } from 'vitest';
import { analyzeQuotationLocalization } from '../services/QuotationLocalizationAnalyzer';
import { Quotation } from '../../../domain/quotation';
import { buildApprovedQuotationSalesOrderDraft } from '../../sales-order/services/buildApprovedQuotationSalesOrderDraft';
import { createCompanyDocumentBrandSnapshot } from '../../../domain/document/CompanyDocumentBrandSnapshot';

describe('Catalog Localization & Historical Snapshot Safety', () => {
  it('reuses canonical bilingual values and skips AI localization when both languages exist', () => {
    const snapshot = {
      customer: {
        name: 'Acme Corp',
        nameAr: 'شركة أكمي',
        nameEn: 'Acme Corp',
      },
      projectName: 'CCTV Installation',
      projectNameAr: 'تركيب كاميرات مراقبة',
      projectNameEn: 'CCTV Installation',
      lines: [
        {
          itemCode: 'PROD-101',
          itemName: '4K CCTV Camera',
          itemNameAr: 'كاميرا مراقبة 4K',
          itemNameEn: '4K CCTV Camera',
          description: '4K Resolution Camera',
          descriptionAr: 'دقة 4K',
          descriptionEn: '4K Resolution Camera',
          unitName: 'PCS',
          unitNameAr: 'قطعة',
          unitNameEn: 'PCS',
          quantity: 2,
          unitPrice: 150,
        },
      ],
    };

    const analysis = analyzeQuotationLocalization(snapshot, 'ar');

    expect(analysis.sourceLocale).toBe('ar');
    expect(analysis.items.length).toBe(0);
  });

  it('triggers localization only for missing target fields when canonical item has partial translation', () => {
    const snapshot = {
      customer: { name: 'Acme Corp' },
      lines: [
        {
          itemCode: 'PROD-102',
          itemName: 'Smart Switch',
          itemNameAr: 'مفتاح ذكي',
          // itemNameEn is missing
          unitName: 'PCS',
          quantity: 1,
          unitPrice: 30,
        },
      ],
    };

    const analysis = analyzeQuotationLocalization(snapshot, 'ar');

    expect(analysis.items.length).toBeGreaterThan(0);
    expect(analysis.items.some((item) => item.key.includes('line_0_item_name'))).toBe(true);
  });

  it('preserves quotation historical snapshot when master customer or catalog item changes', () => {
    const quotation = new Quotation({
      companyId: 'company-1',
      customerId: 'cust-1',
      number: 'QT-2026-001',
      currencyCode: 'KWD',
      customer: {
        name: 'Original Customer Name',
        email: 'original@example.com',
      },
      lines: [
        {
          position: 1,
          type: 'PRODUCT',
          catalogItemId: 'cat-1',
          itemCode: 'PROD-1',
          itemName: 'Original Camera Name',
          itemNameAr: 'كاميرا أصلية',
          itemNameEn: 'Original Camera Name',
          quantity: 2,
          unitPrice: 100,
          taxPercentage: 0,
        },
      ],
    });

    quotation.send(new Date());
    quotation.approve(
      createCompanyDocumentBrandSnapshot({
        nameAr: 'شركة تجريبية',
        nameEn: 'Test Company',
        addressAr: null,
        addressEn: null,
        poBox: null,
        phone: null,
        mobile: null,
        whatsapp: null,
        logoUrl: null,
        brandTheme: 'NAVY_GOLD',
        letterheadUrl: null,
        signatureUrl: null,
        stampUrl: null,
      }),
      { name: 'Manager', role: 'OWNER' },
      new Date(),
    );

    // Simulate master catalog item change in database (e.g. price raised to 200, name updated)
    const updatedMasterCatalogItem = {
      id: 'cat-1',
      name: 'NEW Camera Name',
      salePrice: 200,
      isActive: false, // master catalog item deactivated
    };

    // The quotation line snapshot remains unchanged
    expect(quotation.lines[0].itemName).toBe('Original Camera Name');
    expect(quotation.lines[0].unitPrice).toBe(100);

    // Conversion to Sales Order copies quotation snapshot only
    const draftSoResult = buildApprovedQuotationSalesOrderDraft(
      {
        id: quotation.id ?? 'quotation-1',
        companyId: quotation.companyId,
        customerId: quotation.customerId,
        priceListId: quotation.priceListId,
        number: quotation.number.toString(),
        status: quotation.status,
        currencyCode: quotation.currencyCode,
        customerName: quotation.customer.name,
        customerNameAr: quotation.customer.nameAr,
        customerNameEn: quotation.customer.nameEn,
        customerEmail: quotation.customer.email,
        customerPhone: quotation.customer.phone,
        customerTaxNo: quotation.customer.taxNumber,
        billingAddress: quotation.customer.billingAddress,
        subjectAr: quotation.subjectAr,
        subjectEn: quotation.subjectEn,
        briefAr: quotation.briefAr,
        briefEn: quotation.briefEn,
        projectName: quotation.projectName,
        projectNameAr: quotation.projectNameAr,
        projectNameEn: quotation.projectNameEn,
        attentionName: quotation.attentionName,
        attentionNameAr: quotation.attentionNameAr,
        attentionNameEn: quotation.attentionNameEn,
        scopeType: quotation.scopeType,
        discountType: quotation.discount?.type ?? null,
        discountValue: quotation.discount?.value ?? 0,
        discountAmount: quotation.totals.discountAmount,
        subtotal: quotation.totals.subtotal,
        taxAmount: quotation.totals.taxAmount,
        totalAmount: quotation.totals.totalAmount,
        notes: quotation.notes,
        notesAr: quotation.notesAr,
        notesEn: quotation.notesEn,
        termsAndConditions: quotation.termsAndConditions,
        termsAndConditionsAr: quotation.termsAndConditionsAr,
        termsAndConditionsEn: quotation.termsAndConditionsEn,
        approvedAt: quotation.approvedAt,
        approvedByName: quotation.approvedByName,
        approvedByRole: quotation.approvedByRole,
        lines: quotation.lines.map((line) => ({
          id: line.id ?? 'line-1',
          catalogItemId: line.catalogItemId ?? null,
          taxRateId: line.taxRateId ?? null,
          position: line.position,
          type: line.type,
          itemCode: line.itemCode ?? null,
          itemName: line.itemName,
          itemNameAr: line.itemNameAr ?? null,
          itemNameEn: line.itemNameEn ?? null,
          description: line.description ?? null,
          descriptionAr: line.descriptionAr ?? null,
          descriptionEn: line.descriptionEn ?? null,
          unitName: line.unitName ?? null,
          unitNameAr: line.unitNameAr ?? null,
          unitNameEn: line.unitNameEn ?? null,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          discountType: line.discount?.type ?? null,
          discountValue: line.discount?.value ?? 0,
          discountAmount: line.discountAmount,
          taxPercentage: line.taxPercentage ?? 0,
          taxAmount: line.taxAmount ?? 0,
          subtotal: line.subtotal ?? 0,
          totalAmount: line.totalAmount ?? 0,
        })),
      },
      {
        userId: 'user-1',
        name: 'Sales Agent',
        role: 'SALES',
      },
      new Date(),
    );

    expect(draftSoResult.kind).toBe('READY');
    if (draftSoResult.kind === 'READY') {
      expect(draftSoResult.salesOrder.lines[0].itemName).toBe('Original Camera Name');
      expect(draftSoResult.salesOrder.lines[0].unitPrice).toBe(100);
      expect(draftSoResult.salesOrder.lines[0].itemName).not.toBe(updatedMasterCatalogItem.name);
      expect(draftSoResult.salesOrder.lines[0].unitPrice).not.toBe(updatedMasterCatalogItem.salePrice);
    }
  });
});
