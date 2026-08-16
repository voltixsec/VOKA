import { describe, expect, it } from "vitest";
import { SalesOrderActivity } from "../entities/SalesOrderActivity";
import { SalesOrderDomainError } from "../errors/SalesOrderDomainError";

describe("SalesOrderActivity", () => {
  it("creates a valid activity note", () => {
    const activity = new SalesOrderActivity({
      companyId: "company-1",
      salesOrderId: "so-1",
      body: "Client requested expedited delivery.",
      actorUserId: "user-1",
      actorName: "John Sales",
      actorRole: "SALES",
    });

    expect(activity.companyId).toBe("company-1");
    expect(activity.salesOrderId).toBe("so-1");
    expect(activity.body).toBe("Client requested expedited delivery.");
    expect(activity.actorUserId).toBe("user-1");
    expect(activity.actorName).toBe("John Sales");
    expect(activity.actorRole).toBe("SALES");
    expect(activity.createdAt).toBeInstanceOf(Date);
  });

  it("rejects blank body", () => {
    expect(
      () =>
        new SalesOrderActivity({
          companyId: "company-1",
          salesOrderId: "so-1",
          body: "   ",
          actorName: "John",
          actorRole: "SALES",
        }),
    ).toThrow(SalesOrderDomainError);
  });

  it("rejects body exceeding 2000 characters", () => {
    const longBody = "a".repeat(2001);
    expect(
      () =>
        new SalesOrderActivity({
          companyId: "company-1",
          salesOrderId: "so-1",
          body: longBody,
          actorName: "John",
          actorRole: "SALES",
        }),
    ).toThrow("exceeds maximum length of 2000 characters");
  });
});
