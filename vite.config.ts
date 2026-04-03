import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
    proxy: {
      "/alpha-api": {
        target: "https://www.alphainvestbot.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/alpha-api/, "/api"),
        secure: true,
      },
      "/unic-api": {
        target: "https://unicbroker.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/unic-api/, "/publicapi"),
        secure: true,
      },
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  optimizeDeps: {
    include: ["react", "react-dom", "react-router-dom", "lightweight-charts", "ably"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
  },
}));
