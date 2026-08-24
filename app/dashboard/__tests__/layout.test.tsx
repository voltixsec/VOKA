import { describe, expect, it, vi, beforeEach } from "vitest";
import DashboardLayout from "../layout";
import { getCurrentUser } from "../../../lib/auth";
import { ApiError } from "../../../lib/api/api-error";
import { redirect } from "next/navigation";

vi.mock("next/font/google", () => ({
  Cairo: vi.fn().mockReturnValue({
    className: "cairo-font",
    variable: "--font-voka",
  }),
}));

vi.mock("../../../lib/auth", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT: ${url}`);
  }),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Map([["x-pathname", "/dashboard/quotations"]])),
}));

describe("DashboardLayout Server Auth Gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects unauthenticated users (ApiError 401) to /login with safe returnTo", async () => {
    vi.mocked(getCurrentUser).mockRejectedValue(ApiError.unauthorized("Session expired"));

    await expect(DashboardLayout({ children: "Dashboard Content" })).rejects.toThrow(
      "REDIRECT: /login?returnTo=%2Fdashboard%2Fquotations",
    );

    expect(redirect).toHaveBeenCalledWith("/login?returnTo=%2Fdashboard%2Fquotations");
  });

  it("re-throws non-auth errors unchanged and does NOT redirect", async () => {
    const dbError = new Error("Database connection lost");
    vi.mocked(getCurrentUser).mockRejectedValue(dbError);

    await expect(DashboardLayout({ children: "Dashboard Content" })).rejects.toThrow(
      "Database connection lost",
    );

    expect(redirect).not.toHaveBeenCalled();
  });

  it("renders layout children when authenticated", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      user: {
        id: "user-1",
        email: "admin@voka.local",
        name: "VOKA Admin",
        locale: "ar",
        isActive: true,
      },
      memberships: [],
      activeCompanyId: "company-1",
    });

    const element = await DashboardLayout({ children: "Dashboard Content" });
    expect(element).toBeDefined();
  });
});
