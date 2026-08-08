import { QuotationDomainError } from "../errors/QuotationDomainError";

export interface CustomerSnapshotProps {
  name: string;
  nameAr?: string | null;
  nameEn?: string | null;
  email?: string | null;
  phone?: string | null;
  taxNumber?: string | null;
  billingAddress?: string | null;
}

export class CustomerSnapshot {
  public readonly name: string;
  public readonly nameAr: string | null;
  public readonly nameEn: string | null;
  public readonly email: string | null;
  public readonly phone: string | null;
  public readonly taxNumber: string | null;
  public readonly billingAddress: string | null;

  constructor(props: CustomerSnapshotProps) {
    const name = props.name.trim();

    if (!name) {
      throw new QuotationDomainError("Customer name is required.");
    }

    this.name = name;
    this.nameAr =
      props.nameAr?.trim() || null;
    this.nameEn =
      props.nameEn?.trim() || null;
    this.email = props.email?.trim() || null;
    this.phone = props.phone?.trim() || null;
    this.taxNumber = props.taxNumber?.trim() || null;
    this.billingAddress = props.billingAddress?.trim() || null;
  }

  toJSON(): CustomerSnapshotProps {
    return {
      name: this.name,
      nameAr: this.nameAr,
      nameEn: this.nameEn,
      email: this.email,
      phone: this.phone,
      taxNumber: this.taxNumber,
      billingAddress: this.billingAddress,
    };
  }
}