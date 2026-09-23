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
 * ⚠️ **Sta su UNA riga sola, e non deve crescere.** Il posto piu' stretto e'
 * «Registra giornata», dove la card ha un'altezza che deve restare ferma (le
 * card sotto non si muovono quando si tocca + o −): ogni riga in piu' li' si
 * paga. Per questo il campo libero sta in linea con le scelte rapide, e
 * l'avviso dell'arrotondamento e' un popup **in posizione assoluta**, che dice
 * la sua senza spostare niente e sparisce da solo.
 *
 * Il valore e' **sempre in minuti** e sempre un multiplo di cinque: chi lo
 * riceve non deve normalizzare niente.
 */

type Tono = 'ambra' | 'tenue' | 'neutro';

const STILI: Record<
  Tono,
  { scelto: string; libero: string; campo: string; popup: string; etichetta: string }
> = {
  // Ambra: i punti dove la pausa si dichiara perche' NON e' stata timbrata.
  // E' un ripiego, e il colore lo dice.
  ambra: {
    scelto: 'border-amber-500 bg-amber-500 text-white',
    libero: 'border-amber-300 bg-white text-amber-900 hover:bg-amber-100',
    campo: 'border-amber-300 bg-white text-amber-900 focus:ring-amber-400',
    popup: 'border-amber-300 bg-amber-900 text-amber-50',
    etichetta: 'text-amber-800',
  },
  // Tenue: dentro «Registra giornata», dove la pausa e' un campo del modulo e
  // non un avviso. ⚠️ Queste classi sono quelle che quella schermata aveva
  // gia': il comportamento si unifica, l'aspetto di quella pagina no.
  tenue: {
    scelto: 'shadow-soft border-amber-400 bg-amber-100 text-amber-900',
    libero: 'border-border bg-background text-foreground hover:bg-amber-50',
    campo: 'border-border bg-background text-foreground focus:ring-amber-400',
    popup: 'border-amber-300 bg-amber-900 text-amber-50',
    etichetta: 'text-amber-700',
  },
  // Neutro: i moduli dove la pausa e' un dato come gli altri.
  neutro: {
    scelto: 'border-primary bg-primary text-primary-foreground',
    libero: 'border-input bg-background text-foreground hover:bg-muted',
    campo: 'border-input bg-background text-foreground focus:ring-ring',
    popup: 'border-border bg-foreground text-background',
    etichetta: 'text-muted-foreground',
  },
};

/** Quanto resta a schermo l'avviso dell'arrotondamento. */
const AVVISO_MS = 3500;

export interface SceltaPausaPranzoProps {
  /** Minuti scelti. Sempre un multiplo di cinque. */
  valore: number;
  onChange: (minuti: number) => void;
  /** Aggiunge «Nessuna» (zero): dove non aver fatto pausa e' una risposta vera. */
  conNessuna?: boolean;
  disabled?: boolean;
  tono?: Tono;
  className?: string;
}

export function SceltaPausaPranzo({
  valore,
  onChange,
  conNessuna = false,
  disabled = false,
  tono = 'ambra',
  className,
}: SceltaPausaPranzoProps) {
  const s = STILI[tono];

  // La bozza del campo libero vive qui: arrotondare a ogni tasto combatterebbe
  // con chi sta scrivendo («45» diventerebbe «5» appena digitato il 4).
  const [bozza, setBozza] = React.useState('');
  const [avviso, setAvviso] = React.useState<number | null>(null);

  // L'avviso si toglie da solo: e' una conferma, non un errore da chiudere.
  React.useEffect(() => {
    if (avviso === null) return;
    const t = setTimeout(() => setAvviso(null), AVVISO_MS);
    return () => clearTimeout(t);
  }, [avviso]);

  const scelteRapide: number[] = conNessuna ? [0, ...PAUSE_RAPIDE_MIN] : [...PAUSE_RAPIDE_MIN];
  const suUnaScelta = scelteRapide.includes(valore);

  function scegliRapida(m: number) {
    setBozza('');
    setAvviso(null);
    onChange(m);
  }

  /** Il campo libero si normalizza quando lo si lascia, non mentre si scrive. */
  function confermaLibero() {
    const grezzo = Number(bozza.replace(',', '.'));
    if (!Number.isFinite(grezzo) || bozza.trim() === '') {
      setBozza('');
      return;
    }
    const buono = arrotondaPausaMin(grezzo);
    onChange(buono);
    setBozza(String(buono));
    // Si avvisa solo se il numero e' davvero cambiato: dirlo sempre sarebbe
    // rumore, e il rumore si smette di leggerlo.
    setAvviso(buono !== Math.round(grezzo) ? buono : null);
  }

  return (
    <div className={['flex items-stretch gap-1.5', className].filter(Boolean).join(' ')}>
      {scelteRapide.map((m) => {
        const attivo = valore === m && suUnaScelta;
        return (
          <button
            key={m}
            type="button"
            disabled={disabled}
            aria-pressed={attivo}
            onClick={() => scegliRapida(m)}
            // «NO» invece di «Nessuna»: la riga deve stare stretta, e il posto
            // guadagnato qui va alle altre scelte. Il significato per esteso
            // resta nel title e nell'etichetta accessibile.
            title={etichettaPausa(m)}
            aria-label={m === 0 ? 'Nessuna pausa' : etichettaPausa(m)}
            // `flex-1` serve sul telefono, dove lo spazio e' poco e le scelte
            // devono riempire la riga. Il tetto serve nei dialog larghi
            // dell'ufficio, dove senza si gonfiavano a fisarmonica accanto al
            // campo stretto. Sul telefono la soglia non si tocca mai.
            className={[
              'min-w-0 max-w-[7.5rem] flex-1 rounded-lg border px-1 py-1.5 text-[13px] font-semibold tabular-nums transition-colors disabled:opacity-50',
              attivo ? s.scelto : s.libero,
            ].join(' ')}
          >
            {m === 0 ? 'NO' : etichettaPausa(m)}
          </button>
        );
      })}

      {/* Campo libero: in linea, non a capo. `relative` regge il popup. */}
      <div className="relative shrink-0">
        <input
          type="number"
          inputMode="numeric"
          min={PAUSA_MINIMA_MIN}
          max={PAUSA_MASSIMA_MIN}
          step={5}
          disabled={disabled}
          value={bozza}
          placeholder={suUnaScelta ? 'altra' : String(valore)}
          onChange={(e) => {
            setBozza(e.target.value);
            setAvviso(null);
          }}
          onBlur={confermaLibero}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              confermaLibero();
            }
          }}
          aria-label="Altra durata della pausa, in minuti"
          title="Altra durata: si arrotonda a 5 minuti"
          // ⚠️ Vuoto va TRATTEGGIATO. Con il bordo pieno aveva la stessa forma
          // dei pulsanti e il testo grigio: si leggeva come una quinta scelta
          // spenta, e nessuno capiva di poterci scrivere. Il tratteggio in
          // questa interfaccia significa gia' «qui puoi agire» (vedi «+
          // Aggiungi cantiere»). Quando tiene il valore scelto torna pieno.
          className={`w-[4.25rem] rounded-lg border py-1.5 pl-1.5 pr-5 text-center text-[13px] tabular-nums placeholder:italic focus:outline-none focus:ring-2 disabled:opacity-50 ${
            !suUnaScelta ? s.scelto : `border-dashed ${s.campo}`
          }`}
        />

        {/* L'unita' di misura, appena si comincia a scrivere: cosi' e' chiara
            gia' PRIMA di confermare. A campo vuoto non serve, e il posto lo
            prende il segnaposto «altra». */}
        {bozza.trim() !== '' ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] font-medium opacity-60"
          >
            min
          </span>
        ) : null}

        {/* Popup dell'arrotondamento: assoluto, quindi non sposta niente. */}
        {avviso !== null ? (
          <span
            role="status"
            className={`animate-fade-up pointer-events-none absolute bottom-full right-0 z-20 mb-1 w-max max-w-[13rem] rounded-md border px-2 py-1 text-[11px] font-medium leading-snug shadow-soft ${s.popup}`}
          >
            Arrotondata a {etichettaPausa(avviso)}
          </span>
        ) : null}
      </div>
    </div>
  );
}
