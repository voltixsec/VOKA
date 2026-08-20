import { ContractDomainError } from "../errors/ContractDomainError";

export enum MilestoneAmountType {
  PERCENTAGE = "PERCENTAGE",
  FIXED_AMOUNT = "FIXED_AMOUNT",
}

export interface ContractMilestoneProps {
  id?: string;
  contractId?: string;
  position: number;
  title: string;
  titleAr?: string | null;
  titleEn?: string | null;
  description?: string | null;
  descriptionAr?: string | null;
  descriptionEn?: string | null;
  amountType: MilestoneAmountType | `${MilestoneAmountType}`;
  percentage?: number | null;
  fixedAmount?: number | null;
  dueDate?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export class ContractMilestone {
  public readonly id?: string;
  public readonly contractId?: string;
  public readonly position: number;
  public readonly title: string;
  public readonly titleAr: string | null;
  public readonly titleEn: string | null;
  public readonly description: string | null;
  public readonly descriptionAr: string | null;
  public readonly descriptionEn: string | null;
  public readonly amountType: MilestoneAmountType;
  public readonly percentage: number | null;
  public readonly fixedAmount: number | null;
  public readonly dueDate: Date | null;
  public readonly createdAt?: Date;
  public readonly updatedAt?: Date;

  constructor(props: ContractMilestoneProps) {
    this.id = props.id?.trim() || undefined;
    this.contractId = props.contractId?.trim() || undefined;

    if (!Number.isInteger(props.position) || props.position < 1) {
      throw new ContractDomainError("Milestone position must be an integer >= 1.");
    }
    this.position = props.position;

    const title = props.title?.trim();
    if (!title) {
      throw new ContractDomainError("Milestone title is required.");
    }
    this.title = title;
    this.titleAr = props.titleAr?.trim() || null;
    this.titleEn = props.titleEn?.trim() || null;

    this.description = props.description?.trim() || null;
    this.descriptionAr = props.descriptionAr?.trim() || null;
    this.descriptionEn = props.descriptionEn?.trim() || null;

    const amountTypeStr = props.amountType?.toString().trim().toUpperCase();
    if (
      !amountTypeStr ||
      !Object.values(MilestoneAmountType).includes(amountTypeStr as MilestoneAmountType)
    ) {
      throw new ContractDomainError(`Invalid milestone amount type: ${props.amountType}`);
    }
    this.amountType = amountTypeStr as MilestoneAmountType;

    if (this.amountType === MilestoneAmountType.PERCENTAGE) {
      if (
        props.percentage === null ||
        props.percentage === undefined ||
        !Number.isFinite(props.percentage) ||
        props.percentage <= 0 ||
        props.percentage > 100
      ) {
        throw new ContractDomainError("Percentage milestone requires percentage > 0 and <= 100.");
      }
      this.percentage = props.percentage;
      this.fixedAmount = null;
    } else {
      if (
        props.fixedAmount === null ||
        props.fixedAmount === undefined ||
        !Number.isFinite(props.fixedAmount) ||
        props.fixedAmount < 0
      ) {
        throw new ContractDomainError("Fixed amount milestone requires fixedAmount >= 0.");
      }
      this.fixedAmount = props.fixedAmount;
      this.percentage = null;
    }

    if (props.dueDate) {
      if (!(props.dueDate instanceof Date) || Number.isNaN(props.dueDate.getTime())) {
        throw new ContractDomainError("Milestone dueDate is invalid.");
      }
      this.dueDate = props.dueDate;
    } else {
      this.dueDate = null;
    }

    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  public toSnapshot(): Readonly<ContractMilestoneProps> {
    return Object.freeze({
      id: this.id,
      contractId: this.contractId,
      position: this.position,
      title: this.title,
      titleAr: this.titleAr,
      titleEn: this.titleEn,
      description: this.description,
      descriptionAr: this.descriptionAr,
      descriptionEn: this.descriptionEn,
      amountType: this.amountType,
      percentage: this.percentage,
      fixedAmount: this.fixedAmount,
      dueDate: this.dueDate,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    });
  }
}
