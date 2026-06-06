import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["transposeme-icon.svg", "transposeme-icon.png"],
      manifest: {
        name: "TransposeMe",
        short_name: "TransposeMe",
        description: "Shift pitch & tempo of YouTube videos and audio files — locally, instantly.",
        theme_color: "#1a202c",
        background_color: "#1a202c",
        display: "standalone",
        start_url: "/",
        scope: "/",
        icons: [
          {
            src: "transposeme-icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any",
          },
          {
            src: "transposeme-icon.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,wasm,svg,png,ico,txt}"],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/transposeme-server\.onrender\.com\/api\//,
            handler: "NetworkOnly",
          },
        ],
      },
    }),
  ],
  base: "./",
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 1024,
  },
});
