import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 5174,
    hmr: {
      overlay: false,
    },
  },
  // Force Vite to re-optimize dependencies after dependency version changes.
  // This prevents stale prebundled chunks (node_modules/.vite) from causing
  // React context rendering/runtime errors.
  optimizeDeps: {
    force: true,
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id: string) => {
          // React core + React-coupled libraries that call createContext at init time.
          // react-leaflet and @react-leaflet MUST be in this chunk — splitting them
          // into vendor-leaflet causes "Cannot read properties of undefined (reading
          // 'createContext')" because React isn't guaranteed to be initialized first.
          if (
            id.includes("node_modules/react/") ||
            id.includes("node_modules/react-dom/") ||
            id.includes("node_modules/react-leaflet/") ||
            id.includes("node_modules/@react-leaflet/")
          ) {
            return "vendor-react";
          }
          // React ecosystem helpers that are route-agnostic
          if (
            id.includes("node_modules/react-router-dom/") ||
            id.includes("node_modules/@tanstack/react-query/")
          ) {
            return "vendor-react-router-query";
          }
          // Recharts — only loaded on /insights; keep in its own chunk
          if (id.includes("node_modules/recharts/") || id.includes("node_modules/d3-")) {
            return "vendor-recharts";
          }
          // Leaflet core (pure JS, no React dependency) — safe to split
          if (
            id.includes("node_modules/leaflet/") ||
            id.includes("node_modules/leaflet.markercluster/")
          ) {
            return "vendor-leaflet";
          }
          // Radix UI primitives — shared UI components
          if (id.includes("node_modules/@radix-ui/")) {
            return "vendor-radix";
          }
          // Supabase client — auth + data fetching
          if (id.includes("node_modules/@supabase/")) {
            return "vendor-supabase";
          }
        },
      },
    },
  },
}));
