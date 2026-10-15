/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // pdf-parse reads files at import time; keep it external to the app bundle
    serverComponentsExternalPackages: ['pdf-parse'],
  },
};

export default nextConfig;
