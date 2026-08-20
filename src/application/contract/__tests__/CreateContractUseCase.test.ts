import { describe, expect, it, vi } from "vitest";
import { CreateContractUseCase } from "../use-cases/CreateContractUseCase";
import type { IContractRepository } from "../repositories/IContractRepository";
import type { CustomerRepository } from "../../../../features/customers/domain/repositories";

describe("CreateContractUseCase", () => {
  const fakeCustomer: any = {
    id: "cust_1",
    companyId: "comp_1",
    code: "CUST-001",
    name: "Test Customer",
    nameAr: "عميل تجريبي",
    nameEn: "Test Customer",
    email: "cust@test.com",
    phone: "+96512345678",
    addressLine1: "Kuwait City",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockCustomerRepo: CustomerRepository = {
    findByIdAndCompanyId: vi.fn().mockResolvedValue(fakeCustomer),
    findById: vi.fn().mockResolvedValue(fakeCustomer),
    findByCode: vi.fn(),
    findAll: vi.fn(),
    count: vi.fn(),
    save: vi.fn(),
    delete: vi.fn(),
    deleteByIdAndCompanyId: vi.fn(),
  };

  const mockContractRepo: IContractRepository = {
    save: vi.fn().mockImplementation((contract) => Promise.resolve(contract)),
    findById: vi.fn(),
    findByNumber: vi.fn(),
    list: vi.fn(),
    getNextContractNumber: vi.fn().mockResolvedValue("CN-202608-0001"),
  };

  it("creates a contract using trusted customer and generates a tenant contract number", async () => {
    const useCase = new CreateContractUseCase(mockContractRepo, mockCustomerRepo);

    const result = await useCase.execute({
      companyId: "comp_1",
      customerId: "cust_1",
      lines: [
        {
          position: 1,
          type: "PRODUCT",
          itemName: "Service A",
          quantity: 2,
          unitPrice: 500,
        },
      ],
      actor: {
        userId: "user_1",
        name: "Agent Smith",
        role: "SALES",
      },
    });

    expect(result.number.value).toBe("CN-202608-0001");
    expect(result.customer.name).toBe("Test Customer");
    expect(result.customer.email).toBe("cust@test.com");
    expect(result.subtotal).toBe(1000);
    expect(result.totalAmount).toBe(1000);
    expect(mockContractRepo.save).toHaveBeenCalledOnce();
  });
});
