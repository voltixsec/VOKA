// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import LoginPage from "../page";

const mockSearchParams = new Map<string, string>();

vi.mock("next/navigation", () => ({
  useSearchParams: () => ({
    get: (key: string) => mockSearchParams.get(key) || null,
  }),
}));

describe("LoginPage Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams.clear();
    global.fetch = vi.fn();
    delete (window as unknown as Record<string, unknown>).location;
    window.location = { href: "" } as unknown as Location;
  });

  it("renders login form correctly with Arabic/English toggle", () => {
    render(<LoginPage />);

    expect(screen.getByText("مرحباً بك في VOKA")).toBeInTheDocument();
    expect(screen.getByText("تسجيل الدخول")).toBeInTheDocument();

    const langToggle = screen.getByText("English");
    fireEvent.click(langToggle);

    expect(screen.getByText("Welcome to VOKA")).toBeInTheDocument();
    expect(screen.getByText("Sign in")).toBeInTheDocument();
  });

  it("submits login form and redirects to safe returnTo on success", async () => {
    mockSearchParams.set("returnTo", "/dashboard/quotations");

    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    } as Response);

    render(<LoginPage />);

    const emailInput = screen.getByPlaceholderText("name@company.com");
    const passwordInput = screen.getByPlaceholderText("••••••••");

    fireEvent.change(emailInput, { target: { value: "user@voka.local" } });
    fireEvent.change(passwordInput, { target: { value: "secret123" } });

    const submitBtn = screen.getByRole("button", { name: "تسجيل الدخول" });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/auth/login",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            email: "user@voka.local",
            password: "secret123",
          }),
        }),
      );
      expect(window.location.href).toBe("/dashboard/quotations");
    });
  });

  it("handles invalid credentials error safely with localized messaging", async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      json: async () => ({
        error: { message: "Internal server error details" },
      }),
    } as Response);

    render(<LoginPage />);

    const emailInput = screen.getByPlaceholderText("name@company.com");
    const passwordInput = screen.getByPlaceholderText("••••••••");

    fireEvent.change(emailInput, { target: { value: "wrong@voka.local" } });
    fireEvent.change(passwordInput, { target: { value: "wrongpass" } });

    const submitBtn = screen.getByRole("button", { name: "تسجيل الدخول" });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(
        screen.getByText("البريد الإلكتروني أو كلمة المرور غير صحيحة"),
      ).toBeInTheDocument();
    });
  });
});
