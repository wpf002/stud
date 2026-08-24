import { config } from 'dotenv';

// One .env at the workspace root, shared by every surface. Next.js only looks
// in its own directory, so point it up explicitly.
config({ path: new URL('../../.env', import.meta.url).pathname });

/** @type {import('next').NextConfig} */
const nextConfig = {
  /**
   * Dev and production builds get separate output directories.
   *
   * They defaulted to sharing `.next`, so every `pnpm build` clobbered the
   * running dev server's chunks — which then failed every request with
   * "Cannot find module './vendor-chunks/…'" until `.next` was deleted and
   * the server restarted. `next build` runs with NODE_ENV=production and
   * `next start` reads the same production dir, so both sides keep working.
   */
  distDir: process.env.NODE_ENV === 'development' ? '.next-dev' : '.next',
  reactStrictMode: true,
  transpilePackages: ['@stud/ui', '@stud/pedigree', '@stud/db'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.r2.cloudflarestorage.com' },
      { protocol: 'https', hostname: '**.amazonaws.com' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
      // Breed photos in the seeded dataset — see docs/photo-credits.md.
      { protocol: 'https', hostname: 'upload.wikimedia.org' },
    ],
  },
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000',
    // NEXT_PUBLIC_WEB_URL is deliberately absent. Listing it here would pin
    // this file's localhost fallback into the bundle whenever the variable
    // is unset — which is the production case, since the site's origin now
    // comes from RAILWAY_PUBLIC_DOMAIN. Note that omitting it does NOT make
    // it a runtime read: Next inlines every NEXT_PUBLIC_* reference at build
    // time regardless. That is precisely why lib/site-url.ts resolves the
    // origin from bare (non-NEXT_PUBLIC_) variables instead.
  },
  /**
   * The browser only ever talks to this app's own origin for `/v1/*` — this
   * proxies it through to the API server-side.
   *
   * Deployed, web and api are separate hosts (different services, each on
   * its own *.up.railway.app subdomain — different registrable "sites" as
   * far as a browser is concerned). A cookie the API sets is scoped to the
   * API's own host, so a direct cross-origin browser call is the ONLY way
   * it's ever visible to the browser at all — and a server-rendered page's
   * own request to the API never carries it either, since that cookie was
   * never sent to THIS origin in the first place. Routing browser calls
   * through this same-origin path means the Set-Cookie the browser actually
   * sees comes from this host, so it rides along on every later page load
   * here too — which is what server components forwarding the incoming
   * cookie jar (serverApi, my/applications) depend on.
   */
  async rewrites() {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
    return [{ source: '/v1/:path*', destination: `${apiUrl}/v1/:path*` }];
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
