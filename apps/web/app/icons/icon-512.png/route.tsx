import { ImageResponse } from 'next/og';

export const runtime = 'edge';

/**
 * PWA icon 512×512 — versione "high-res" per splash screen Android e app
 * drawer. Stessa estetica della favicon Kommessa (`icon.tsx`/`apple-icon.tsx`):
 * gradient cobalt→arancio pieno (maskable-safe), "K" bianca.
 *
 * NB: solo `background` gradient singolo — `backgroundImage` multi-layer +
 * `backgroundBlendMode` non sono supportati da Satori e renderizzano bianco.
 */
export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          background:
            'linear-gradient(135deg, #1340A6 0%, #1340A6 55%, #D97706 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
        }}
      >
        <div
          style={{
            fontSize: 350,
            fontWeight: 900,
            color: '#FFFFFF',
            letterSpacing: '-0.06em',
            display: 'flex',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            position: 'relative',
          }}
        >
          K
        </div>
      </div>
    ),
    { width: 512, height: 512 },
  );
}
