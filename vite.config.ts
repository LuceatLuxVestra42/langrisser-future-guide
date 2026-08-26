// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  // GitHub Pages feasibility branch: this repository is served below /langrisser-future-guide/.
  vite: {
    base: "/langrisser-future-guide/",
  },
  // GitHub Pages is static hosting, so Nitro's server adapter is intentionally disabled
  // for this isolated feasibility branch. This also avoids the known Nitro v3 +
  // TanStack prerender preview-server output-path conflict.
  nitro: false,
  tanstackStart: {
    server: { entry: "server" },
    prerender: {
      enabled: true,
      autoStaticPathsDiscovery: false,
      crawlLinks: false,
      failOnError: true,
    },
    pages: [
      {
        path: "/banners",
        prerender: {
          enabled: true,
          outputPath: "/banners/index.html",
        },
      },
    ],
  },
});
