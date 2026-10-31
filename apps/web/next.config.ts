import path from "node:path";
import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'" + (process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""),
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Monorepo: medtag workspace-pakker ved sporing af serverfiler (Vercel).
  outputFileTracingRoot: path.join(__dirname, "../.."),
  transpilePackages: [
    "@agency/core",
    "@agency/shared",
    "@agency/ui",
    "@agency/integrations",
    "@agency/research",
    "@agency/quotes",
    "@agency/production",
    "@agency/crm",
    "@agency/dashboard",
    "@agency/orchestrator",
    "@agency/aos",
  ],
  serverExternalPackages: ["@anthropic-ai/sdk", "undici", "pdf-lib"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
