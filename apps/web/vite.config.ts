import { defineConfig, type HtmlTagDescriptor, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// Build-SHA provenance (issue #1713, PR-1) — an explicit named plugin, not
// Vite's native %VITE_BUILD_SHA% HTML substitution. The native mechanism
// leaves the literal unexpanded token in the served HTML when the env var is
// unset, which is an ambiguous failure a reviewer could easily misread as
// "worked". This plugin instead ALWAYS emits a real, well-formed
// <meta name="build-sha"> tag: the real value when VITE_BUILD_SHA is set at
// build time, or the explicit, unambiguous "local-dev" sentinel when it is
// not — a value that can never be mistaken for a real git SHA. See
// e2e/canonical/canonical-harness-smoke.canonical.ts for the one assertion
// that reads this tag and (when EXPECTED_BUILD_SHA is set) fails the build
// if the content is still the "local-dev" fallback.
//
// The value is defence-in-depth validated before injection: VITE_BUILD_SHA
// is operator/CI-set today (git rev-parse HEAD), not attacker-controlled,
// but it still flows into an HTML attribute value via Vite's
// HtmlTagDescriptor and this repo could not confirm from the Vite source
// that attribute-value escaping is guaranteed there. Rather than leave that
// as an open question, only a bare hex git SHA (7-40 hex chars, the range
// git itself uses for abbreviated-to-full SHAs) or the literal "local-dev"
// sentinel is accepted; anything else fails the build loudly instead of
// being injected as-is.
const BUILD_SHA_PATTERN = /^[0-9a-f]{7,40}$/i;

function resolveBuildSha(): string {
  const raw = process.env.VITE_BUILD_SHA?.trim();
  if (!raw) return "local-dev";
  if (!BUILD_SHA_PATTERN.test(raw)) {
    throw new Error(
      `[build-sha-meta] VITE_BUILD_SHA ("${raw}") is not a valid git SHA (expected 7-40 hex characters). ` +
      'Refusing to inject an unvalidated value into the built HTML. Set it to a real ' +
      '`git rev-parse HEAD` (or a valid abbreviation), or leave it unset to use the "local-dev" fallback.',
    );
  }
  return raw;
}

function buildShaMetaPlugin(): Plugin {
  return {
    name: "build-sha-meta",
    transformIndexHtml(): HtmlTagDescriptor[] {
      return [
        {
          tag: "meta",
          attrs: { name: "build-sha", content: resolveBuildSha() },
          injectTo: "head",
        },
      ];
    },
  };
}

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
  plugins: [react(), buildShaMetaPlugin(), mode === "development" && componentTagger()].filter(Boolean),
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
