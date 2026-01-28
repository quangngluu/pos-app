import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  experimental: {
    // Automatically optimize package imports to avoid loading entire libraries
    // This provides 15-70% faster dev boot and 28% faster builds
    optimizePackageImports: ['next', 'react', '@supabase/supabase-js'],
  },
  
  // Explicitly set turbopack root to this project directory
  turbopack: {
    root: process.cwd(),
  },
  
  // Security headers for internal-only app
  async headers() {
    const isProduction = process.env.NODE_ENV === "production";
    
    const securityHeaders = [
      {
        key: "X-Robots-Tag",
        value: "noindex, nofollow, noarchive",
      },
      {
        key: "X-Content-Type-Options",
        value: "nosniff",
      },
      {
        key: "Referrer-Policy",
        value: "strict-origin-when-cross-origin",
      },
      {
        key: "X-Frame-Options",
        value: "DENY",
      },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=()",
      },
    ];

    // Add HSTS only in production (requires HTTPS)
    if (isProduction) {
      securityHeaders.push({
        key: "Strict-Transport-Security",
        value: "max-age=31536000; includeSubDomains; preload",
      });
    }

    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
