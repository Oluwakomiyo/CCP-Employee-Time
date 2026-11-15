import type { NextConfig } from "next";

// Express API origin. The browser only ever talks to this Next app; /api/v1 is proxied, so
// session cookies are first-party and no CORS is needed.
// The rewrite is fixed at BUILD time, so API_ORIGIN must be set before `next build` (Vercel:
// Project Settings → Environment Variables, then redeploy). Without it a Vercel build would
// silently proxy to localhost, which Vercel rejects (DNS_HOSTNAME_RESOLVED_PRIVATE).
if (process.env.VERCEL && !process.env.API_ORIGIN) {
  throw new Error("API_ORIGIN is not set. Add it in Vercel → Settings → Environment Variables (e.g. https://your-api.up.railway.app), then redeploy.");
}
const API_ORIGIN = (process.env.API_ORIGIN ?? "http://localhost:5000").replace(/\/+$/, "");

const nextConfig: NextConfig = {
  // Standalone build for the Docker image (`web/Dockerfile`); `next dev` is unaffected.
  output: "standalone",
  async rewrites() {
    return [
      { source: "/api/v1/:path*", destination: `${API_ORIGIN}/api/v1/:path*` },
      // The user guide (public/help, built by scripts/build-guides.py).
      { source: "/help", destination: "/help/index.html" },
      { source: "/help/developers", destination: "/help/developers.html" },
    ];
  },
};

export default nextConfig;
