import { ImageResponse } from 'next/og';

export const runtime = 'edge';

/**
 * PWA icon 192×192 — generata dinamicamente via Satori/ImageResponse
 * per non versionare PNG binari nel repo (asset master TBD per Bertaiola).
 *
 * Design "Engineering Blueprint":
 *  - Sfondo cobalt brand (#1340A6) con grid pattern bianco al 10%
 *  - Logogramma "X+" in arancio brand (#F26B23), mono bold, slighly italic
 *  - Bordo arrotondato gestito automaticamente da Android come maskable
 *
 * Cache: viene cacheata da Next/Vercel come asset statico (immutable).
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
          backgroundSize: '24px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
        }}
      >
        {/* Accent glow */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'radial-gradient(circle at 70% 80%, rgba(242,107,35,0.35) 0%, transparent 55%)',
            display: 'flex',
          }}
        />
        {/* Logogram "X+" */}
        <div
          style={{
            fontSize: 110,
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
          <span style={{ color: '#FFFFFF', fontSize: 90, marginLeft: 4 }}>+</span>
        </div>
      </div>
    ),
    { width: 192, height: 192 },
  );
}
