export enum ContractStatus {
  DRAFT = "DRAFT",
}

export type ContractStatusType = `${ContractStatus}`;

export function isContractStatus(value: unknown): value is ContractStatus {
  return typeof value === "string" && Object.values(ContractStatus).includes(value as ContractStatus);
}
