import type { Customer } from "../../../hooks/useCustomers";

import Link from "next/link";

import {
  Badge,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "../../../components/ui";

interface CustomerTableProps {
  customers: Customer[];
  isArabic?: boolean;
}

function getStatusVariant(
  status: string
): "neutral" | "info" | "success" | "warning" | "danger" {
  switch (status.toUpperCase()) {
    case "ACTIVE":
      return "success";
    case "LEAD":
      return "warning";
    case "PROSPECT":
      return "info";
    case "BLOCKED":
    case "INACTIVE":
      return "danger";
    default:
      return "neutral";
  }
}

function translateCustomerType(
  type: string,
  isArabic: boolean
) {
  if (!isArabic) {
    return type;
  }

  const translations: Record<string, string> = {
    COMPANY: "شركة",
    INDIVIDUAL: "فرد",
    GOVERNMENT: "جهة حكومية",
  };

  return translations[type.toUpperCase()] ?? type;
}

function translateCustomerStatus(
  status: string,
  isArabic: boolean
) {
  if (!isArabic) {
    return status;
  }

  const translations: Record<string, string> = {
    ACTIVE: "نشط",
    LEAD: "عميل محتمل",
    PROSPECT: "فرصة بيع",
    BLOCKED: "محظور",
    INACTIVE: "غير نشط",
  };

  return translations[status.toUpperCase()] ?? status;
}

export function CustomerTable({
  customers,
  isArabic = false,
}: CustomerTableProps) {
  return (
    <TableContainer>
      <Table dir={isArabic ? "rtl" : "ltr"}>
        <TableHead>
          <TableRow className="hover:bg-transparent">
            <TableHeaderCell className="w-[14%]">
              {isArabic ? "الرمز" : "Code"}
            </TableHeaderCell>

            <TableHeaderCell className="w-[26%]">
              {isArabic ? "العميل" : "Customer"}
            </TableHeaderCell>

            <TableHeaderCell className="w-[14%]">
              {isArabic ? "النوع" : "Type"}
            </TableHeaderCell>

            <TableHeaderCell className="w-[16%]">
              {isArabic ? "الحالة" : "Status"}
            </TableHeaderCell>

            <TableHeaderCell className="w-[14%]">
              {isArabic ? "الهاتف" : "Phone"}
            </TableHeaderCell>

            <TableHeaderCell className="w-[16%]">
              {isArabic ? "البريد الإلكتروني" : "Email"}
            </TableHeaderCell>
          </TableRow>
        </TableHead>

        <TableBody>
          {customers.map((customer) => (
            <TableRow key={customer.id}>
              <TableCell>
                <Link
                  href={`/dashboard/customers/${encodeURIComponent(customer.id)}`}
                  dir="ltr"
                  className="inline-block rounded font-medium text-sky-300 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-sky-300"
                >
                  {customer.code}
                </Link>
              </TableCell>

              <TableCell>
                <Link
                  href={`/dashboard/customers/${encodeURIComponent(customer.id)}`}
                  dir="auto"
                  className="block truncate rounded font-medium text-white outline-none hover:text-sky-200 focus-visible:ring-2 focus-visible:ring-sky-300"
                >
                  {customer.name}
                </Link>
              </TableCell>

              <TableCell>
                {translateCustomerType(
                  customer.type,
                  isArabic
                )}
              </TableCell>

              <TableCell>
                <Badge
                  variant={getStatusVariant(
                    customer.status
                  )}
                >
                  {translateCustomerStatus(
                    customer.status,
                    isArabic
                  )}
                </Badge>
              </TableCell>

              <TableCell className="text-slate-400">
                <span dir="ltr">
                  {customer.phone || "—"}
                </span>
              </TableCell>

              <TableCell className="text-slate-400">
                <span
                  dir="ltr"
                  className="block truncate"
                >
                  {customer.email || "—"}
                </span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
