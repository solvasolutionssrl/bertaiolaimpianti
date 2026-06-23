'use client';

import React, { useRef, useState } from 'react';
import Link from 'next/link';
import { TEMPLATE_QR, risolviTemplateQr } from '@kommessa/api/kantiere-qr';
import { type TemplateProps, TEMPLATE_COMPONENTS } from './templates';

type StampaQrClientProps = TemplateProps & {
  templateIniziale: string;
};

/** Nome file "compilato" automaticamente dal codice o dal titolo del cantiere. */
function nomeFilePdf(codice: string | null, titolo: string): string {
  const base = (codice && codice.trim()) || titolo || 'cantiere';
  const slug = base
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // rimuove i segni diacritici combinanti
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `QR_${slug || 'cantiere'}.pdf`;
}

export function StampaQrClient({
  templateIniziale,
  ...templateProps
}: StampaQrClientProps) {
  const [template, setTemplate] = useState<string>(risolviTemplateQr(templateIniziale));
  const [scaricando, setScaricando] = useState(false);
  const foglioRef = useRef<HTMLDivElement>(null);

  const TemplateComp = TEMPLATE_COMPONENTS[template] ?? TEMPLATE_COMPONENTS['essenziale']!;

  /**
   * Scarica direttamente il PDF del foglio A4 (nessun popup di stampa).
   * Cattura il rendering reale del template (html2canvas) e lo impagina in
   * un A4 con jsPDF, poi forza il download del file.
   */
  async function scaricaPdf() {
    const node = foglioRef.current;
    if (!node || scaricando) return;
    setScaricando(true);
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ]);
      const canvas = await html2canvas(node, {
        scale: 3,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
      });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      // A4 pieno: 210 × 297 mm (il foglio è già in proporzione A4).
      pdf.addImage(imgData, 'PNG', 0, 0, 210, 297, undefined, 'FAST');
      pdf.save(nomeFilePdf(templateProps.codice, templateProps.titolo));
    } catch (e) {
      // Fallback estremo: se html2canvas fallisce, apri la stampa di sistema.
      console.error('Download PDF fallito, fallback a stampa:', e);
      window.print();
    } finally {
      setScaricando(false);
    }
  }

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

        {/* Stampa (secondaria) */}
        <button
          onClick={() => window.print()}
          style={{
            padding: '7px 16px',
            borderRadius: '6px',
            border: '1px solid #cbd5e1',
            backgroundColor: '#ffffff',
            color: '#334155',
            fontSize: '13px',
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          Stampa
        </button>

        {/* Scarica PDF (primaria, download diretto) */}
        <button
          onClick={scaricaPdf}
          disabled={scaricando}
          style={{
            padding: '7px 18px',
            borderRadius: '6px',
            border: 'none',
            backgroundColor: '#0f172a',
            color: '#ffffff',
            fontSize: '13px',
            fontWeight: 600,
            cursor: scaricando ? 'default' : 'pointer',
            opacity: scaricando ? 0.6 : 1,
          }}
        >
          {scaricando ? 'Preparo il PDF…' : 'Scarica PDF'}
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
          ref={foglioRef}
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
