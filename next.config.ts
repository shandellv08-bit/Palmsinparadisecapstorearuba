import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const config: NextConfig = {
  poweredByHeader: false,
  experimental: { serverActions: { bodySizeLimit: "1mb" } },
  // Optional: serve Supabase Storage through this site (used for previews where
  // the browser cannot reach the database host directly). Off unless set.
  async rewrites() {
    const target = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (process.env.NEXT_PUBLIC_STORAGE_PROXY !== "1" || !target) return [];
    return [{ source: "/storage/v1/:path*", destination: `${target}/storage/v1/:path*` }];
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default config;
