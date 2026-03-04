import { defineConfig } from "vite";
import path from "path";
import react from "@vitejs/plugin-react";
import eruda from "vite-plugin-eruda";

export default defineConfig({
  base: "./",
  plugins: [
    react(),
    // eruda(),
  ],
  watch: {
    // usePolling: true,
    // interval: 1000, // increases delay
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: true,
    port: 8000,
    sourcemap: true,
  },
});
