import { CatalogItem } from "../../../catalog";

export interface UniversalItemAdoptionProps {
  id: string;
  companyId: string;
  universalItemId: string;
  catalogItemId: string;
  adoptedByUserId?: string | null;
  adoptedAt: Date;
  catalogItem?: CatalogItem | null;
}

export class UniversalItemAdoption {
  public readonly id: string;
  public readonly companyId: string;
  public readonly universalItemId: string;
  public readonly catalogItemId: string;
  public readonly adoptedByUserId: string | null;
  public readonly adoptedAt: Date;
  public readonly catalogItem: CatalogItem | null;

  constructor(props: UniversalItemAdoptionProps) {
    this.id = props.id;
    this.companyId = props.companyId;
    this.universalItemId = props.universalItemId;
    this.catalogItemId = props.catalogItemId;
    this.adoptedByUserId = props.adoptedByUserId ?? null;
    this.adoptedAt = props.adoptedAt;
    this.catalogItem = props.catalogItem ?? null;
  }
}
