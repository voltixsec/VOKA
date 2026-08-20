import { describe, expect, it } from "vitest";
import { CommercialDocumentProvenance } from "../../commercial";
import { ContractDomainError } from "../errors/ContractDomainError";
import { Contract } from "../entities/Contract";
import { ContractMilestone, MilestoneAmountType } from "../entities/ContractMilestone";
import { ContractStatus } from "../types/ContractStatus";

describe("Contract Domain Aggregate", () => {
  const validCustomer = {
    name: "Acme Corp",
    email: "info@acme.com",
    phone: "+96512345678",
  };

  const validLine = {
    position: 1,
    type: "PRODUCT" as const,
    itemName: "Consulting Services",
    quantity: 10,
    unitPrice: 100,
    discountValue: 0,
    taxPercentage: 0,
    discountAmount: 0,
    taxAmount: 0,
    subtotal: 1000,
    totalAmount: 1000,
  };

  it("creates a direct Contract in DRAFT status with server-calculated totals", () => {
    const contract = new Contract({
      companyId: "comp_1",
      number: "CN-202608-0001",
      provenance: CommercialDocumentProvenance.direct(),
      customerId: "cust_1",
      customer: validCustomer,
      lines: [validLine],
      createdByName: "John Doe",
      createdByRole: "SALES",
    });

    expect(contract.status).toBe(ContractStatus.DRAFT);
    expect(contract.provenance.isDirect()).toBe(true);
    expect(contract.number.value).toBe("CN-202608-0001");
    expect(contract.subtotal).toBe(1000);
    expect(contract.totalAmount).toBe(1000);
    expect(contract.lines.length).toBe(1);
  });

  it("creates a Contract sourced from a Quotation", () => {
    const contract = new Contract({
      companyId: "comp_1",
      number: "CN-202608-0002",
      provenance: CommercialDocumentProvenance.fromQuotation("q_100"),
      customerId: "cust_1",
      customer: validCustomer,
      lines: [validLine],
      createdByName: "John Doe",
      createdByRole: "SALES",
    });

    expect(contract.provenance.isSourced()).toBe(true);
    expect(contract.provenance.sourceKind).toBe("QUOTATION");
    expect(contract.provenance.sourceId).toBe("q_100");
  });

  it("rejects invalid contract numbers", () => {
    expect(
      () =>
        new Contract({
          companyId: "comp_1",
          number: "INVALID-NUMBER",
          provenance: CommercialDocumentProvenance.direct(),
          customerId: "cust_1",
          customer: validCustomer,
          lines: [validLine],
          createdByName: "John Doe",
          createdByRole: "SALES",
        }),
    ).toThrow(ContractDomainError);
  });

  it("validates milestones correctly", () => {
    const milestone1 = {
      position: 1,
      title: "Initial Advance",
      amountType: MilestoneAmountType.PERCENTAGE,
      percentage: 50,
    };
    const milestone2 = {
      position: 2,
      title: "Final Completion",
      amountType: MilestoneAmountType.PERCENTAGE,
      percentage: 50,
    };

    const contract = new Contract({
      companyId: "comp_1",
      number: "CN-202608-0003",
      provenance: CommercialDocumentProvenance.direct(),
      customerId: "cust_1",
      customer: validCustomer,
      lines: [validLine],
      milestones: [milestone1, milestone2],
      createdByName: "John Doe",
      createdByRole: "SALES",
    });

    expect(contract.milestones.length).toBe(2);
    expect(contract.milestones[0].position).toBe(1);
    expect(contract.milestones[1].position).toBe(2);
  });

  it("rejects milestone percentage total exceeding 100%", () => {
    const m1 = { position: 1, title: "M1", amountType: MilestoneAmountType.PERCENTAGE, percentage: 60 };
    const m2 = { position: 2, title: "M2", amountType: MilestoneAmountType.PERCENTAGE, percentage: 50 };

    expect(
      () =>
        new Contract({
          companyId: "comp_1",
          number: "CN-202608-0004",
          provenance: CommercialDocumentProvenance.direct(),
          customerId: "cust_1",
          customer: validCustomer,
          lines: [validLine],
          milestones: [m1, m2],
          createdByName: "John Doe",
          createdByRole: "SALES",
        }),
    ).toThrow(ContractDomainError);
  });
});
