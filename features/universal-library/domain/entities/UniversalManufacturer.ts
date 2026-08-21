export interface UniversalManufacturerProps {
  id: string;
  code?: string | null;
  name: string;
  nameAr?: string | null;
  nameEn?: string | null;
  countryCode?: string | null;
  websiteUrl?: string | null;
  description?: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class UniversalManufacturer {
  public readonly id: string;
  public readonly code: string | null;
  public readonly name: string;
  public readonly nameAr: string | null;
  public readonly nameEn: string | null;
  public readonly countryCode: string | null;
  public readonly websiteUrl: string | null;
  public readonly description: string | null;
  public readonly isActive: boolean;
  public readonly createdAt: Date;
  public readonly updatedAt: Date;

  constructor(props: UniversalManufacturerProps) {
    this.id = props.id;
    this.code = props.code ?? null;
    this.name = props.name;
    this.nameAr = props.nameAr ?? null;
    this.nameEn = props.nameEn ?? null;
    this.countryCode = props.countryCode ?? null;
    this.websiteUrl = props.websiteUrl ?? null;
    this.description = props.description ?? null;
    this.isActive = props.isActive;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }
}
