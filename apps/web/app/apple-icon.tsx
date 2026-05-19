import { ImageResponse } from 'next/og';

export const runtime = 'edge';

/**
 * Apple Touch Icon — Next 14 Metadata API genera automaticamente
 * <link rel="apple-touch-icon" href="/apple-icon"> e lo serve a iOS
 * quando l'utente fa "Aggiungi a Home".
 *
 * 180×180 secondo HIG Apple. Niente trasparenza (iOS applica già la
 * smussatura agli angoli).
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
          background: '#1340A6',
          backgroundImage:
            'linear-gradient(to right, rgba(255,255,255,0.10) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.10) 1px, transparent 1px)',
          backgroundSize: '22px 22px',
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
              'radial-gradient(circle at 70% 80%, rgba(242,107,35,0.35) 0%, transparent 55%)',
            display: 'flex',
          }}
        />
        <div
          style={{
            fontSize: 105,
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
          <span style={{ color: '#FFFFFF', fontSize: 84, marginLeft: 4 }}>+</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
