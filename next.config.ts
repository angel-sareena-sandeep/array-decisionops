import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /** Disable the X-Powered-By header to avoid leaking framework info. */
  poweredByHeader: false,

  /** Strict-mode React for catching unsafe patterns in development. */
  reactStrictMode: true,
};

export default nextConfig;