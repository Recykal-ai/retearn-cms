import type { NextConfig } from "next";

// Derived from AUTH_URL rather than hardcoded, since it's a Cloudflare quick
// tunnel hostname that changes every time the tunnel is restarted — this way
// sharing a fresh tunnel link never requires touching this file again.
function allowedDevOrigins(): string[] {
  const authUrl = process.env.AUTH_URL;
  if (!authUrl) return [];
  try {
    return [new URL(authUrl).hostname];
  } catch {
    return [];
  }
}

const nextConfig: NextConfig = {
  allowedDevOrigins: allowedDevOrigins(),
  experimental: {
    serverActions: {
      // Matches the backend's multer limit (src/routes/documents.ts) — the
      // upload form posts files straight through a Server Action, which
      // defaults to a 1MB request body cap otherwise.
      bodySizeLimit: "50mb",
    },
  },
};

export default nextConfig;
