// Fogli da stampare: next/image carica le immagini pigramente e in stampa
// uscirebbero dei buchi bianchi. Qui servono <img> normali.
/* eslint-disable @next/next/no-img-element */

import React from 'react';

export type TemplateProps = {
  qrDataUrl: string;
  url: string;
  titolo: string;
  codice: string | null;
  cliente: string | null;
  indirizzo: string | null;
  tenant: {
    nome: string;
    logoUrl: string | null;
    brandColor: string | null;
  };
};

const A4: React.CSSProperties = {
  width: '210mm',
  height: '297mm',
  boxSizing: 'border-box',
  position: 'relative',
  overflow: 'hidden',
  backgroundColor: '#ffffff',
};

/* ------------------------------------------------------------------ */
/* Template: Essenziale                                                 */
/* ------------------------------------------------------------------ */
export function EssenzialeTemplate({
  qrDataUrl,
  titolo,
  codice,
  tenant,
}: TemplateProps) {
  return (
    <div style={A4}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          height: '100%',
          padding: '18mm 16mm',
          boxSizing: 'border-box',
          gap: '0',
        }}
      >
        {/* Logo / nome tenant */}
        <div style={{ marginBottom: '10mm', textAlign: 'center' }}>
          {tenant.logoUrl ? (
            <img
              src={tenant.logoUrl}
              alt={tenant.nome}
              style={{ maxHeight: '14mm', maxWidth: '60mm', objectFit: 'contain' }}
            />
          ) : (
            <span
              style={{
                fontSize: '15pt',
                fontWeight: 700,
                color: '#475569',
                letterSpacing: '0.02em',
                fontFamily: 'sans-serif',
              }}
            >
              {tenant.nome}
            </span>
          )}
        </div>

        {/* QR code */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <img
            src={qrDataUrl}
            alt="QR code timbratura"
            style={{ width: '130mm', height: '130mm', imageRendering: 'pixelated' }}
          />
        </div>

        {/* Titolo commessa */}
        <div style={{ textAlign: 'center', marginTop: '8mm' }}>
          <p
            style={{
              fontSize: '30pt',
              fontWeight: 800,
              color: '#0f172a',
              fontFamily: 'sans-serif',
              margin: 0,
              lineHeight: 1.15,
              letterSpacing: '-0.01em',
            }}
          >
            {titolo}
          </p>
          {codice && (
            <p
              style={{
                fontSize: '14pt',
                color: '#64748b',
                fontFamily: 'monospace',
                margin: '4mm 0 0',
                letterSpacing: '0.04em',
              }}
            >
              {codice}
            </p>
          )}
        </div>

        {/* Istruzione */}
        <p
          style={{
            marginTop: '8mm',
            fontSize: '13pt',
            fontWeight: 600,
            color: '#64748b',
            fontFamily: 'sans-serif',
            textAlign: 'center',
            letterSpacing: '0.01em',
          }}
        >
          Inquadra il QR per timbrare ingresso e uscita
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Template: Cartello cantiere                                          */
/* ------------------------------------------------------------------ */
export function CartelloTemplate({
  qrDataUrl,
  titolo,
  codice,
  cliente,
  indirizzo,
  tenant,
}: TemplateProps) {
  const accent = tenant.brandColor ?? '#0f172a';

  return (
    <div style={A4}>
      {/* Fascia colorata in cima */}
      <div
        style={{
          backgroundColor: accent,
          padding: '10mm 12mm 8mm',
          display: 'flex',
          alignItems: 'center',
          gap: '6mm',
        }}
      >
        {tenant.logoUrl ? (
          <img
            src={tenant.logoUrl}
            alt={tenant.nome}
            style={{ maxHeight: '12mm', maxWidth: '40mm', objectFit: 'contain', filter: 'brightness(0) invert(1)' }}
          />
        ) : (
          <span
            style={{
              fontSize: '15pt',
              fontWeight: 800,
              color: '#ffffff',
              fontFamily: 'sans-serif',
              letterSpacing: '0.02em',
            }}
          >
            {tenant.nome}
          </span>
        )}
        <div style={{ flex: 1 }} />
        <span
          style={{
            fontSize: '13pt',
            fontWeight: 800,
            color: '#ffffff',
            fontFamily: 'sans-serif',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          TIMBRATURA PRESENZE
        </span>
      </div>

      {/* Corpo */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '10mm 16mm 8mm',
          boxSizing: 'border-box',
          gap: '0',
        }}
      >
        {/* Titolo commessa */}
        <p
          style={{
            fontSize: '26pt',
            fontWeight: 800,
            color: '#0f172a',
            fontFamily: 'sans-serif',
            textAlign: 'center',
            margin: '0 0 2mm',
            lineHeight: 1.15,
            letterSpacing: '-0.01em',
          }}
        >
          {titolo}
        </p>
        {codice && (
          <p
            style={{
              fontSize: '12pt',
              color: '#64748b',
              fontFamily: 'monospace',
              margin: '0 0 6mm',
              letterSpacing: '0.04em',
            }}
          >
            {codice}
          </p>
        )}

        {/* Riquadro QR */}
        <div
          style={{
            border: `2px solid ${accent}`,
            borderRadius: '4mm',
            padding: '6mm',
            display: 'inline-flex',
            backgroundColor: '#ffffff',
          }}
        >
          <img
            src={qrDataUrl}
            alt="QR code timbratura"
            style={{ width: '120mm', height: '120mm', imageRendering: 'pixelated' }}
          />
        </div>

        {/* Dati cantiere */}
        {(cliente || indirizzo) && (
          <div
            style={{
              marginTop: '8mm',
              textAlign: 'center',
              fontFamily: 'sans-serif',
            }}
          >
            {cliente && (
              <p style={{ fontSize: '13pt', fontWeight: 600, color: '#334155', margin: '0 0 1mm' }}>
                {cliente}
              </p>
            )}
            {indirizzo && (
              <p style={{ fontSize: '11pt', color: '#64748b', margin: 0 }}>
                {indirizzo}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          borderTop: `1px solid #e2e8f0`,
          padding: '4mm 12mm',
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        <p style={{ fontSize: '11pt', fontWeight: 600, color: '#64748b', fontFamily: 'sans-serif', margin: 0 }}>
          Inquadra il QR per timbrare ingresso e uscita
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Template: Industriale                                                */
/* ------------------------------------------------------------------ */
export function IndustrialeTemplate({
  qrDataUrl,
  titolo,
  codice,
  cliente,
  indirizzo,
  tenant,
}: TemplateProps) {
  const accent = tenant.brandColor ?? '#0f172a';

  return (
    <div
      style={{
        ...A4,
        backgroundColor: '#0f172a',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header scuro */}
      <div
        style={{
          backgroundColor: accent,
          padding: '8mm 12mm 6mm',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        {tenant.logoUrl ? (
          <img
            src={tenant.logoUrl}
            alt={tenant.nome}
            style={{
              maxHeight: '10mm',
              maxWidth: '40mm',
              objectFit: 'contain',
              filter: 'brightness(0) invert(1)',
            }}
          />
        ) : (
          <span
            style={{
              fontSize: '13pt',
              fontWeight: 800,
              color: '#ffffff',
              fontFamily: 'sans-serif',
            }}
          >
            {tenant.nome}
          </span>
        )}
        <span
          style={{
            fontSize: '12pt',
            fontWeight: 800,
            color: '#ffffff',
            fontFamily: 'monospace',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
          }}
        >
          TIMBRATURA PRESENZE
        </span>
      </div>

      {/* Corpo */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '6mm 16mm',
          gap: '0',
        }}
      >
        {/* QR XXL */}
        <div
          style={{
            backgroundColor: '#ffffff',
            padding: '5mm',
            borderRadius: '3mm',
            display: 'inline-flex',
          }}
        >
          <img
            src={qrDataUrl}
            alt="QR code timbratura"
            style={{ width: '145mm', height: '145mm', imageRendering: 'pixelated' }}
          />
        </div>

        {/* Titolo molto grande */}
        <p
          style={{
            fontSize: '34pt',
            fontWeight: 900,
            color: '#f8fafc',
            fontFamily: 'sans-serif',
            textAlign: 'center',
            margin: '8mm 0 0',
            lineHeight: 1.08,
            letterSpacing: '-0.015em',
          }}
        >
          {titolo}
        </p>

        {codice && (
          <p
            style={{
              fontSize: '14pt',
              color: '#94a3b8',
              fontFamily: 'monospace',
              margin: '4mm 0 0',
              letterSpacing: '0.08em',
            }}
          >
            {codice}
          </p>
        )}

        {(cliente || indirizzo) && (
          <div style={{ marginTop: '5mm', textAlign: 'center' }}>
            {cliente && (
              <p
                style={{
                  fontSize: '13pt',
                  fontWeight: 600,
                  color: '#cbd5e1',
                  fontFamily: 'sans-serif',
                  margin: '0 0 1mm',
                }}
              >
                {cliente}
              </p>
            )}
            {indirizzo && (
              <p style={{ fontSize: '12pt', color: '#64748b', fontFamily: 'sans-serif', margin: 0 }}>
                {indirizzo}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div
        style={{
          padding: '4mm 12mm',
          borderTop: '1px solid #1e293b',
          textAlign: 'center',
        }}
      >
        <p
          style={{
            fontSize: '11pt',
            fontWeight: 600,
            color: '#64748b',
            fontFamily: 'sans-serif',
            margin: 0,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}
        >
          Inquadra il QR per timbrare ingresso e uscita
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Registry                                                             */
/* ------------------------------------------------------------------ */
export const TEMPLATE_COMPONENTS: Record<string, React.ComponentType<TemplateProps>> = {
  essenziale: EssenzialeTemplate,
  cartello: CartelloTemplate,
  industriale: IndustrialeTemplate,
};
