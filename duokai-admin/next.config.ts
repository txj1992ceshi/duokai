import type { NextConfig } from "next";

const adminBasePath = (process.env.ADMIN_BASE_PATH || '').replace(/\/$/, '');

const nextConfig: NextConfig = {
  basePath: adminBasePath || undefined,
};

export default nextConfig;
