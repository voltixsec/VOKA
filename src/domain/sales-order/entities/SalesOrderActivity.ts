import { SalesOrderDomainError } from "../errors/SalesOrderDomainError";

export type SalesOrderActivityProps = {
  id?: string;
  companyId: string;
  salesOrderId: string;
  body: string;
  actorUserId?: string | null;
  actorName: string;
  actorRole: string;
  createdAt?: Date;
};

export class SalesOrderActivity {
  public readonly id?: string;
  public readonly companyId: string;
  public readonly salesOrderId: string;
  public readonly body: string;
  public readonly actorUserId: string | null;
  public readonly actorName: string;
  public readonly actorRole: string;
  public readonly createdAt: Date;

  constructor(props: SalesOrderActivityProps) {
    this.id = props.id?.trim() || undefined;

    const companyId = props.companyId?.trim();
    if (!companyId) {
      throw new SalesOrderDomainError("Company id is required for activity entry.");
    }
    this.companyId = companyId;

    const salesOrderId = props.salesOrderId?.trim();
    if (!salesOrderId) {
      throw new SalesOrderDomainError("Sales Order id is required for activity entry.");
    }
    this.salesOrderId = salesOrderId;

    const trimmedBody = props.body?.trim();
    if (!trimmedBody) {
      throw new SalesOrderDomainError("Activity note body cannot be blank.");
    }
    if (trimmedBody.length > 2000) {
      throw new SalesOrderDomainError("Activity note body exceeds maximum length of 2000 characters.");
    }
    this.body = trimmedBody;

    this.actorUserId = props.actorUserId?.trim() || null;

    const actorName = props.actorName?.trim();
    if (!actorName) {
      throw new SalesOrderDomainError("Actor name is required for activity entry.");
    }
    this.actorName = actorName;

    const actorRole = props.actorRole?.trim();
    if (!actorRole) {
      throw new SalesOrderDomainError("Actor role is required for activity entry.");
    }
    this.actorRole = actorRole;

    this.createdAt = props.createdAt ?? new Date();
  }

  static restore(props: SalesOrderActivityProps): SalesOrderActivity {
    if (!props.id?.trim()) {
      throw new SalesOrderDomainError("Activity id is required when restoring activity from persistence.");
    }
    return new SalesOrderActivity(props);
  }
}
