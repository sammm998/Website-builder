import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ["@redesign/schema", "@redesign/sanitizer", "@redesign/renderer", "@redesign/fonts", "@redesign/motion-runtime"],
  serverExternalPackages: ["@tailwindcss/node", "tailwindcss", "lightningcss", "postgres"],
  async headers() {
    const cors = [
      { key: "Access-Control-Allow-Origin", value: "*" },
      { key: "Cross-Origin-Resource-Policy", value: "cross-origin" },
      { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
    ];
    return [
      { source: "/runtime/:path*", headers: cors },
      { source: "/fonts/:path*", headers: cors },
      {
        source: "/:locale(sv|en)/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default config;
