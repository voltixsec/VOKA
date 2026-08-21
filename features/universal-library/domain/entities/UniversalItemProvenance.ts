import { UniversalSource } from "./UniversalSource";

export interface UniversalItemProvenanceProps {
  id: string;
  universalItemId: string;
  sourceId: string;
  externalRef?: string | null;
  confidence?: number | null;
  observedAt: Date;
  createdAt: Date;
  updatedAt: Date;
  source?: UniversalSource | null;
}

export class UniversalItemProvenance {
  public readonly id: string;
  public readonly universalItemId: string;
  public readonly sourceId: string;
  public readonly externalRef: string | null;
  public readonly confidence: number | null;
  public readonly observedAt: Date;
  public readonly createdAt: Date;
  public readonly updatedAt: Date;
  public readonly source: UniversalSource | null;

  constructor(props: UniversalItemProvenanceProps) {
    this.id = props.id;
    this.universalItemId = props.universalItemId;
    this.sourceId = props.sourceId;
    this.externalRef = props.externalRef ?? null;
    this.confidence = props.confidence ?? null;
    this.observedAt = props.observedAt;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
    this.source = props.source ?? null;
  }
}
