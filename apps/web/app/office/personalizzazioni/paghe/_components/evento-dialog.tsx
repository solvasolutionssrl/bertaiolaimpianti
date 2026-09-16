'use client';

import * as React from 'react';
import { Loader2, Search } from 'lucide-react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from '@kommessa/ui';
import type { CausaleEssePaghe } from '@kommessa/api/paghe-causali';

import { useAlert } from '@/app/_components/confirm-provider';
import { salvaEventoPaghe } from '@/app/office/_actions/paghe';
import type { DipendenteMese, EventoMese } from '../_lib/dati-mese';

/**
 * La variazione scritta dall'ufficio per chi non usa ancora l'app.
 *
 * Sostituisce il foglio Excel di prima, quindi deve chiedere meno di quello:
 * si sceglie la persona, si cerca la causale per nome invece che ricordarsi la
 * sigla, si danno le date. Se la causale e' di quelle giornaliere e il periodo
 * copre piu' giorni, le righe le apre il sistema, una per giorno lavorativo.
 */

export interface EventoDialogProps {
  periodo: string;
  dipendenti: DipendenteMese[];
  catalogo: CausaleEssePaghe[];
  oreGiornataIntera: number;
  evento: EventoMese | null;
  onChiudi: () => void;
  onSalvato: () => void;
}

function primoGiorno(periodo: string): string {
  return `${periodo}-01`;
}

function ultimoGiorno(periodo: string): string {
  const [anno, mese] = periodo.split('-').map(Number);
  const quanti = new Date(Date.UTC(anno!, mese!, 0)).getUTCDate();
  return `${periodo}-${String(quanti).padStart(2, '0')}`;
}

export function EventoDialog({
  periodo,
  dipendenti,
  catalogo,
  oreGiornataIntera,
  evento,
  onChiudi,
  onSalvato,
}: EventoDialogProps) {
  const showAlert = useAlert();
  const [dipendenteId, setDipendenteId] = React.useState(evento?.dipendenteId ?? '');
  const [causale, setCausale] = React.useState(evento?.causale ?? '');
  const [cerca, setCerca] = React.useState('');
  const [dal, setDal] = React.useState(evento?.dal ?? primoGiorno(periodo));
  const [al, setAl] = React.useState(evento?.al ?? primoGiorno(periodo));
  const [ore, setOre] = React.useState(String(evento?.ore ?? oreGiornataIntera));
  const [soloFeriali, setSoloFeriali] = React.useState(true);
  const [nota, setNota] = React.useState(evento?.nota ?? '');
  const [inCorso, setInCorso] = React.useState(false);

  const scelta = React.useMemo(
    () => catalogo.find((c) => c.codice === causale),
    [catalogo, causale],
  );

  const risultati = React.useMemo(() => {
    const q = cerca.trim().toLowerCase();
    const base = q
      ? catalogo.filter(
          (c) => c.codice.toLowerCase().includes(q) || c.descrizione.toLowerCase().includes(q),
        )
      : catalogo.filter((c) => c.frequente);
    return base.slice(0, 40);
  }, [catalogo, cerca]);

  const perPeriodo = scelta?.record === '12';
  const piuGiorni = !perPeriodo && dal !== al;

  async function salva() {
    if (!dipendenteId) {
      await showAlert({ title: 'Manca il dipendente', body: 'Scegli a chi si riferisce.' });
      return;
    }
    if (!scelta) {
      await showAlert({ title: 'Manca la causale', body: 'Scegli come si chiama questo evento.' });
      return;
    }
    const valore = Number(ore.replace(',', '.'));
    if (!Number.isFinite(valore) || valore < 0) {
      await showAlert({ title: 'Ore non valide', body: 'Scrivi le ore in cifre, per esempio 1,50.' });
      return;
    }

    setInCorso(true);
    const res = await salvaEventoPaghe({
      id: evento?.id,
      periodo,
      dipendenteId,
      causale: scelta.codice,
      dal,
      al: perPeriodo ? al : al,
      ore: perPeriodo ? valore : valore,
      nota: nota.trim() || null,
      soloFeriali,
    });
    setInCorso(false);
    if (!res.ok) {
      await showAlert({ title: 'Non salvata', body: res.error });
      return;
    }
    onSalvato();
  }

  return (
    <Dialog open onOpenChange={(v) => (v ? undefined : onChiudi())}>
      <DialogContent className="grid-cols-[minmax(0,1fr)] overflow-x-hidden sm:max-w-[880px]">
        <DialogHeader>
          <DialogTitle>{evento ? 'Modifica la variazione' : 'Nuova variazione'}</DialogTitle>
        </DialogHeader>

        <div className="grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          {/* Chi e cosa */}
          <div className="min-w-0 space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground" htmlFor="dipendente">
                Dipendente
              </label>
              <select
                id="dipendente"
                value={dipendenteId}
                onChange={(e) => setDipendenteId(e.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="">Scegli</option>
                {dipendenti
                  .filter((d) => d.attivo)
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.cognome} {d.nome}
                      {d.codicePaghe ? ` (${d.codicePaghe})` : ' - senza codice paghe'}
                    </option>
                  ))}
              </select>
            </div>

            <div className="min-w-0">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="cerca-causale">
                Causale
              </label>
              {scelta ? (
                <div className="mt-1 flex min-w-0 items-center gap-2 rounded-md border border-border bg-muted/30 px-2.5 py-2">
                  <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[12px] font-semibold text-primary">
                    {scelta.codice}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                    {scelta.descrizione}
                  </span>
                  <Button variant="ghost" size="sm" className="h-7" onClick={() => setCausale('')}>
                    Cambia
                  </Button>
                </div>
              ) : (
                <>
                  <div className="relative mt-1">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="cerca-causale"
                      value={cerca}
                      onChange={(e) => setCerca(e.target.value)}
                      placeholder="Cerca per nome o codice, per esempio ferie"
                      className="h-9 bg-background pl-8 shadow-none"
                    />
                  </div>
                  <div className="mt-1 max-h-56 overflow-y-auto rounded-md border border-border">
                    {risultati.map((c) => (
                      <button
                        key={c.codice}
                        type="button"
                        onClick={() => {
                          setCausale(c.codice);
                          setCerca('');
                        }}
                        className="flex w-full min-w-0 items-center gap-2 border-b border-border/60 px-2.5 py-1.5 text-left last:border-0 hover:bg-primary/5"
                      >
                        <span className="w-10 shrink-0 font-mono text-[12px] font-semibold text-primary">
                          {c.codice}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">
                          {c.descrizione}
                        </span>
                        <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
                          {c.record === '12' ? 'periodo' : 'giorno'}
                        </span>
                      </button>
                    ))}
                    {risultati.length === 0 ? (
                      <p className="px-2.5 py-3 text-[13px] text-muted-foreground">
                        Nessuna causale con questo nome.
                      </p>
                    ) : null}
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Senza cercare vedi le causali usate piu' spesso.
                  </p>
                </>
              )}
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground" htmlFor="nota">
                Nota interna
              </label>
              <Input
                id="nota"
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                placeholder="Facoltativa, resta in Kommessa"
                className="mt-1 h-9 bg-background shadow-none"
              />
            </div>
          </div>

          {/* Quando e quanto */}
          <div className="min-w-0 space-y-4 lg:border-l lg:border-slate-200 lg:pl-6">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground" htmlFor="dal">
                  Dal
                </label>
                <Input
                  id="dal"
                  type="date"
                  value={dal}
                  min={primoGiorno(periodo)}
                  max={ultimoGiorno(periodo)}
                  onChange={(e) => {
                    setDal(e.target.value);
                    if (e.target.value > al) setAl(e.target.value);
                  }}
                  className="mt-1 h-9 bg-background shadow-none"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground" htmlFor="al">
                  Al
                </label>
                <Input
                  id="al"
                  type="date"
                  value={al}
                  min={dal}
                  max={ultimoGiorno(periodo)}
                  onChange={(e) => setAl(e.target.value)}
                  className="mt-1 h-9 bg-background shadow-none"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground" htmlFor="ore">
                {perPeriodo ? 'Ore (solo se non copre giornate intere)' : 'Ore per giorno'}
              </label>
              <Input
                id="ore"
                inputMode="decimal"
                value={ore}
                onChange={(e) => setOre(e.target.value)}
                className="mt-1 h-9 bg-background font-mono shadow-none"
              />
              <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                Le ore sono in centesimi: 1,50 vuol dire un'ora e mezza, non un'ora e cinquanta
                minuti.
              </p>
            </div>

            {perPeriodo ? (
              <div className="rounded-md border border-sky-200 bg-sky-50 p-2.5 text-[12px] leading-snug text-sky-900">
                <strong>{scelta?.descrizione}</strong> si comunica come periodo, in una riga sola
                dal primo all'ultimo giorno. Se copre giornate intere le ore restano a zero: le
                calcola il programma paghe.
              </div>
            ) : null}

            {piuGiorni ? (
              <label className="flex items-start gap-2 rounded-md border border-border bg-muted/20 p-2.5">
                <input
                  type="checkbox"
                  checked={soloFeriali}
                  onChange={(e) => setSoloFeriali(e.target.checked)}
                  className="mt-0.5 h-4 w-4"
                />
                <span className="text-[12px] leading-snug text-foreground">
                  Salta sabati, domeniche e festivi
                  <span className="block text-muted-foreground">
                    Verra' scritta una riga per ogni giorno del periodo con le ore indicate.
                  </span>
                </span>
              </label>
            ) : null}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onChiudi} disabled={inCorso}>
            Annulla
          </Button>
          <Button size="sm" onClick={salva} disabled={inCorso}>
            {inCorso ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            Salva
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
