import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

const supabaseOrigin = (() => {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    return url ? new URL(url).origin : "";
  } catch {
    return "";
  }
})();

// Vercel preview deployments inject a feedback toolbar from vercel.live.
// Production deployments never load it, so production keeps the tight policy.
const vercelPreview = process.env.VERCEL_ENV === "preview";
const live = (extra: string) => (vercelPreview ? ` ${extra}` : "");

// Content-Security-Policy: the app talks only to itself (all external APIs are
// called from the server), so the browser policy can stay tight.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}${live("https://vercel.live")}`,
  `style-src 'self' 'unsafe-inline'${live("https://vercel.live")}`,
  `img-src 'self' data: blob:${live("https://vercel.live https://vercel.com")}`,
  `font-src 'self' data:${live("https://vercel.live https://assets.vercel.com")}`,
  `connect-src 'self'${supabaseOrigin ? ` ${supabaseOrigin}` : ""}${isDev ? " ws: wss:" : ""}${live("https://vercel.live wss://ws-us3.pusher.com")}`,
  `frame-src ${vercelPreview ? "https://vercel.live" : "'none'"}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Never print Server Function arguments (they contain financial values).
  logging: { serverFunctions: false },
  serverExternalPackages: ["@electric-sql/pglite", "postgres"],
  experimental: {
    serverActions: {
      // Backups and CSV imports are sent through Server Actions. Vercel caps
      // request bodies at 4.5 MB, so the app keeps uploads under 4 MB.
      bodySizeLimit: "4.5mb",
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
};

export default nextConfig;
