import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // atproto loopback OAuth requires visiting the app at 127.0.0.1 in dev
  allowedDevOrigins: ['127.0.0.1'],
  cacheComponents: true,
  partialPrefetching: true,
  reactCompiler: true,
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
}

export default nextConfig
