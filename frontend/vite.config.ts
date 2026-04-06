import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import svgr from "vite-plugin-svgr";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    svgr({
      svgrOptions: {
        icon: true,
        // This will transform your SVG to a React component
        exportType: "named",
        namedExport: "ReactComponent",
      },
    }),
  ],

  // 🔴 IMPORTANT: DEV SERVER PROXY (Frontend → Backend)
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:5000", // ✅ BACKEND PORT
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
