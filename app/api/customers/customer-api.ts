import { ApiError } from '@/lib/api';
import type {
  CreateCustomerProps,
  Customer,
  CustomerLocale,
  CustomerStatus,
  CustomerType,
} from '@/features/customers/domain/entities/Customer';

const stringFields = [
  'name', 'nameAr', 'nameEn', 'legalName', 'email', 'phone', 'mobile', 'whatsapp',
  'taxNumber',
  'addressLine1', 'addressLine1Ar', 'addressLine1En',
  'addressLine2', 'addressLine2Ar', 'addressLine2En',
  'city', 'cityAr', 'cityEn',
  'state', 'stateAr', 'stateEn',
  'postalCode', 'countryCode', 'preferredCurrency',
  'notes', 'notesAr', 'notesEn',
] as const;

export type CustomerChanges = Omit<Partial<CreateCustomerProps>, 'companyId' | 'code'>;

function optionalString(value: unknown, field: string): string | null {
  if (value === null) return null;
  if (typeof value !== 'string') {
    throw ApiError.badRequest('INVALID_CUSTOMER_FIELD', `${field} must be a string or null.`, { field });
  }
  return value.trim() || null;
}

export function parseCustomerChanges(body: Record<string, unknown>): CustomerChanges {
  const changes: Record<string, unknown> = {};
  for (const field of stringFields) {
    if (body[field] !== undefined) changes[field] = optionalString(body[field], field);
  }

  if (body.type !== undefined) {
    if (body.type !== 'COMPANY' && body.type !== 'INDIVIDUAL') {
      throw ApiError.badRequest('INVALID_CUSTOMER_TYPE', 'Customer type is invalid.', { field: 'type' });
    }
    changes.type = body.type as CustomerType;
  }
  if (body.status !== undefined) {
    if (!['LEAD', 'ACTIVE', 'INACTIVE', 'BLOCKED'].includes(String(body.status))) {
      throw ApiError.badRequest('INVALID_CUSTOMER_STATUS', 'Customer status is invalid.', { field: 'status' });
    }
    changes.status = body.status as CustomerStatus;
  }
  if (body.preferredLocale !== undefined) {
    if (body.preferredLocale !== null && body.preferredLocale !== 'EN' && body.preferredLocale !== 'AR') {
      throw ApiError.badRequest('INVALID_CUSTOMER_LOCALE', 'Customer locale is invalid.', { field: 'preferredLocale' });
    }
    changes.preferredLocale = body.preferredLocale as CustomerLocale | null;
  }
  for (const field of ['creditLimit', 'paymentTermDays'] as const) {
    if (body[field] !== undefined) {
      if (body[field] !== null && typeof body[field] !== 'number') {
        throw ApiError.badRequest('INVALID_CUSTOMER_FIELD', `${field} must be a number or null.`, { field });
      }
      changes[field] = body[field];
    }
  }
  return changes as CustomerChanges;
}

export function parseCustomerCreate(
  body: Record<string, unknown>,
): CustomerChanges {
  const changes = parseCustomerChanges(body);

  // New Customers enter the canonical bilingual master-data model.
  // Legacy name remains compatibility data for existing persisted rows.
  if (!changes.nameAr && !changes.nameEn) {
    throw ApiError.badRequest(
      'INVALID_CUSTOMER_NAME',
      'At least one Arabic or English customer name is required.',
      { field: 'nameAr' },
    );
  }

  return changes;
}

export function customerToResponse(customer: Customer) {
  return {
    id: customer.id.toString(), code: customer.code, type: customer.type,
    status: customer.status, name: customer.name, nameAr: customer.nameAr, nameEn: customer.nameEn,
    legalName: customer.legalName,
    email: customer.email, phone: customer.phone, mobile: customer.mobile,
    whatsapp: customer.whatsapp, taxNumber: customer.taxNumber,
    addressLine1: customer.addressLine1,
    addressLine1Ar: customer.addressLine1Ar,
    addressLine1En: customer.addressLine1En,
    addressLine2: customer.addressLine2,
    addressLine2Ar: customer.addressLine2Ar,
    addressLine2En: customer.addressLine2En,
    city: customer.city,
    cityAr: customer.cityAr,
    cityEn: customer.cityEn,
    state: customer.state,
    stateAr: customer.stateAr,
    stateEn: customer.stateEn,
    postalCode: customer.postalCode,
    countryCode: customer.countryCode, preferredLocale: customer.preferredLocale,
    preferredCurrency: customer.preferredCurrency, creditLimit: customer.creditLimit,
    paymentTermDays: customer.paymentTermDays,
    notes: customer.notes,
    notesAr: customer.notesAr,
    notesEn: customer.notesEn,
    createdAt: customer.createdAt,
    updatedAt: customer.updatedAt,
  };
}

export function throwCustomerError(error: { code: string; message: string }): never {
  if (error.code === 'CUSTOMER_NOT_FOUND') throw ApiError.notFound(error.code, error.message);
  if (error.code === 'CUSTOMER_CODE_ALREADY_EXISTS') throw ApiError.conflict(error.code, error.message);
  throw ApiError.badRequest(error.code, error.message);
}
