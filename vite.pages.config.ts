import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages publishes the same React workspace, with no paid server required.
export default defineConfig({
  base: process.env.OPENRT_BASE_PATH ?? "/OpenRT/",
  plugins: [react()],
  build: { outDir: "dist", sourcemap: false, target: "es2022" },
  server: { host: "127.0.0.1", port: 5173, strictPort: true },
  preview: { host: "127.0.0.1", port: 4173, strictPort: true },
});
