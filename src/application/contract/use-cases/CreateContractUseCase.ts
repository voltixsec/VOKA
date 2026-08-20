import { CommercialDocumentProvenance } from "../../../domain/commercial";
import { Contract } from "../../../domain/contract";
import type { CustomerRepository } from "../../../../features/customers/domain/repositories";
import type { CreateContractDto } from "../dto/CreateContractDto";
import type { IContractRepository } from "../repositories/IContractRepository";

export class CreateContractUseCase {
  constructor(
    private readonly contractRepository: IContractRepository,
    private readonly customerRepository: CustomerRepository,
  ) {}

  async execute(dto: CreateContractDto): Promise<Contract> {
    const customer = await this.customerRepository.findByIdAndCompanyId(
      dto.customerId,
      dto.companyId,
    );

    if (!customer) {
      throw new Error(`Customer with ID ${dto.customerId} not found.`);
    }

    const provenance = dto.provenance
      ? new CommercialDocumentProvenance(dto.provenance)
      : CommercialDocumentProvenance.direct();

    const number = await this.contractRepository.getNextContractNumber(
      dto.companyId,
    );

    const contractDate = dto.contractDate
      ? new Date(dto.contractDate)
      : new Date();
    const startDate = dto.startDate ? new Date(dto.startDate) : null;
    const endDate = dto.endDate ? new Date(dto.endDate) : null;

    const milestones = (dto.milestones || []).map((m) => ({
      ...m,
      dueDate: m.dueDate ? new Date(m.dueDate) : null,
    }));

    const contract = new Contract({
      companyId: dto.companyId,
      number,
      provenance,
      customerId: dto.customerId,
      priceListId: dto.priceListId,
      currencyCode: dto.currencyCode,
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
      lines: dto.lines.map((l) => ({
        catalogItemId: l.catalogItemId,
        taxRateId: l.taxRateId,
        position: l.position,
        type: l.type,
        itemCode: l.itemCode,
        itemName: l.itemName,
        itemNameAr: l.itemNameAr,
        itemNameEn: l.itemNameEn,
        description: l.description,
        descriptionAr: l.descriptionAr,
        descriptionEn: l.descriptionEn,
        unitName: l.unitName,
        unitNameAr: l.unitNameAr,
        unitNameEn: l.unitNameEn,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        discountType: l.discountType,
        discountValue: l.discountValue ?? 0,
        discountAmount: 0,
        taxPercentage: l.taxPercentage ?? 0,
        taxAmount: 0,
        subtotal: 0,
        totalAmount: 0,
      })),
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
