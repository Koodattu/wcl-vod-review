import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "render.worldofwarcraft.com",
        port: "",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;
