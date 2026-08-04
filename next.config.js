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
    serverComponentsExternalPackages: ['fluent-ffmpeg', 'ffmpeg-static'],
    // El binario de ffmpeg-static se resuelve en runtime con path.join(), no con
    // require()/import — el file tracer de Next no lo detecta solo y lo excluye
    // del bundle serverless en Vercel, dejando la conversión a mp4 sin binario.
    outputFileTracingIncludes: {
      '/api/**/*': ['./node_modules/ffmpeg-static/**'],
    },
  },
}

module.exports = nextConfig
