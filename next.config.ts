import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "images-prod.r2.rentfaster.ca",
      },
      {
        protocol: "https",
        hostname: "rf-images-prod-bcdn.rentfaster.ca",
      },
    ],
  },
};

export default nextConfig;
