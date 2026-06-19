'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { TEMPLATE_QR, risolviTemplateQr } from '@kommessa/api/kantiere-qr';
import { type TemplateProps, TEMPLATE_COMPONENTS } from './templates';

type StampaQrClientProps = TemplateProps & {
  templateIniziale: string;
};

export function StampaQrClient({
  templateIniziale,
  ...templateProps
}: StampaQrClientProps) {
  const [template, setTemplate] = useState<string>(risolviTemplateQr(templateIniziale));

  const TemplateComp = TEMPLATE_COMPONENTS[template] ?? TEMPLATE_COMPONENTS['essenziale']!;

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          @page { size: A4; margin: 0; }
          html, body { background: #fff !important; }
          .preview-backdrop { background: transparent !important; padding: 0 !important; }
        }
      `}</style>

      {/* Toolbar — nascosta in stampa */}
      <div
        className="no-print"
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          backgroundColor: '#f8fafc',
          borderBottom: '1px solid #e2e8f0',
          padding: '10px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          flexWrap: 'wrap',
        }}
      >
        {/* Selezione template */}
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 500, marginRight: '4px' }}>
            Template:
          </span>
          {TEMPLATE_QR.map((t) => (
            <button
              key={t.id}
              onClick={() => setTemplate(t.id)}
              title={t.descrizione}
              style={{
                padding: '5px 14px',
                borderRadius: '99px',
                border: template === t.id ? '2px solid #0f172a' : '1px solid #cbd5e1',
                backgroundColor: template === t.id ? '#0f172a' : '#ffffff',
                color: template === t.id ? '#ffffff' : '#334155',
                fontSize: '12px',
                fontWeight: template === t.id ? 600 : 400,
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {t.nome}
            </button>
          ))}
        </div>

        <div style={{ flex: 1 }} />

        {/* Indietro */}
        <Link
          href="/office/kantiere/qr"
          style={{
            padding: '6px 14px',
            borderRadius: '6px',
            border: '1px solid #cbd5e1',
            backgroundColor: '#ffffff',
            color: '#334155',
            fontSize: '13px',
            textDecoration: 'none',
            fontWeight: 500,
          }}
        >
          Indietro
        </Link>

        {/* Stampa / Salva PDF */}
        <button
          onClick={() => window.print()}
          style={{
            padding: '7px 18px',
            borderRadius: '6px',
            border: 'none',
            backgroundColor: '#0f172a',
            color: '#ffffff',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Stampa / Salva PDF
        </button>
      </div>

      {/* Anteprima su sfondo grigio (WYSIWYG: stessa resa della stampa) */}
      <div
        className="preview-backdrop"
        style={{
          backgroundColor: '#e2e8f0',
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'center',
          padding: '32px 16px',
        }}
      >
        <div
          style={{
            boxShadow: '0 4px 32px rgba(0,0,0,0.18)',
          }}
        >
          <TemplateComp {...templateProps} />
        </div>
      </div>
    </>
  );
}
