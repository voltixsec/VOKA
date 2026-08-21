import type { UniversalIdentifierType } from "@/lib/generated/prisma/client";

export interface UniversalItemIdentifierProps {
  id: string;
  universalItemId: string;
  identifierType: UniversalIdentifierType;
  value: string;
  normalizedValue: string;
  manufacturerId?: string | null;
  source?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class UniversalItemIdentifier {
  public readonly id: string;
  public readonly universalItemId: string;
  public readonly identifierType: UniversalIdentifierType;
  public readonly value: string;
  public readonly normalizedValue: string;
  public readonly manufacturerId: string | null;
  public readonly source: string | null;
  public readonly createdAt: Date;
  public readonly updatedAt: Date;

  constructor(props: UniversalItemIdentifierProps) {
    this.id = props.id;
    this.universalItemId = props.universalItemId;
    this.identifierType = props.identifierType;
    this.value = props.value;
    this.normalizedValue = props.normalizedValue;
    this.manufacturerId = props.manufacturerId ?? null;
    this.source = props.source ?? null;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }
}
