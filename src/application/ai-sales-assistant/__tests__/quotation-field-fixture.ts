import { vi } from 'vitest';
import { AISalesAssistantService } from '../services/AISalesAssistantService';
import { CompleteCommercialConversation } from '../../commercial-conversation/CompleteCommercialConversation';
import { customerMatchScore } from '@/features/customers/domain/customer-discovery';
import type { WorkingCommercialDraft } from '../../commercial-conversation/types';

export const nationalCustomer = 'الشركة الوطنية';
export const quotationPrompt = `اعمل لي عرض سعر توريد وتركيب 123 كاميرا مراقبة ${nationalCustomer}`;
export function quotationFieldFixture(options: { names?: string[]; locale?: 'ar' | 'en'; terms?: string | null } = {}) {
  const locale = options.locale ?? 'ar';
  const customers = (options.names ?? [nationalCustomer]).map((name, i) => ({ id: `customer-${i + 1}`, name, code: `C${i}`, status: 'ACTIVE' }));
  const findAll = vi.fn().mockImplementation(async ({ search }) => customers.filter((customer) => customerMatchScore(customer, search)));
  const extractIntent = vi.fn().mockResolvedValue({ customerMention: nationalCustomer, lines: [], subject: quotationPrompt, brief: 'Payment: fabricated generic terms', notes: 'AI_ESTIMATED: required storage 337 TB', paymentTerms: 'invented payment policy' });
  const terms = options.terms === undefined ? (locale === 'ar' ? 'شروط الدفع: 50% مقدم\nالتسليم: 14 يوم\nالضمان: سنة\nالأعمال المدنية غير مشمولة.' : 'Payment: 50% advance\nDelivery: 14 days\nWarranty: 1 year\nCivil works excluded.') : options.terms;
  const service = new AISalesAssistantService({
    companies: { findById: vi.fn().mockResolvedValue({ defaultCurrency: 'KWD', timezone: 'Asia/Kuwait' }) },
    customers: { findAll }, catalogItems: { findAll: vi.fn().mockResolvedValue([]) },
    units: { findById: vi.fn(), findBySymbol: vi.fn() },
    quotationReferences: { resolveTaxRatePercentages: vi.fn().mockResolvedValue(new Map()) },
    pricing: { resolvePriceListId: vi.fn().mockResolvedValue(null), resolveUnitPrice: vi.fn() },
    terms: { find: vi.fn().mockResolvedValue(terms) },
  } as any, { extractIntent });
  const useCase = new CompleteCommercialConversation(service);
  const run = (reply: string, draft?: WorkingCommercialDraft, extra = {}) => useCase.execute({ companyId: 'tenant', locale, documentMode: 'QUOTATION', replySource: 'TEXT', reply, draft, ...extra });
  return { run, service, findAll, extractIntent };
}
