import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  headers() {
    return [
      {
        // Cross-origin isolation (SharedArrayBuffer) for multi-thread ffmpeg.wasm.
        // Scoped to the temporary speed-test page so other routes are unaffected.
        source: "/studio/:id/edit/speed-test",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
        ],
      },
      {
        // Turbopack serves Web Workers from here; under a COEP page the worker
        // script needs COEP too or the browser blocks it. Ignored on plain scripts.
        source: "/_next/static/:path*",
        headers: [{ key: "Cross-Origin-Embedder-Policy", value: "require-corp" }],
      },
    ];
  },
};

export default nextConfig;
