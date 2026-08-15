export interface QuotationCustomerContactRepository {
  find(companyId: string, customerId: string): Promise<{
    customerId: string;
    email: string | null;
    whatsapp: string | null;
  } | null>;

  updateSelected(input: {
    companyId: string;
    customerId: string;
    email?: string;
    whatsapp?: string;
  }): Promise<boolean>;
}
