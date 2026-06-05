import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
};

// Temporary: log all HTTPS fetch calls to find the SSL error source
const originalFetch = globalThis.fetch;
globalThis.fetch = async (...args: Parameters<typeof fetch>) => {
  const input = args[0];
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
  if (url.startsWith('https://')) {
    console.error('[FETCH DEBUG] HTTPS request to:', url);
    console.error('[FETCH DEBUG] Stack:', new Error().stack);
  }
  return originalFetch(...args);
};

export default nextConfig;
