import { UniversalAttributeDefinition } from "./UniversalAttributeDefinition";

export interface UniversalItemAttributeValueProps {
  id: string;
  universalItemId: string;
  attributeDefinitionId: string;
  valueString?: string | null;
  valueNumber?: number | string | { toNumber(): number } | null;
  valueBoolean?: boolean | null;
  valueJson?: unknown | null;
  unit?: string | null;
  createdAt: Date;
  updatedAt: Date;
  attributeDefinition?: UniversalAttributeDefinition | null;
}

export class UniversalItemAttributeValue {
  public readonly id: string;
  public readonly universalItemId: string;
  public readonly attributeDefinitionId: string;
  public readonly valueString: string | null;
  public readonly valueNumber: number | null;
  public readonly valueBoolean: boolean | null;
  public readonly valueJson: unknown | null;
  public readonly unit: string | null;
  public readonly createdAt: Date;
  public readonly updatedAt: Date;
  public readonly attributeDefinition: UniversalAttributeDefinition | null;

  constructor(props: UniversalItemAttributeValueProps) {
    this.id = props.id;
    this.universalItemId = props.universalItemId;
    this.attributeDefinitionId = props.attributeDefinitionId;
    this.valueString = props.valueString ?? null;
    this.valueNumber =
      props.valueNumber != null
        ? typeof props.valueNumber === "number"
          ? props.valueNumber
          : typeof props.valueNumber === "string"
          ? Number(props.valueNumber)
          : props.valueNumber.toNumber()
        : null;
    this.valueBoolean = props.valueBoolean ?? null;
    this.valueJson = props.valueJson ?? null;
    this.unit = props.unit ?? null;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
    this.attributeDefinition = props.attributeDefinition ?? null;
  }
}
