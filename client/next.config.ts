import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@tibia/protocol"],
  async headers() {
    return [
      {
        // Atlas sheets, object catalog, and map regions change only when
        // assets are re-ripped: let browsers reuse them across logins for a
        // day, then revalidate in the background for up to a week.
        source: "/assets/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, stale-while-revalidate=604800",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
