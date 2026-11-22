import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Fully static build for Firebase Hosting (served from ./out)
  output: "export",
  images: { unoptimized: true },
  reactStrictMode: true,
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
