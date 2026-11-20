import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev client (HMR) proxies to the Agent Office server. changeOrigin makes the Host header match the
// server's DNS-rebinding check; the Origin (127.0.0.1:5173) is on the server's allow-list.
const port = process.env.AO_PORT ?? "4317";
export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1", port: 5173,
    proxy: {
      "/api": { target: `http://127.0.0.1:${port}`, changeOrigin: true },
      "/ws": { target: `ws://127.0.0.1:${port}`, ws: true, changeOrigin: true },
    },
  },
});
