import { CatalogItemType } from "../../../catalog";
import { UniversalCategory } from "./UniversalCategory";
import { UniversalItemProvenance } from "./UniversalItemProvenance";

export interface UniversalCatalogItemProps {
  id: string;
  type: CatalogItemType;
  name: string;
  nameAr?: string | null;
  nameEn?: string | null;
  searchName?: string | null;
  description?: string | null;
  descriptionAr?: string | null;
  descriptionEn?: string | null;
  categoryId?: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  category?: UniversalCategory | null;
  provenances?: UniversalItemProvenance[];
}

export class UniversalCatalogItem {
  public readonly id: string;
  public readonly type: CatalogItemType;
  public readonly name: string;
  public readonly nameAr: string | null;
  public readonly nameEn: string | null;
  public readonly searchName: string | null;
  public readonly description: string | null;
  public readonly descriptionAr: string | null;
  public readonly descriptionEn: string | null;
  public readonly categoryId: string | null;
  public readonly isActive: boolean;
  public readonly createdAt: Date;
  public readonly updatedAt: Date;
  public readonly category: UniversalCategory | null;
  public readonly provenances: UniversalItemProvenance[];

  constructor(props: UniversalCatalogItemProps) {
    this.id = props.id;
    this.type = props.type;
    this.name = props.name;
    this.nameAr = props.nameAr ?? null;
    this.nameEn = props.nameEn ?? null;
    this.searchName = props.searchName ?? props.name.toLowerCase().trim();
    this.description = props.description ?? null;
    this.descriptionAr = props.descriptionAr ?? null;
    this.descriptionEn = props.descriptionEn ?? null;
    this.categoryId = props.categoryId ?? null;
    this.isActive = props.isActive;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
    this.category = props.category ?? null;
    this.provenances = props.provenances ?? [];
  }
}
