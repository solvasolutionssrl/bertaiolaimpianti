'use client';

import * as React from 'react';

import {
  PAUSA_MASSIMA_MIN,
  PAUSA_MINIMA_MIN,
  PAUSE_RAPIDE_MIN,
  arrotondaPausaMin,
  etichettaPausa,
} from '@kommessa/api/kantiere-pausa';

/**
 * Come si sceglie la durata della pausa pranzo, ovunque la si chieda.
 *
 * Le stesse tre scelte erano scritte a mano in cinque posti (QR, fine turno da
 * app, Registra giornata, Modifica giornata, Correggi giornata dell'ufficio), e
 * uno dei cinque offriva anche 90 minuti. Ora il posto e' uno solo: cambiare le
 * durate o la regola di arrotondamento si fa qui e vale dappertutto.
 *
 * Il valore e' **sempre in minuti** e sempre un multiplo di cinque: chi lo
 * riceve non deve normalizzare niente.
 */

type Tono = 'ambra' | 'tenue' | 'neutro';

const STILI: Record<
  Tono,
  { scelto: string; libero: string; campo: string; nota: string; etichetta: string }
> = {
  // Ambra: i punti dove la pausa si dichiara perche' NON e' stata timbrata.
  // E' un ripiego, e il colore lo dice.
  ambra: {
    scelto: 'border-amber-500 bg-amber-500 text-white',
    libero: 'border-amber-300 bg-white text-amber-900 hover:bg-amber-100',
    campo: 'border-amber-300 bg-white text-amber-900 focus:ring-amber-400',
    nota: 'text-amber-700',
    etichetta: 'text-amber-800',
  },
  // Tenue: dentro «Registra giornata», dove la pausa e' un campo del modulo e
  // non un avviso. ⚠️ Queste classi sono quelle che quella schermata aveva
  // gia': il comportamento si unifica, l'aspetto di quella pagina no.
  tenue: {
    scelto: 'shadow-soft border-amber-400 bg-amber-100 text-amber-900',
    libero: 'border-border bg-background text-foreground hover:bg-amber-50',
    campo: 'border-border bg-background text-foreground focus:ring-amber-400',
    nota: 'text-muted-foreground',
    etichetta: 'text-amber-700',
  },
  // Neutro: i moduli dove la pausa e' un dato come gli altri.
  neutro: {
    scelto: 'border-primary bg-primary text-primary-foreground',
    libero: 'border-input bg-background text-foreground hover:bg-muted',
    campo: 'border-input bg-background text-foreground focus:ring-ring',
    nota: 'text-muted-foreground',
    etichetta: 'text-muted-foreground',
  },
};

export interface SceltaPausaPranzoProps {
  /** Minuti scelti. Sempre un multiplo di cinque. */
  valore: number;
  onChange: (minuti: number) => void;
  /** Aggiunge «Nessuna» (zero): dove non aver fatto pausa e' una risposta vera. */
  conNessuna?: boolean;
  disabled?: boolean;
  tono?: Tono;
  /** Etichetta sopra le scelte. Assente = nessuna etichetta. */
  etichetta?: string;
  className?: string;
}

export function SceltaPausaPranzo({
  valore,
  onChange,
  conNessuna = false,
  disabled = false,
  tono = 'ambra',
  etichetta,
  className,
}: SceltaPausaPranzoProps) {
  const s = STILI[tono];

  // La bozza del campo libero vive qui: arrotondare a ogni tasto combatterebbe
  // con chi sta scrivendo («45» diventerebbe «5» appena digitato il 4).
  const [bozza, setBozza] = React.useState('');
  const [arrotondatoA, setArrotondatoA] = React.useState<number | null>(null);

  const scelteRapide: number[] = conNessuna ? [0, ...PAUSE_RAPIDE_MIN] : [...PAUSE_RAPIDE_MIN];
  const suUnaScelta = scelteRapide.includes(valore);

  function scegliRapida(m: number) {
    setBozza('');
    setArrotondatoA(null);
    onChange(m);
  }

  /** Il campo libero si normalizza quando lo si lascia, non mentre si scrive. */
  function confermaLibero() {
    const grezzo = Number(bozza.replace(',', '.'));
    if (!Number.isFinite(grezzo) || bozza.trim() === '') {
      setBozza('');
      setArrotondatoA(null);
      return;
    }
    const buono = arrotondaPausaMin(grezzo);
    onChange(buono);
    setBozza(String(buono));
    // Si avvisa solo se il numero e' davvero cambiato: dirlo sempre sarebbe
    // rumore, e il rumore si smette di leggerlo.
    setArrotondatoA(buono !== Math.round(grezzo) ? buono : null);
  }

  return (
    <div className={['space-y-2', className].filter(Boolean).join(' ')}>
      {etichetta ? (
        <p className={`font-mono text-[10px] uppercase tracking-[0.14em] ${s.etichetta}`}>
          {etichetta}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {scelteRapide.map((m) => {
          const attivo = valore === m && suUnaScelta;
          return (
            <button
              key={m}
              type="button"
              disabled={disabled}
              aria-pressed={attivo}
              onClick={() => scegliRapida(m)}
              className={[
                'min-w-[64px] flex-1 rounded-lg border py-2 text-sm font-semibold tabular-nums transition-colors disabled:opacity-50',
                attivo ? s.scelto : s.libero,
              ].join(' ')}
            >
              {etichettaPausa(m)}
            </button>
          );
        })}
      </div>

      <label className="flex items-center gap-2">
        <span className={`shrink-0 text-xs font-medium ${s.etichetta}`}>Altra durata</span>
        <input
          type="number"
          inputMode="numeric"
          min={PAUSA_MINIMA_MIN}
          max={PAUSA_MASSIMA_MIN}
          step={5}
          disabled={disabled}
          value={bozza}
          placeholder={suUnaScelta ? 'minuti' : String(valore)}
          onChange={(e) => {
            setBozza(e.target.value);
            setArrotondatoA(null);
          }}
          onBlur={confermaLibero}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              confermaLibero();
            }
          }}
          aria-label="Durata della pausa in minuti"
          className={`w-24 rounded-lg border px-2 py-1.5 text-base tabular-nums focus:outline-none focus:ring-2 disabled:opacity-50 ${s.campo}`}
        />
        <span className={`text-xs ${s.nota}`}>min</span>
      </label>

      {arrotondatoA !== null ? (
        <p role="status" className={`text-[11px] leading-snug ${s.nota}`}>
          La pausa si registra a intervalli di cinque minuti: salvata come{' '}
          <strong>{etichettaPausa(arrotondatoA)}</strong>.
        </p>
      ) : null}
    </div>
  );
}
