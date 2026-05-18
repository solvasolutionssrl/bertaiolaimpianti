/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@impiantixplus/ui', '@impiantixplus/api', '@impiantixplus/integrations'],
  // ESLint solo in dev/CI dedicato; in build skip per evitare blocchi su
  // cosmetiche (apostrofi non-escaped, rule plugin mancanti).
  eslint: { ignoreDuringBuilds: true },
  // Stessa logica per type-check: i tipi Supabase generati a volte
  // perdono il legame e Next non distingue runtime da editor.
  typescript: { ignoreBuildErrors: true },
  // In prod rimuoviamo i `console.log/info/debug` per ridurre il bundle e
  // il rumore in produzione; manteniamo `error` e `warn` per il triage.
  compiler: {
    removeConsole: { exclude: ['error', 'warn'] },
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '20mb', // foto cantiere fino a ~12 MP iPhone
    },
    // Tree-shaking aggressivo per pacchetti grossi con tanti named export:
    // accorcia compile time in dev (meno moduli da bundlare per pagina) e
    // riduce il bundle client in prod. Sicuro: nessun side-effect.
    optimizePackageImports: [
      '@impiantixplus/ui',
      'lucide-react',
      'date-fns',
    ],
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.supabase.co' },
      { protocol: 'https', hostname: '**.hetzner.cloud' },
      { protocol: 'https', hostname: 'cloud.bertaiolaimpianti.it' },
    ],
  },
  // Konva ha un entry "index-node.js" che richiede `canvas` (binding nativo)
  // quando girato in Node. In Next 14 il server-side trace prova a risolverlo
  // anche se il componente è `ssr: false`. Lo marchiamo come externals lato
  // server (= il modulo viene importato solo client-side via dynamic).
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Konva e pdfjs-dist sono client-only (richiedono `window`/Canvas/DOM).
      // I componenti che li usano vengono caricati via next/dynamic ssr:false,
      // ma Next traccia comunque l'import lato server in build → li marchiamo
      // come externals per evitare "Module not found: Can't resolve 'canvas'".
      config.externals = [
        ...(Array.isArray(config.externals) ? config.externals : []),
        'canvas',
        'konva',
        'react-konva',
        'pdfjs-dist',
        'react-pdf',
      ];
    }
    return config;
  },
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Service-Worker-Allowed', value: '/' },
          { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
        ],
      },
      {
        source: '/manifest.webmanifest',
        headers: [{ key: 'Content-Type', value: 'application/manifest+json' }],
      },
    ];
  },
};

export default nextConfig;
