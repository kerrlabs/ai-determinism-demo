import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

const root = import.meta.dirname;
// The built assets are emitted to ../frontend-dist, which the existing
// FastAPI app mounts as static files. The dev server proxies /api to the
// running FastAPI backend (uvicorn on :8000) so the SSE stream works locally.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(root, "./src") },
  },
  build: {
    outDir: path.resolve(root, "../frontend-dist"),
    emptyOutDir: true,
  },
  server: {
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
        // SSE: disable buffering so events arrive incrementally.
        configure: (proxy) => {
          proxy.on("proxyRes", (proxyRes) => {
            proxyRes.headers["cache-control"] = "no-cache";
          });
        },
      },
    },
  },
});
