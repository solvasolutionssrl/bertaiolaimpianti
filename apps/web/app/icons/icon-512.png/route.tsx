import { ImageResponse } from 'next/og';

export const runtime = 'edge';

/**
 * PWA icon 512×512 — versione "high-res" per splash screen Android
 * e app drawer. Stessa estetica di icon-192 ma con grid più fine,
 * glow più ampio e logogramma più grande.
 */
export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: '#1340A6',
          backgroundImage:
            'linear-gradient(to right, rgba(255,255,255,0.10) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.10) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'radial-gradient(circle at 70% 80%, rgba(242,107,35,0.4) 0%, transparent 55%)',
            display: 'flex',
          }}
        />
        <div
          style={{
            fontSize: 300,
            fontWeight: 900,
            color: '#F26B23',
            letterSpacing: '-0.06em',
            display: 'flex',
            alignItems: 'baseline',
            position: 'relative',
            fontFamily: 'monospace',
          }}
        >
          <span>X</span>
          <span style={{ color: '#FFFFFF', fontSize: 240, marginLeft: 12 }}>+</span>
        </div>
      </div>
    ),
    { width: 512, height: 512 },
  );
}
