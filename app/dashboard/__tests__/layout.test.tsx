import { describe, expect, it, vi, beforeEach } from "vitest";
import DashboardLayout from "../layout";
import { getCurrentUser, isPlatformAdmin } from "../../../lib/auth";
import { ApiError } from "../../../lib/api/ApiError";
import { redirect } from "next/navigation";

vi.mock("next/font/google", () => ({
  Cairo: vi.fn().mockReturnValue({
    className: "cairo-font",
    variable: "--font-voka",
  }),
}));

vi.mock("../../../lib/auth", () => ({
  getCurrentUser: vi.fn(),
  isPlatformAdmin: vi.fn().mockReturnValue(false),
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
  it.each([true, false])('passes only the server-derived platform flag %s to Sidebar', async (allowed) => {
    const auth = { user: { id: 'user-1' } } as any;
    vi.mocked(getCurrentUser).mockResolvedValue(auth);
    vi.mocked(isPlatformAdmin).mockReturnValue(allowed);
    const element = await DashboardLayout({ children: 'Content' });
    expect(isPlatformAdmin).toHaveBeenCalledWith(auth);
    const sidebar = element.props.children.props.children[0];
    expect(sidebar.props).toEqual({ isPlatformAdmin: allowed });
  });
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects unauthenticated users (ApiError 401) to /login with safe returnTo", async () => {
    vi.mocked(getCurrentUser).mockRejectedValue(ApiError.unauthorized());

    await expect(DashboardLayout({ children: "Dashboard Content" })).rejects.toThrow(
      "REDIRECT: /login?returnTo=%2Fdashboard%2Fquotations",
    );

    expect(redirect).toHaveBeenCalledWith("/login?returnTo=%2Fdashboard%2Fquotations");
  });

  it("re-throws canonical ApiError 500 unchanged and does NOT redirect", async () => {
    const serverError = ApiError.internal("Database unavailable");
    vi.mocked(getCurrentUser).mockRejectedValue(serverError);

    await expect(DashboardLayout({ children: "Dashboard Content" })).rejects.toBe(serverError);
    expect(redirect).not.toHaveBeenCalled();
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
