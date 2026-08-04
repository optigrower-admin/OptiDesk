/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.r2.cloudflarestorage.com',
      },
      {
        protocol: 'https',
        hostname: 'drive.google.com',
      },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '550mb',
    },
    serverComponentsExternalPackages: ['fluent-ffmpeg', 'ffmpeg-static', 'puppeteer-core', '@sparticuz/chromium'],
    // El binario de ffmpeg-static se resuelve en runtime con path.join(), no con
    // require()/import — el file tracer de Next no lo detecta solo y lo excluye
    // del bundle serverless en Vercel, dejando la conversión a mp4 sin binario.
    // Mismo problema con el binario de Chromium que trae @sparticuz/chromium
    // (usado para controlar el navegador headless de Progreser).
    outputFileTracingIncludes: {
      '/api/**/*': ['./node_modules/ffmpeg-static/**', './node_modules/@sparticuz/chromium/bin/**'],
    },
  },
}

module.exports = nextConfig
