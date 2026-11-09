import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a self-contained server (server.js plus only the files it needs) instead of
  // relying on a full node_modules at runtime. That is what keeps the container image
  // small. It does NOT copy public/ or .next/static; the Dockerfile does that.
  output: "standalone",
  // The sign-up page used to be /claim.
  async redirects() {
    return [{ source: "/claim", destination: "/register", permanent: true }];
  },
};

export default nextConfig;
