import { UniversalManufacturer } from "./UniversalManufacturer";

export interface UniversalBrandProps {
  id: string;
  manufacturerId?: string | null;
  code?: string | null;
  name: string;
  nameAr?: string | null;
  nameEn?: string | null;
  logoUrl?: string | null;
  description?: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  manufacturer?: UniversalManufacturer | null;
}

export class UniversalBrand {
  public readonly id: string;
  public readonly manufacturerId: string | null;
  public readonly code: string | null;
  public readonly name: string;
  public readonly nameAr: string | null;
  public readonly nameEn: string | null;
  public readonly logoUrl: string | null;
  public readonly description: string | null;
  public readonly isActive: boolean;
  public readonly createdAt: Date;
  public readonly updatedAt: Date;
  public readonly manufacturer: UniversalManufacturer | null;

  constructor(props: UniversalBrandProps) {
    this.id = props.id;
    this.manufacturerId = props.manufacturerId ?? null;
    this.code = props.code ?? null;
    this.name = props.name;
    this.nameAr = props.nameAr ?? null;
    this.nameEn = props.nameEn ?? null;
    this.logoUrl = props.logoUrl ?? null;
    this.description = props.description ?? null;
    this.isActive = props.isActive;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
    this.manufacturer = props.manufacturer ?? null;
  }
}
