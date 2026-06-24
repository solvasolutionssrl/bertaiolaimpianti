import { ImageResponse } from 'next/og';

export const runtime = 'edge';

/**
 * PWA icon 192×192 — generata dinamicamente via Satori/ImageResponse
 * per non versionare PNG binari nel repo.
 *
 * Design Kommessa (allineato a favicon `icon.tsx` e `apple-icon.tsx`):
 *  - Gradient cobalt→arancio della suite SOLVA (niente trasparenza: iOS/Android
 *    smussano gli angoli, l'icona resta piena e maskable-safe).
 *  - Logogramma "K" bianco bold centrato nella safe-zone.
 *
 * NB: niente `backgroundImage` multi-layer + `backgroundBlendMode` — Satori
 * (motore di next/og) non li supporta e il riempimento collassa a BIANCO,
 * rendendo il favicon una "K" invisibile su sfondo bianco. Usare solo il
 * `background` gradient singolo, come `icon.tsx` (che si renderizza correttamente).
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
            fontSize: 132,
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
    { width: 192, height: 192 },
  );
}
