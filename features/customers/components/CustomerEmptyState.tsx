import {
  Button,
  EmptyState,
} from "../../../components/ui";

interface CustomerEmptyStateProps {
  isArabic?: boolean;
}

export function CustomerEmptyState({
  isArabic = false,
}: CustomerEmptyStateProps) {
  return (
    <EmptyState
      title={
        isArabic
          ? "لا يوجد عملاء"
          : "No customers found"
      }
      description={
        isArabic
          ? "أضف أول عميل لبدء دورة المبيعات داخل VOKA."
          : "Create the first customer to start the VOKA sales flow."
      }
      action={
        <Button>
          {isArabic
            ? "إضافة عميل"
            : "Add Customer"}
        </Button>
      }
    />
  );
}
