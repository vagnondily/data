import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Configuration Vite adaptée à Tauri : port fixe, pas de refresh brutal.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  build: {
    target: "es2021",
    outDir: "dist",
    sourcemap: false,
  },
});
