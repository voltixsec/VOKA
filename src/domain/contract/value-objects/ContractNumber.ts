import { ContractDomainError } from "../errors/ContractDomainError";

const CONTRACT_NUMBER_PATTERN = /^CN-\d{6}-\d{4}$/;

export class ContractNumber {
  public readonly value: string;

  private constructor(value: string) {
    this.value = value;
  }

  public static create(value: string): ContractNumber {
    const trimmed = value?.trim();
    if (!trimmed) {
      throw new ContractDomainError("Contract number is required.");
    }

    if (!CONTRACT_NUMBER_PATTERN.test(trimmed)) {
      throw new ContractDomainError(
        "Contract number must follow format CN-YYYYMM-XXXX (e.g., CN-202608-0001).",
      );
    }

    return new ContractNumber(trimmed);
  }

  public toString(): string {
    return this.value;
  }
}
