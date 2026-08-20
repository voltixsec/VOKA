import { CommercialDocumentProvenance } from "../../../domain/commercial";
import { Contract } from "../../../domain/contract";
import { PricingService } from "../../pricing/services/PricingService";
import type { CustomerRepository } from "../../../../features/customers/domain/repositories";
import type { CreateContractDto } from "../dto/CreateContractDto";
import type { IContractReferenceResolver } from "../repositories/IContractReferenceResolver";
import type { IContractRepository } from "../repositories/IContractRepository";

export type CreateContractReferenceErrorCode =
  | "CUSTOMER_NOT_FOUND"
  | "CATALOG_ITEM_NOT_FOUND"
  | "PRICE_LIST_NOT_FOUND"
  | "TAX_RATE_NOT_FOUND";

export class CreateContractReferenceError extends Error {
  readonly name = "CreateContractReferenceError";

  constructor(
    readonly code: CreateContractReferenceErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export class CreateContractUseCase {
  constructor(
    private readonly contractRepository: IContractRepository,
    private readonly customerRepository: CustomerRepository,
    private readonly referenceResolver: IContractReferenceResolver,
    private readonly pricingService: PricingService,
  ) {}

  async execute(dto: CreateContractDto): Promise<Contract> {
    const customer = await this.customerRepository.findByIdAndCompanyId(
      dto.customerId,
      dto.companyId,
    );

    if (!customer) {
      throw new CreateContractReferenceError(
        "CUSTOMER_NOT_FOUND",
        "Customer was not found for the active company.",
      );
    }

    const provenance = CommercialDocumentProvenance.direct();

    const currencyCode =
      dto.currencyCode?.trim().toUpperCase() || "KWD";

    const priceListId = dto.priceListId?.trim() || null;

    if (priceListId) {
      const priceListAvailable =
        await this.referenceResolver.isPriceListAvailable({
          companyId: dto.companyId,
          priceListId,
          currencyCode,
        });

      if (!priceListAvailable) {
        throw new CreateContractReferenceError(
          "PRICE_LIST_NOT_FOUND",
          "Price list was not found for the active company and currency.",
        );
      }
    }

    const canonicalLines = await Promise.all(
      dto.lines.map(async (line) => {
        const catalogItemId =
          line.catalogItemId?.trim() || null;

        const requestedTaxRateId =
          line.taxRateId?.trim() || null;

        if (catalogItemId) {
          const catalogItem =
            await this.referenceResolver.getCatalogItemSnapshot(
              dto.companyId,
              catalogItemId,
            );

          if (!catalogItem) {
            throw new CreateContractReferenceError(
              "CATALOG_ITEM_NOT_FOUND",
              "Catalog item was not found for the active company.",
            );
          }

          const taxRateId =
            requestedTaxRateId ??
            catalogItem.defaultTaxRateId;

          let taxPercentage = 0;

          if (taxRateId) {
            const resolvedTaxPercentage =
              await this.referenceResolver.resolveTaxRatePercentage(
                dto.companyId,
                taxRateId,
              );

            if (resolvedTaxPercentage === null) {
              throw new CreateContractReferenceError(
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
            catalogItemId,
            taxRateId,
            position: line.position,

            // Master-data identity is server authoritative.
            type: catalogItem.type,
            itemCode: catalogItem.itemCode,
            itemName: catalogItem.itemName,
            itemNameAr: catalogItem.itemNameAr,
            itemNameEn: catalogItem.itemNameEn,

            // Description may be customized per commercial document.
            description:
              line.description ??
              catalogItem.description,
            descriptionAr:
              line.descriptionAr ??
              catalogItem.descriptionAr,
            descriptionEn:
              line.descriptionEn ??
              catalogItem.descriptionEn,

            unitName: catalogItem.unitName,
            unitNameAr: catalogItem.unitNameAr,
            unitNameEn: catalogItem.unitNameEn,

            quantity: line.quantity,

            // Client unitPrice is ignored for catalog-linked lines.
            unitPrice: resolvedPrice.unitPrice,

            discountType: line.discountType,
            discountValue: line.discountValue ?? 0,
            discountAmount: 0,

            // Client taxPercentage is ignored.
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
            throw new CreateContractReferenceError(
              "TAX_RATE_NOT_FOUND",
              "Tax rate was not found for the active company.",
            );
          }

          taxPercentage = resolvedTaxPercentage;
        }

        return {
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

          // Manual/custom lines are allowed to carry explicit price.
          unitPrice: line.unitPrice,

          discountType: line.discountType,
          discountValue: line.discountValue ?? 0,
          discountAmount: 0,

          // No arbitrary client tax percentage.
          taxPercentage,
          taxAmount: 0,
          subtotal: 0,
          totalAmount: 0,
        };
      }),
    );

    const number =
      await this.contractRepository.getNextContractNumber(
        dto.companyId,
      );

    const contractDate = dto.contractDate
      ? new Date(dto.contractDate)
      : new Date();

    const startDate = dto.startDate
      ? new Date(dto.startDate)
      : null;

    const endDate = dto.endDate
      ? new Date(dto.endDate)
      : null;

    const milestones = (dto.milestones || []).map(
      (milestone) => ({
        ...milestone,
        dueDate: milestone.dueDate
          ? new Date(milestone.dueDate)
          : null,
      }),
    );

    const contract = new Contract({
      companyId: dto.companyId,
      number,
      provenance,
      customerId: dto.customerId,
      priceListId,
      currencyCode,
      contractDate,
      startDate,
      endDate,

      customer: {
        name: customer.name,
        nameAr: customer.nameAr,
        nameEn: customer.nameEn,
        email: customer.email,
        phone: customer.phone,
        taxNumber: customer.taxNumber,
        billingAddress: customer.addressLine1,
      },

      subjectAr: dto.subjectAr,
      subjectEn: dto.subjectEn,
      briefAr: dto.briefAr,
      briefEn: dto.briefEn,
      projectName: dto.projectName,
      projectNameAr: dto.projectNameAr,
      projectNameEn: dto.projectNameEn,
      attentionName: dto.attentionName,
      attentionNameAr: dto.attentionNameAr,
      attentionNameEn: dto.attentionNameEn,
      scopeType: dto.scopeType,
      discountType: dto.discountType,
      discountValue: dto.discountValue,

      lines: canonicalLines,
      milestones,

      notes: dto.notes,
      notesAr: dto.notesAr,
      notesEn: dto.notesEn,
      termsAndConditions: dto.termsAndConditions,
      termsAndConditionsAr: dto.termsAndConditionsAr,
      termsAndConditionsEn: dto.termsAndConditionsEn,

      createdByUserId: dto.actor.userId,
      createdByName: dto.actor.name,
      createdByRole: dto.actor.role,
    });

    return await this.contractRepository.save(contract);
  }
}
