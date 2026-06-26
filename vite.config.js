import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

// `vite build --mode electron` forces the packaged desktop app to talk to the
// backend it spawns locally (main.cjs) instead of the Render server. That backend
// runs on the user's own connection — a residential IP YouTube rarely blocks — so
// desktop sidesteps the datacenter cookie/bot problem entirely.
// (Requires yt-dlp, ffmpeg, rubberband and python+essentia installed locally.)
export default defineConfig(({ mode }) => ({
  define:
    mode === "electron"
      ? {
          "import.meta.env.VITE_API_BASE_URL": JSON.stringify(
            "http://localhost:4000",
          ),
        }
      : {},
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
}));
