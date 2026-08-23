import { LocalizedContentStatus } from "../types/LocalizedContentStatus";

export type LocalizedContentProps = {
  id: string;
  companyId?: string | null;
  resourceType: string;
  resourceId: string;
  fieldKey: string;
  locale: string;
  sourceLocale: string;
  text: string;
  status: LocalizedContentStatus;
  sourceHash?: string | null;
  provider?: string | null;
  model?: string | null;
  translatedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export class LocalizedContent {
  readonly id: string;
  readonly companyId: string | null;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly fieldKey: string;
  readonly locale: string;
  readonly sourceLocale: string;
  readonly text: string;
  readonly status: LocalizedContentStatus;
  readonly sourceHash: string | null;
  readonly provider: string | null;
  readonly model: string | null;
  readonly translatedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(props: LocalizedContentProps) {
    this.id = props.id;
    this.companyId = props.companyId ?? null;
    this.resourceType = props.resourceType;
    this.resourceId = props.resourceId;
    this.fieldKey = props.fieldKey;
    this.locale = props.locale;
    this.sourceLocale = props.sourceLocale;
    this.text = props.text;
    this.status = props.status;
    this.sourceHash = props.sourceHash ?? null;
    this.provider = props.provider ?? null;
    this.model = props.model ?? null;
    this.translatedAt = props.translatedAt ?? null;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }
}
