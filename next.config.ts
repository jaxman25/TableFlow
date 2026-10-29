import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // PGlite ships a WASM engine; keep it out of the server bundle.
  serverExternalPackages: ["@electric-sql/pglite"],
  poweredByHeader: false,
  // The dev overlay badge sits on top of the UI during reviews.
  devIndicators: false,
  experimental: {
    // Server actions are used for admin mutations; keep the body limit small.
    serverActions: { bodySizeLimit: "256kb" },
  },
};

export default nextConfig;
