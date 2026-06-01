/** @type {import('next').NextConfig} */
const nextConfig = {
  // Security headers
  poweredByHeader: false,
  reactCompiler: true,

  // Build optimization
  productionBrowserSourceMaps: false,
  compress: true,
  generateEtags: true,

  // Image optimization
  images: {
    unoptimized: false,
  },

  // Redirects for old URLs if needed
  async redirects() {
    return []
  },

  // Security and performance headers
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=()',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          },
          {
            key: 'Content-Security-Policy',
            value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://wlnjtjwfyxregsrudlas.supabase.co https://*.supabase.co",
          },
        ],
      },
    ]
  },
}

export default nextConfig
