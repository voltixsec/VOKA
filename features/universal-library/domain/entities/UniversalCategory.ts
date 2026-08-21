export interface UniversalCategoryProps {
  id: string;
  parentId?: string | null;
  code?: string | null;
  name: string;
  nameAr?: string | null;
  nameEn?: string | null;
  description?: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  children?: UniversalCategory[];
  parent?: UniversalCategory | null;
}

export class UniversalCategory {
  public readonly id: string;
  public readonly parentId: string | null;
  public readonly code: string | null;
  public readonly name: string;
  public readonly nameAr: string | null;
  public readonly nameEn: string | null;
  public readonly description: string | null;
  public readonly isActive: boolean;
  public readonly createdAt: Date;
  public readonly updatedAt: Date;
  public readonly children: UniversalCategory[];
  public readonly parent: UniversalCategory | null;

  constructor(props: UniversalCategoryProps) {
    if (props.parentId && props.parentId === props.id) {
      throw new Error("INVALID_CATEGORY_HIERARCHY: Category cannot be its own parent.");
    }
    this.id = props.id;
    this.parentId = props.parentId ?? null;
    this.code = props.code ?? null;
    this.name = props.name;
    this.nameAr = props.nameAr ?? null;
    this.nameEn = props.nameEn ?? null;
    this.description = props.description ?? null;
    this.isActive = props.isActive;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
    this.children = props.children ?? [];
    this.parent = props.parent ?? null;
  }
}
