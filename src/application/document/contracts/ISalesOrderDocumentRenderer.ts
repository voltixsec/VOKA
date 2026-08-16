import type { SalesOrderDocumentSnapshot } from "./SalesOrderDocumentSnapshot";

export interface ISalesOrderDocumentRenderer {
  render(snapshot: SalesOrderDocumentSnapshot): Promise<Uint8Array>;
}
