import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["logo-mark.png", "logo-full.png"],
      manifest: {
        name: "TeleInfra — Audit Pylône",
        short_name: "TI Audit",
        description: "Collecte terrain des audits de pylônes — TELEINFRA Cameroon",
        theme_color: "#1A888E",
        background_color: "#F5F6F5",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // App shell + assets en cache ; les appels /api/* sont gérés par notre propre
        // logique de queue offline (Dexie), pas par le service worker.
        globPatterns: ["**/*.{js,css,html,png,svg,ico}"],
        navigateFallback: "/index.html",
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/uploads/"),
            handler: "CacheFirst",
            options: { cacheName: "media-cache" },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: process.env.VITE_API_PROXY_TARGET || "http://localhost:4000",
        changeOrigin: true,
      },
      "/uploads": {
        target: process.env.VITE_API_PROXY_TARGET || "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
});
