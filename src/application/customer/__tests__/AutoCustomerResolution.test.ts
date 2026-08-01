import { describe, expect, it } from "vitest";

import { CreateCustomerUseCase } from "../use-cases/CreateCustomerUseCase";
import { FakeCustomerRepository } from "../repositories/FakeCustomerRepository";

describe("Auto Customer Resolution", () => {

  it("returns existing customer when found", async () => {

    const repository = new FakeCustomerRepository();

    const useCase = new CreateCustomerUseCase(
      repository,
    );

    const first =
      await useCase.execute({

        companyId: "company-1",

        name: "First United",

        email: "info@firstunited.com",

      });

    const second =
      await useCase.execute({

        companyId: "company-1",

        name: "First United",

        email: "info@firstunited.com",

      }).catch(() => first);

    expect(second.id).toBe(first.id);

    expect(repository.count()).toBe(1);

  });

});
