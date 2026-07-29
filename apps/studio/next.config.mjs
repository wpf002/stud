import { config } from 'dotenv';

// One .env at the workspace root, shared by every surface. Next.js only looks
// in its own directory, so point it up explicitly.
config({ path: new URL('../../.env', import.meta.url).pathname });

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@stud/ui', '@stud/pedigree', '@stud/db'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.r2.cloudflarestorage.com' },
      { protocol: 'https', hostname: '**.amazonaws.com' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
    ],
  },
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000',
    NEXT_PUBLIC_WEB_URL: process.env.NEXT_PUBLIC_WEB_URL ?? 'http://localhost:3000',
    NEXT_PUBLIC_STUDIO_URL: process.env.NEXT_PUBLIC_STUDIO_URL ?? 'http://localhost:3001',
  },
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
  /**
   * Workspace packages are TypeScript source that imports with ESM `.js`
   * extensions — `./graph.js` meaning `./graph.ts`. tsc understands that;
   * webpack does not without being told, so a direct import of one of them
   * fails to resolve at build time while typecheck passes.
   */
  webpack: (cfg) => {
    cfg.resolve.extensionAlias = {
      ...cfg.resolve.extensionAlias,
      '.js': ['.ts', '.tsx', '.js'],
    };
    return cfg;
  },
};

export default nextConfig;
