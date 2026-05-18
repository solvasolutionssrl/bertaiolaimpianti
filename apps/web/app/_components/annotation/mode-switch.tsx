'use client';

/**
 * ModeSwitch — segmented control "Testo / Disegno" per PdfAnnotator.
 *
 * Nascosto nell'editor foto (che non ha la modalità "Testo" sopra il
 * canvas pdf.js).
 *
 * Colore attivo: Testo = blu primary, Disegno = arancio accent. Riflette
 * il pattern brand globale (blu = neutro/testo, arancio = azione/disegno).
 */

import * as React from 'react';
import { Pencil, Type as TypeIcon } from 'lucide-react';

import type { PdfMode } from './types';

export interface ModeSwitchProps {
  value: PdfMode;
  onChange: (m: PdfMode) => void;
}

export function ModeSwitch({ value, onChange }: ModeSwitchProps) {
  return (
    <div
      role="tablist"
      aria-label="Modalità annotazione PDF"
      className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-900/80 p-1 shadow-sm backdrop-blur"
    >
      <ModeButton
        active={value === 'text'}
        onClick={() => onChange('text')}
        accent="blue"
        Icon={TypeIcon}
        label="Testo"
      />
      <ModeButton
        active={value === 'draw'}
        onClick={() => onChange('draw')}
        accent="orange"
        Icon={Pencil}
        label="Disegno"
      />
    </div>
  );
}

function ModeButton(props: {
  active: boolean;
  onClick: () => void;
  Icon: typeof Pencil;
  label: string;
  accent: 'blue' | 'orange';
}) {
  const { active, onClick, Icon, label, accent } = props;
  const cls = active
    ? accent === 'blue'
      ? 'bg-primary text-primary-foreground shadow'
      : 'bg-accent text-accent-foreground shadow'
    : 'text-slate-300 hover:bg-slate-800';
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={[
        'inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition-colors',
        cls,
      ].join(' ')}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </button>
  );
}
