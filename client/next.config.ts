import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@tibia/protocol"],
};

export default nextConfig;
