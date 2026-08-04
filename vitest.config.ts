import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": process.cwd(),
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: [
      "src/**/__tests__/**/*.test.ts",
      "app/**/__tests__/**/*.test.{ts,tsx}",
      "features/**/__tests__/**/*.test.ts",
    ],
    setupFiles: ["./vitest.setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      reportsDirectory: "./coverage",
    },
  },
});
