// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import Home from "../page";

describe("VOKA V1 landing page", () => {
  beforeEach(() => { window.localStorage.clear(); document.documentElement.lang = "ar"; document.documentElement.dir = "rtl"; });

  it("leads with the V1 voice-first positioning and a real login CTA", () => {
    render(<Home />);
    expect(screen.getByRole("heading", { level: 1, name: "Speak. Understand. Quote." })).toBeInTheDocument();
    const loginLinks = screen.getAllByRole("link", { name: "Sign in" });
    expect(loginLinks.length).toBeGreaterThan(1);
    expect(loginLinks.every((link) => link.getAttribute("href") === "/login")).toBe(true);
    expect(screen.queryByText(/pricing coming soon/i)).not.toBeInTheDocument();
  });

  it("switches immediately to strong English copy and persists direction", async () => {
    window.localStorage.setItem("voka-locale", "ar");
    render(<Home />);
    expect(await screen.findByRole("heading", { level: 1, name: "تكلّم. نفهم. نُعِدّ عرض السعر." })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "English" }));
    expect(screen.getByRole("heading", { level: 1, name: "Speak. Understand. Quote." })).toBeInTheDocument();
    await waitFor(() => { expect(window.localStorage.getItem("voka-locale")).toBe("en"); expect(document.documentElement.dir).toBe("ltr"); });
  });

  it("does not promise autonomous commercial commitment", () => {
    render(<Home />);
    expect(screen.getByText("Human approval before every commercial commitment")).toBeInTheDocument();
    expect(screen.getByText(/Deterministic quantities/)).toBeInTheDocument();
  });
});
