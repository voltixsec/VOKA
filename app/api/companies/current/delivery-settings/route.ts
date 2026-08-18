import { apiSuccess, withCompanyAuth } from "@/lib/api";
import { QuotationDeliveryProviderConfiguration } from "@/src/infrastructure/delivery/QuotationDeliveryProviderConfiguration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withCompanyAuth(
  ["OWNER", "ADMIN", "SALES", "VIEWER"],
  async (_request, _auth, _company) => {
    const readiness = new QuotationDeliveryProviderConfiguration().getReadiness();

    return apiSuccess(readiness, {
      headers: {
        "Cache-Control": "private, no-store",
      },
    });
  },
);
