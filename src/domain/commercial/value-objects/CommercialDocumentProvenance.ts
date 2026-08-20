import { CommercialDomainError } from "../errors/CommercialDomainError";
import {
  CommercialDocumentKind,
  isCommercialDocumentKind,
} from "../types/CommercialDocumentKind";

export enum CommercialDocumentOrigin {
  DIRECT = "DIRECT",
  QUOTATION = "QUOTATION",
  SALES_ORDER = "SALES_ORDER",
  CONTRACT = "CONTRACT",
}

export type CommercialDocumentOriginType = `${CommercialDocumentOrigin}`;

export interface CommercialDocumentProvenanceProps {
  origin: CommercialDocumentOrigin | CommercialDocumentOriginType;
  sourceKind?: CommercialDocumentKind | `${CommercialDocumentKind}` | null;
  sourceId?: string | null;
}

export class CommercialDocumentProvenance {
  public readonly origin: CommercialDocumentOrigin;
  public readonly sourceKind: CommercialDocumentKind | null;
  public readonly sourceId: string | null;

  constructor(props: CommercialDocumentProvenanceProps) {
    const originStr = props.origin?.toString().trim().toUpperCase();
    if (!originStr || !Object.values(CommercialDocumentOrigin).includes(originStr as CommercialDocumentOrigin)) {
      throw new CommercialDomainError(`Invalid commercial document origin: ${props.origin}`);
    }

    this.origin = originStr as CommercialDocumentOrigin;

    const sourceId = props.sourceId?.trim() || null;
    let sourceKind: CommercialDocumentKind | null = null;

    if (props.sourceKind) {
      const kindStr = props.sourceKind.toString().trim().toUpperCase();
      if (!isCommercialDocumentKind(kindStr)) {
        throw new CommercialDomainError(`Invalid commercial document source kind: ${props.sourceKind}`);
      }
      sourceKind = kindStr as CommercialDocumentKind;
    }

    if (this.origin === CommercialDocumentOrigin.DIRECT) {
      if (sourceId) {
        throw new CommercialDomainError("DIRECT origin must not specify a sourceId.");
      }
      if (sourceKind) {
        throw new CommercialDomainError("DIRECT origin must not specify a sourceKind.");
      }
      this.sourceKind = null;
      this.sourceId = null;
    } else {
      if (!sourceId) {
        throw new CommercialDomainError(`Origin ${this.origin} requires a sourceId.`);
      }
      if (!sourceKind) {
        // Infer default source kind from origin if applicable
        if (this.origin === CommercialDocumentOrigin.QUOTATION) {
          sourceKind = CommercialDocumentKind.QUOTATION;
        } else if (this.origin === CommercialDocumentOrigin.SALES_ORDER) {
          sourceKind = CommercialDocumentKind.SALES_ORDER;
        } else if (this.origin === CommercialDocumentOrigin.CONTRACT) {
          sourceKind = CommercialDocumentKind.CONTRACT;
        } else {
          throw new CommercialDomainError(`Origin ${this.origin} requires an explicit sourceKind.`);
        }
      }

      // Validate origin vs sourceKind consistency
      if (this.origin === CommercialDocumentOrigin.QUOTATION && sourceKind !== CommercialDocumentKind.QUOTATION) {
        throw new CommercialDomainError("QUOTATION origin requires QUOTATION sourceKind.");
      }
      if (this.origin === CommercialDocumentOrigin.SALES_ORDER && sourceKind !== CommercialDocumentKind.SALES_ORDER) {
        throw new CommercialDomainError("SALES_ORDER origin requires SALES_ORDER sourceKind.");
      }
      if (this.origin === CommercialDocumentOrigin.CONTRACT && sourceKind !== CommercialDocumentKind.CONTRACT) {
        throw new CommercialDomainError("CONTRACT origin requires CONTRACT sourceKind.");
      }

      this.sourceKind = sourceKind;
      this.sourceId = sourceId;
    }
  }

  static direct(): CommercialDocumentProvenance {
    return new CommercialDocumentProvenance({ origin: CommercialDocumentOrigin.DIRECT });
  }

  static fromQuotation(quotationId: string): CommercialDocumentProvenance {
    return new CommercialDocumentProvenance({
      origin: CommercialDocumentOrigin.QUOTATION,
      sourceKind: CommercialDocumentKind.QUOTATION,
      sourceId: quotationId,
    });
  }

  static fromSalesOrder(salesOrderId: string): CommercialDocumentProvenance {
    return new CommercialDocumentProvenance({
      origin: CommercialDocumentOrigin.SALES_ORDER,
      sourceKind: CommercialDocumentKind.SALES_ORDER,
      sourceId: salesOrderId,
    });
  }

  static fromContract(contractId: string): CommercialDocumentProvenance {
    return new CommercialDocumentProvenance({
      origin: CommercialDocumentOrigin.CONTRACT,
      sourceKind: CommercialDocumentKind.CONTRACT,
      sourceId: contractId,
    });
  }

  public isDirect(): boolean {
    return this.origin === CommercialDocumentOrigin.DIRECT;
  }

  public isSourced(): boolean {
    return !this.isDirect();
  }
}
