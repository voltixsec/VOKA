"use client";

import { useEffect, useState } from "react";

export interface Customer {
  id: string;
  code: string;
  name: string;
  nameAr?: string | null;
  nameEn?: string | null;
  type: string;
  status: string;
  phone?: string | null;
  mobile?: string | null;
  whatsapp?: string | null;
  email?: string | null;
}

export type CustomerListQuery = {
  search?: string;
  status?: string;
  type?: string;
  page?: number;
  pageSize?: number;
};

export type CustomerPagination = {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type CustomerSummaries = {
  total: number;
  LEAD: number;
  ACTIVE: number;
  INACTIVE: number;
  BLOCKED: number;
};

const EMPTY_PAGINATION: CustomerPagination = {
  total: 0,
  page: 1,
  pageSize: 20,
  totalPages: 0,
};

const EMPTY_SUMMARIES: CustomerSummaries = {
  total: 0,
  LEAD: 0,
  ACTIVE: 0,
  INACTIVE: 0,
  BLOCKED: 0,
};

export function customerListQueryString(query: CustomerListQuery = {}) {
  const params = new URLSearchParams();
  const search = query.search?.trim();
  if (search) params.set("search", search);
  if (query.status) params.set("status", query.status);
  if (query.type) params.set("type", query.type);
  params.set("page", String(query.page && query.page > 0 ? query.page : 1));
  params.set(
    "pageSize",
    String(query.pageSize && query.pageSize > 0 ? query.pageSize : 20),
  );
  return params.toString();
}

export async function fetchCustomerListPage(query: CustomerListQuery = {}) {
  const response = await fetch(`/api/customers?${customerListQueryString(query)}`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error("Failed to load customers");
  }
  const json = (await response.json()) as {
    data: {
      customers: Customer[];
      pagination: CustomerPagination;
      summaries?: CustomerSummaries;
    };
  };
  return {
    customers: json.data.customers ?? [],
    pagination: json.data.pagination ?? EMPTY_PAGINATION,
    summaries: json.data.summaries ?? EMPTY_SUMMARIES,
  };
}

export async function fetchAllMatchingCustomers(query: Omit<CustomerListQuery, "page" | "pageSize">) {
  const pageSize = 100;
  const customers: Customer[] = [];
  let page = 1;
  let totalPages = 1;
  while (page <= totalPages) {
    const result = await fetchCustomerListPage({ ...query, page, pageSize });
    customers.push(...result.customers);
    totalPages = result.pagination.totalPages || 0;
    if (totalPages === 0) break;
    page += 1;
  }
  return customers;
}

export function useCustomers(query: CustomerListQuery = {}) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [pagination, setPagination] = useState<CustomerPagination>(EMPTY_PAGINATION);
  const [summaries, setSummaries] = useState<CustomerSummaries>(EMPTY_SUMMARIES);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const search = query.search?.trim() ?? "";
  const status = query.status ?? "";
  const type = query.type ?? "";
  const page = query.page && query.page > 0 ? query.page : 1;
  const pageSize = query.pageSize && query.pageSize > 0 ? query.pageSize : 20;

  useEffect(() => {
    let cancelled = false;
    async function loadCustomers() {
      try {
        setLoading(true);
        setError("");
        const result = await fetchCustomerListPage({ search, status, type, page, pageSize });
        if (cancelled) return;
        setCustomers(result.customers);
        setPagination(result.pagination);
        setSummaries(result.summaries);
      } catch (caught) {
        if (cancelled) return;
        setError(caught instanceof Error ? caught.message : "Unknown error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadCustomers();
    return () => {
      cancelled = true;
    };
  }, [search, status, type, page, pageSize]);

  return {
    customers,
    pagination,
    summaries,
    loading,
    error,
  };
}
