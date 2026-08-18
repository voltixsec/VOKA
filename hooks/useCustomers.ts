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

interface CustomersResponse {
  data: {
    customers: Customer[];
    pagination: {
      total: number;
      page: number;
      pageSize: number;
      totalPages: number;
    };
  };
}

export function useCustomers() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadCustomers() {
      try {
        setLoading(true);
        setError("");

        const response = await fetch(
          "/api/customers"
        );

        if (!response.ok) {
          throw new Error("Failed to load customers");
        }

        const json: CustomersResponse = await response.json();

        setCustomers(json.data.customers);
      } catch (error) {
        setError(
          error instanceof Error
            ? error.message
            : "Unknown error"
        );
      } finally {
        setLoading(false);
      }
    }

    loadCustomers();
  }, []);

  return {
    customers,
    loading,
    error,
  };
}
