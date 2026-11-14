import type { NextConfig } from "next";

// Express API origin. The browser only ever talks to this Next app; /api/v1 is proxied, so
// session cookies are first-party and no CORS is needed.
const API_ORIGIN = process.env.API_ORIGIN ?? "http://localhost:5000";

const nextConfig: NextConfig = {
  // Standalone build for the Docker image (`web/Dockerfile`); `next dev` is unaffected.
  output: "standalone",
  async rewrites() {
    return [{ source: "/api/v1/:path*", destination: `${API_ORIGIN}/api/v1/:path*` }];
  },
};

export default nextConfig;
