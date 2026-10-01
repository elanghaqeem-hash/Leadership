import type { NextConfig } from 'next';
const nextConfig: NextConfig = {
  transpilePackages: ['@ltw/authz', '@ltw/db', '@ltw/imports', '@ltw/scoring'],
  poweredByHeader: false,
  experimental: { serverActions: { bodySizeLimit: '2mb' } },
};
export default nextConfig;
