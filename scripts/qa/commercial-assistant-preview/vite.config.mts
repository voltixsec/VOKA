import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const repo = fileURLToPath(new URL("../../../", import.meta.url));
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [react()],
  resolve: { alias: [
    { find: "next/navigation", replacement: fileURLToPath(new URL("navigation.ts", import.meta.url)) },
    { find: "@", replacement: repo },
  ] },
  css: { postcss: repo },
  server: { host: "127.0.0.1", port: 4174, strictPort: true, fs: { allow: [repo] } },
});
