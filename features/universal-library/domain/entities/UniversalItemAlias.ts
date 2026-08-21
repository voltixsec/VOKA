import type { UniversalAliasType, Locale } from "@/lib/generated/prisma/client";

export interface UniversalItemAliasProps {
  id: string;
  universalItemId: string;
  alias: string;
  locale?: Locale | null;
  aliasType: UniversalAliasType;
  createdAt: Date;
  updatedAt: Date;
}

export class UniversalItemAlias {
  public readonly id: string;
  public readonly universalItemId: string;
  public readonly alias: string;
  public readonly locale: Locale | null;
  public readonly aliasType: UniversalAliasType;
  public readonly createdAt: Date;
  public readonly updatedAt: Date;

  constructor(props: UniversalItemAliasProps) {
    this.id = props.id;
    this.universalItemId = props.universalItemId;
    this.alias = props.alias;
    this.locale = props.locale ?? null;
    this.aliasType = props.aliasType;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }
}
