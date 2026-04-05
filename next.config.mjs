/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['cheerio', 'axios'],
    /** Evita serializar el barrel gigante de lucide-react en caché de webpack (warning ~215kiB). */
    optimizePackageImports: ['lucide-react'],
  },
};

export default nextConfig;
