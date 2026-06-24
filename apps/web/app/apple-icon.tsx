import { ImageResponse } from 'next/og';

export const runtime = 'edge';

/**
 * Apple Touch Icon — Kommessa.
 *
 * 180×180 secondo HIG Apple. Niente trasparenza (iOS smussa gli angoli).
 * "K" in evidenza su gradient blu→arancio della suite SOLVA.
 *
 * NB: solo `background` gradient singolo — `backgroundImage` multi-layer +
 * `backgroundBlendMode` non sono supportati da Satori e renderizzano bianco.
 */
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
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
            fontSize: 130,
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
    { ...size },
  );
}
