// @vitest-environment jsdom
import { createElement } from "react";
import { render, screen } from "@testing-library/react";
import OperatorLayout from "@/app/dashboard/universal-library/layout";
﻿import {
  readFileSync,
} from "node:fs";

import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn().mockResolvedValue({ user: { id: "operator" } }), isPlatformAdmin: vi.fn().mockReturnValue(true) }));
vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard/universal-library/review", redirect: vi.fn() }));
vi.mock("@/components/i18n/LanguageProvider", () => ({ useLanguage: () => ({ isArabic: false }) }));

describe(
  "UCL review operator surface",
  () => {
    it(
      "exposes the governed review queue and explicit decisions",
      () => {
        const source =
          readFileSync(
            "app/dashboard/universal-library/review/page.tsx",
            "utf8",
          );

        expect(source)
          .toContain(
            "status=NEEDS_REVIEW",
          );

        expect(source)
          .toContain(
            "/api/universal-library/review",
          );

        expect(source)
          .toContain(
            "Approve & Publish",
          );

        expect(source)
          .toContain(
            '"REJECT"',
          );
      },
    );

    it("makes Review reachable from the shared protected operator layout", async () => {
      render(await OperatorLayout({ children: createElement("div", null, "Operator content") }));
      expect(screen.getByRole("link", { name: "Review" })).toHaveAttribute("href", "/dashboard/universal-library/review");
      expect(screen.getByRole("link", { name: "Review" })).toHaveAttribute("aria-current", "page");
      expect(screen.getAllByRole("link")).toHaveLength(7);
      expect(screen.getByText("Operator content")).toBeInTheDocument();
    });
  },
);
