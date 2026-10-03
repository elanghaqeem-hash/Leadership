import type { NextConfig } from 'next';
import path from 'node:path';

const isProd=process.env.NODE_ENV==='production';
const csp=[
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProd?'':" 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isProd?['upgrade-insecure-requests']:[]),
].join('; ');

const securityHeaders=[
  {key:'Content-Security-Policy',value:csp},
  {key:'X-Content-Type-Options',value:'nosniff'},
  {key:'X-Frame-Options',value:'DENY'},
  {key:'Referrer-Policy',value:'strict-origin-when-cross-origin'},
  {key:'Permissions-Policy',value:'camera=(), microphone=(), geolocation=(), payment=(), usb=()'},
  {key:'Cross-Origin-Opener-Policy',value:'same-origin'},
  {key:'Cross-Origin-Resource-Policy',value:'same-origin'},
  ...(isProd?[{key:'Strict-Transport-Security',value:'max-age=31536000; includeSubDomains'}]:[]),
];

const nextConfig: NextConfig = {
  // OpenNext/@vercel-nft currently misses the workerd-conditioned files from
  // pg-cloudflare. Trace from the monorepo root and force those runtime files
  // into every server trace used by the Cloudflare bundle.
  outputFileTracingRoot: path.resolve(process.cwd(), '../..'),
  outputFileTracingIncludes: {
    '/*': [
      '../../node_modules/pg-cloudflare/dist/**',
      '../../node_modules/pg-cloudflare/esm/**',
    ],
  },
  transpilePackages: ['@ltw/authz', '@ltw/db', '@ltw/imports', '@ltw/scoring'],
  poweredByHeader: false,
  experimental: { serverActions: { bodySizeLimit: '2mb' } },
  async headers(){
    return[{source:'/:path*',headers:securityHeaders}];
  },
};
export default nextConfig;
