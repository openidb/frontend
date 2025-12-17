import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Temporarily disabled for development - re-enable for production build
  // output: 'export',
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
