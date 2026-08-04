import { describe, expect, it } from "vitest";

import { CreateCustomerUseCase } from "../use-cases/CreateCustomerUseCase";
import { FakeCustomerRepository } from "../repositories/FakeCustomerRepository";

describe("CreateCustomerUseCase", () => {

  it("creates a new customer", async () => {

    const repository = new FakeCustomerRepository();
    const useCase = new CreateCustomerUseCase(repository);

    const result = await useCase.execute({
      companyId: "company-1",
      name: "First United",
      email: "info@firstunited.com",
    });

    expect(result.id).toBeTruthy();
    expect(repository.count()).toBe(1);

  });

  it("does not create duplicate customers", async () => {

    const repository = new FakeCustomerRepository();
    const useCase = new CreateCustomerUseCase(repository);

    await useCase.execute({
      companyId: "company-1",
      name: "First United",
      email: "info@firstunited.com",
    });

    await expect(
      useCase.execute({
        companyId: "company-1",
        name: "First United",
        email: "info@firstunited.com",
      }),
    ).rejects.toThrow();

    expect(repository.count()).toBe(1);

  });

});
