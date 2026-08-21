export type VerificationStatus =
  | "UNVERIFIED"
  | "SOURCE_VERIFIED"
  | "CROSS_VERIFIED"
  | "CURATED"
  | "DEPRECATED";

export interface UniversalSourceProps {
  id: string;
  name: string;
  type: string;
  externalRef?: string | null;
  url?: string | null;
  licenseInfo?: string | null;
  verificationStatus: VerificationStatus;
  isActive?: boolean;
  trustScore?: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export class UniversalSource {
  public readonly id: string;
  public readonly name: string;
  public readonly type: string;
  public readonly externalRef: string | null;
  public readonly url: string | null;
  public readonly licenseInfo: string | null;
  public readonly verificationStatus: VerificationStatus;
  public readonly isActive: boolean;
  public readonly trustScore: number | null;
  public readonly createdAt: Date;
  public readonly updatedAt: Date;

  constructor(props: UniversalSourceProps) {
    this.id = props.id;
    this.name = props.name;
    this.type = props.type;
    this.externalRef = props.externalRef ?? null;
    this.url = props.url ?? null;
    this.licenseInfo = props.licenseInfo ?? null;
    this.verificationStatus = props.verificationStatus;
    this.isActive = props.isActive ?? true;
    this.trustScore = props.trustScore !== undefined ? props.trustScore : null;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }
}
