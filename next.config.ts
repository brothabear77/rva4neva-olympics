import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a self-contained server (server.js plus only the files it needs) instead of
  // relying on a full node_modules at runtime. That is what keeps the container image
  // small. It does NOT copy public/ or .next/static; the Dockerfile does that.
  output: "standalone",
};

export default nextConfig;
