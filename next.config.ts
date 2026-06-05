import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    INTERNAL_URL: process.env.INTERNAL_URL || `http://localhost:${process.env.PORT || '3000'}`,
  },
};

export default nextConfig;
