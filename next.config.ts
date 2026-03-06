import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /** Hide X-Powered-By header. */
  poweredByHeader: false,

  /** Use React strict mode. */
  reactStrictMode: true,
};

export default nextConfig;