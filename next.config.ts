import type { NextConfig } from "next";

const nextConfig: NextConfig = process.env.MADORI_E2E === '1'
  ? { distDir: '.next-e2e' }
  : {};

export default nextConfig;
