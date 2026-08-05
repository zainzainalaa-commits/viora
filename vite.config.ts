import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import pkg from "./package.json" with { type: "json" };

declare const process: { env: Record<string, string | undefined> };

export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __IS_BETA_BUILD__: JSON.stringify(process.env.HARBOR_CHANNEL !== "stable"),
  },
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  resolve: {
    alias: { "@": "/src" },
  },
  build: {
    rollupOptions: {
      output: {
        // A single 3 MB entry chunk has to be parsed before anything renders,
        // which is painful on Android TV boxes and low-end phones. Splitting the
        // heavy, rarely-changing libraries out lets them cache independently and
        // keeps the startup chunk small.
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("hls.js") || id.includes("mpegts.js")) return "vendor-streaming";
          if (id.includes("lottie-web")) return "vendor-lottie";
          if (
            id.includes("react-markdown") ||
            id.includes("remark") ||
            id.includes("rehype") ||
            id.includes("micromark") ||
            id.includes("mdast") ||
            id.includes("hast") ||
            id.includes("unist") ||
            id.includes("unified")
          ) {
            return "vendor-markdown";
          }
          if (id.includes("lucide-react")) return "vendor-icons";
          if (id.includes("react-dom") || id.includes("/react/") || id.includes("scheduler")) {
            return "vendor-react";
          }
        },
      },
    },
  },
});
