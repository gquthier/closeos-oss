import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    rollupOptions: {
      output: { manualChunks: { react: ["react", "react-dom"] } },
    },
  },
  server: {
    host: "127.0.0.1",
    port: 4321,
    proxy: { "/api": "http://127.0.0.1:4320" },
  },
});
