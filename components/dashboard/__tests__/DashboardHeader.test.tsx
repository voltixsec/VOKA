// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { DashboardHeader } from "../DashboardHeader";
import { LanguageProvider } from "../../i18n/LanguageProvider";

describe("DashboardHeader Account Menu & Logout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
    delete (window as unknown as Record<string, unknown>).location;
    window.location = { href: "" } as unknown as Location;
  });

  it("fetches active user identity and displays account menu on click", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          user: { id: "user-1", name: "Sara Ahmad", email: "sara@voka.local" },
        },
      }),
    } as Response);

    render(
      <LanguageProvider>
        <DashboardHeader />
      </LanguageProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("Sara Ahmad")).toBeInTheDocument();
    });

    const accountBtn = screen.getByRole("button", { name: "Account Menu" });
    fireEvent.click(accountBtn);

    expect(screen.getByText("Logout")).toBeInTheDocument();
    expect(screen.getAllByText("sara@voka.local").length).toBeGreaterThan(0);
  });

  it("triggers POST /api/auth/logout and redirects to /login", async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            user: { id: "user-1", name: "Sara Ahmad", email: "sara@voka.local" },
          },
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ loggedOut: true }),
      } as Response);

    render(
      <LanguageProvider>
        <DashboardHeader />
      </LanguageProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("Sara Ahmad")).toBeInTheDocument();
    });

    const accountBtn = screen.getByRole("button", { name: "Account Menu" });
    fireEvent.click(accountBtn);

    const logoutBtn = screen.getByRole("button", { name: "Logout" });
    fireEvent.click(logoutBtn);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/auth/logout",
        expect.objectContaining({ method: "POST" }),
      );
      expect(window.location.href).toBe("/login");
    });
  });
});
