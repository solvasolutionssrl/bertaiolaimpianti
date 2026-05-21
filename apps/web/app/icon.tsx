import { ImageResponse } from 'next/og';

/**
 * Favicon dinamica per Kommessa.
 *
 * Una "K" Geist-mono bianca su gradient blu→arancio, in tondo, per
 * richiamare l'identità impiantiX (stessa suite SOLVA) ma riconoscibile
 * come prodotto distinto.
 *
 * Next 14 Metadata API genera automaticamente i tag <link rel="icon">
 * dei browser + Apple touch icon a partire da questo file.
 */

export const size = { width: 64, height: 64 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background:
            'linear-gradient(135deg, #1340A6 0%, #1340A6 55%, #D97706 100%)',
          color: 'white',
          fontSize: 44,
          fontWeight: 800,
          fontFamily: 'system-ui, -apple-system, sans-serif',
          letterSpacing: '-0.04em',
          borderRadius: 14,
        }}
      >
        K
      </div>
    ),
    { ...size },
  );
}
