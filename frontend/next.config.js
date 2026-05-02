/** @type {import('next').NextConfig} */
const internalApiBaseUrl = process.env.INTERNAL_API_BASE_URL || 'http://localhost:8000';

const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${internalApiBaseUrl}/api/:path*`,
      },
      {
        source: '/media/:path*',
        destination: `${internalApiBaseUrl}/media/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
