import { UniversalBrand } from "./UniversalBrand";

export interface UniversalProductFamilyProps {
  id: string;
  brandId?: string | null;
  code?: string | null;
  name: string;
  nameAr?: string | null;
  nameEn?: string | null;
  description?: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  brand?: UniversalBrand | null;
}

export class UniversalProductFamily {
  public readonly id: string;
  public readonly brandId: string | null;
  public readonly code: string | null;
  public readonly name: string;
  public readonly nameAr: string | null;
  public readonly nameEn: string | null;
  public readonly description: string | null;
  public readonly isActive: boolean;
  public readonly createdAt: Date;
  public readonly updatedAt: Date;
  public readonly brand: UniversalBrand | null;

  constructor(props: UniversalProductFamilyProps) {
    this.id = props.id;
    this.brandId = props.brandId ?? null;
    this.code = props.code ?? null;
    this.name = props.name;
    this.nameAr = props.nameAr ?? null;
    this.nameEn = props.nameEn ?? null;
    this.description = props.description ?? null;
    this.isActive = props.isActive;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
    this.brand = props.brand ?? null;
  }
}
