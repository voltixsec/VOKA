import type { UniversalAttributeDataType } from "@/lib/generated/prisma/client";
import { UniversalCategory } from "./UniversalCategory";

export interface UniversalAttributeDefinitionProps {
  id: string;
  categoryId?: string | null;
  code: string;
  name: string;
  nameAr?: string | null;
  nameEn?: string | null;
  dataType: UniversalAttributeDataType;
  unitOfMeasure?: string | null;
  description?: string | null;
  isRequired: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  category?: UniversalCategory | null;
}

export class UniversalAttributeDefinition {
  public readonly id: string;
  public readonly categoryId: string | null;
  public readonly code: string;
  public readonly name: string;
  public readonly nameAr: string | null;
  public readonly nameEn: string | null;
  public readonly dataType: UniversalAttributeDataType;
  public readonly unitOfMeasure: string | null;
  public readonly description: string | null;
  public readonly isRequired: boolean;
  public readonly isActive: boolean;
  public readonly createdAt: Date;
  public readonly updatedAt: Date;
  public readonly category: UniversalCategory | null;

  constructor(props: UniversalAttributeDefinitionProps) {
    this.id = props.id;
    this.categoryId = props.categoryId ?? null;
    this.code = props.code;
    this.name = props.name;
    this.nameAr = props.nameAr ?? null;
    this.nameEn = props.nameEn ?? null;
    this.dataType = props.dataType;
    this.unitOfMeasure = props.unitOfMeasure ?? null;
    this.description = props.description ?? null;
    this.isRequired = props.isRequired;
    this.isActive = props.isActive;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
    this.category = props.category ?? null;
  }
}
