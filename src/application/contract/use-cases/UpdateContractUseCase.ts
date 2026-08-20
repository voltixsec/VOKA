import { CommercialDocumentProvenance } from "../../../domain/commercial";
import { Contract } from "../../../domain/contract";
import { PricingService } from "../../pricing/services/PricingService";
import type { CustomerRepository } from "../../../../features/customers/domain/repositories";
import type { UpdateContractDto } from "../dto/UpdateContractDto";
import type { IContractReferenceResolver } from "../repositories/IContractReferenceResolver";
import type { IContractRepository } from "../repositories/IContractRepository";

export type UpdateContractReferenceErrorCode =
  | "CONTRACT_NOT_FOUND"
  | "CUSTOMER_NOT_FOUND"
  | "CATALOG_ITEM_NOT_FOUND"
  | "PRICE_LIST_NOT_FOUND"
  | "TAX_RATE_NOT_FOUND";

export class UpdateContractReferenceError extends Error {
  readonly name = "UpdateContractReferenceError";

  constructor(
    readonly code: UpdateContractReferenceErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export class UpdateContractUseCase {
  constructor(
    private readonly contractRepository: IContractRepository,
    private readonly customerRepository: CustomerRepository,
    private readonly referenceResolver: IContractReferenceResolver,
    private readonly pricingService: PricingService,
  ) {}

  async execute(dto: UpdateContractDto): Promise<Contract> {
    const existing = await this.contractRepository.findById(
      dto.companyId,
      dto.contractId,
    );

    if (!existing) {
      throw new UpdateContractReferenceError(
        "CONTRACT_NOT_FOUND",
        "Contract was not found for the active company.",
      );
    }

    const customerId = dto.customerId?.trim() || existing.customerId;
    let customerSnapshot = existing.customer;

    if (customerId !== existing.customerId) {
      const customer = await this.customerRepository.findByIdAndCompanyId(
        customerId,
        dto.companyId,
      );

      if (!customer) {
        throw new UpdateContractReferenceError(
          "CUSTOMER_NOT_FOUND",
          "Customer was not found for the active company.",
        );
      }

      customerSnapshot = {
        name: customer.name,
        nameAr: customer.nameAr,
        nameEn: customer.nameEn,
        email: customer.email,
        phone: customer.phone,
        taxNumber: customer.taxNumber,
        billingAddress: customer.addressLine1,
      };
    }

    const currencyCode =
      dto.currencyCode?.trim().toUpperCase() || existing.currencyCode;

    const priceListId =
      dto.priceListId !== undefined
        ? dto.priceListId?.trim() || null
        : existing.priceListId;

    if (priceListId) {
      const priceListAvailable =
        await this.referenceResolver.isPriceListAvailable({
          companyId: dto.companyId,
          priceListId,
          currencyCode,
        });

      if (!priceListAvailable) {
        throw new UpdateContractReferenceError(
          "PRICE_LIST_NOT_FOUND",
          "Price list was not found for the active company and currency.",
        );
      }
    }

    const linesInput = dto.lines ?? existing.lines;

    const canonicalLines = await Promise.all(
      linesInput.map(async (line) => {
        const catalogItemId = line.catalogItemId?.trim() || null;
        const requestedTaxRateId = line.taxRateId?.trim() || null;

        if (catalogItemId) {
          const catalogItem =
            await this.referenceResolver.getCatalogItemSnapshot(
              dto.companyId,
              catalogItemId,
            );

          if (!catalogItem) {
            throw new UpdateContractReferenceError(
              "CATALOG_ITEM_NOT_FOUND",
              "Catalog item was not found for the active company.",
            );
          }

          const taxRateId =
            requestedTaxRateId ?? catalogItem.defaultTaxRateId;

          let taxPercentage = 0;

          if (taxRateId) {
            const resolvedTaxPercentage =
              await this.referenceResolver.resolveTaxRatePercentage(
                dto.companyId,
                taxRateId,
              );

            if (resolvedTaxPercentage === null) {
              throw new UpdateContractReferenceError(
                "TAX_RATE_NOT_FOUND",
                "Tax rate was not found for the active company.",
              );
            }

            taxPercentage = resolvedTaxPercentage;
          }

          const resolvedPrice =
            await this.pricingService.resolveUnitPrice({
              companyId: dto.companyId,
              priceListId: priceListId ?? "",
              catalogItemId,
              quantity: line.quantity,
            });

          return {
            id: line.id,
            catalogItemId,
            taxRateId,
            position: line.position,

            type: catalogItem.type,
            itemCode: catalogItem.itemCode,
            itemName: catalogItem.itemName,
            itemNameAr: catalogItem.itemNameAr,
            itemNameEn: catalogItem.itemNameEn,

            description:
              line.description ?? catalogItem.description,
            descriptionAr:
              line.descriptionAr ?? catalogItem.descriptionAr,
            descriptionEn:
              line.descriptionEn ?? catalogItem.descriptionEn,

            unitName: catalogItem.unitName,
            unitNameAr: catalogItem.unitNameAr,
            unitNameEn: catalogItem.unitNameEn,

            quantity: line.quantity,
            unitPrice: resolvedPrice.unitPrice,

            discountType: line.discountType,
            discountValue: line.discountValue ?? 0,
            discountAmount: 0,

            taxPercentage,
            taxAmount: 0,
            subtotal: 0,
            totalAmount: 0,
          };
        }

        let taxPercentage = 0;

        if (requestedTaxRateId) {
          const resolvedTaxPercentage =
            await this.referenceResolver.resolveTaxRatePercentage(
              dto.companyId,
              requestedTaxRateId,
            );

          if (resolvedTaxPercentage === null) {
            throw new UpdateContractReferenceError(
              "TAX_RATE_NOT_FOUND",
              "Tax rate was not found for the active company.",
            );
          }

          taxPercentage = resolvedTaxPercentage;
        }

        return {
          id: line.id,
          catalogItemId: null,
          taxRateId: requestedTaxRateId,
          position: line.position,
          type: line.type,
          itemCode: line.itemCode,
          itemName: line.itemName,
          itemNameAr: line.itemNameAr,
          itemNameEn: line.itemNameEn,
          description: line.description,
          descriptionAr: line.descriptionAr,
          descriptionEn: line.descriptionEn,
          unitName: line.unitName,
          unitNameAr: line.unitNameAr,
          unitNameEn: line.unitNameEn,
          quantity: line.quantity,
          unitPrice: line.unitPrice,

          discountType: line.discountType,
          discountValue: line.discountValue ?? 0,
          discountAmount: 0,

          taxPercentage,
          taxAmount: 0,
          subtotal: 0,
          totalAmount: 0,
        };
      }),
    );

    const contractDate = dto.contractDate !== undefined
      ? (dto.contractDate ? new Date(dto.contractDate) : new Date())
      : existing.contractDate;

    const startDate = dto.startDate !== undefined
      ? (dto.startDate ? new Date(dto.startDate) : null)
      : existing.startDate;

    const endDate = dto.endDate !== undefined
      ? (dto.endDate ? new Date(dto.endDate) : null)
      : existing.endDate;

    const milestonesInput = dto.milestones !== undefined
      ? dto.milestones
      : existing.milestones;

    const milestones = (milestonesInput || []).map((milestone) => ({
      ...milestone,
      dueDate: milestone.dueDate ? new Date(milestone.dueDate) : null,
    }));

    const updatedContract = Contract.restore({
      id: existing.id,
      companyId: dto.companyId,
      number: existing.number.value,
      status: existing.status,
      provenance: existing.provenance,
      customerId,
      priceListId,
      currencyCode,
      contractDate,
      startDate,
      endDate,
      customer: customerSnapshot,

      subjectAr: dto.subjectAr !== undefined ? dto.subjectAr : existing.subjectAr,
      subjectEn: dto.subjectEn !== undefined ? dto.subjectEn : existing.subjectEn,
      briefAr: dto.briefAr !== undefined ? dto.briefAr : existing.briefAr,
      briefEn: dto.briefEn !== undefined ? dto.briefEn : existing.briefEn,
      projectName: dto.projectName !== undefined ? dto.projectName : existing.projectName,
      projectNameAr: dto.projectNameAr !== undefined ? dto.projectNameAr : existing.projectNameAr,
      projectNameEn: dto.projectNameEn !== undefined ? dto.projectNameEn : existing.projectNameEn,
      attentionName: dto.attentionName !== undefined ? dto.attentionName : existing.attentionName,
      attentionNameAr: dto.attentionNameAr !== undefined ? dto.attentionNameAr : existing.attentionNameAr,
      attentionNameEn: dto.attentionNameEn !== undefined ? dto.attentionNameEn : existing.attentionNameEn,
      scopeType: dto.scopeType !== undefined ? dto.scopeType : existing.scopeType,
      discountType: dto.discountType !== undefined ? dto.discountType : existing.discountType,
      discountValue: dto.discountValue !== undefined ? dto.discountValue : existing.discountValue,

      lines: canonicalLines,
      milestones,

      notes: dto.notes !== undefined ? dto.notes : existing.notes,
      notesAr: dto.notesAr !== undefined ? dto.notesAr : existing.notesAr,
      notesEn: dto.notesEn !== undefined ? dto.notesEn : existing.notesEn,
      termsAndConditions: dto.termsAndConditions !== undefined ? dto.termsAndConditions : existing.termsAndConditions,
      termsAndConditionsAr: dto.termsAndConditionsAr !== undefined ? dto.termsAndConditionsAr : existing.termsAndConditionsAr,
      termsAndConditionsEn: dto.termsAndConditionsEn !== undefined ? dto.termsAndConditionsEn : existing.termsAndConditionsEn,

      createdByUserId: existing.createdByUserId,
      createdByName: dto.actor.name || existing.createdByName,
      createdByRole: dto.actor.role || existing.createdByRole,
      createdAt: existing.createdAt,
    });

    return await this.contractRepository.save(updatedContract);
  }
}
