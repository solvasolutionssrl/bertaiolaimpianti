'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Receipt, Upload } from 'lucide-react';
import { Button, Card, CardContent, cn } from '@kommessa/ui';
import { CATEGORIA_META } from '@/app/_components/spese/categoria';
import { MediaLightbox, type MediaItem } from '@/app/_components/media-lightbox';
import { Scelta } from '@/app/_components/scelta';
import type { OpzioneScelta } from '@kommessa/api/scelta-opzioni';
import { luogoDaValore, valoreLuogo } from '@kommessa/api/sottocantieri';
import type { CantiereOpzione } from '@/app/office/_lib/mia-giornata';

export interface SpesaMia {
  id: string;
  cantiere: string | null;
  categoria: string | null;
  ragioneSociale: string | null;
  importo: number | null;
  valuta: string;
  data: string | null;
  stato: string | null;
  fotoMime: string | null;
  hasFile: boolean;
}

const fmtValuta = (n: number | null, v: string) => (n == null ? '—' : new Intl.NumberFormat('it-IT', { style: 'currency', currency: v || 'EUR' }).format(n));
const fmtData = (iso: string | null) => (iso ? new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(iso)) : '—');
const STATO: Record<string, string> = { in_elaborazione: 'In elaborazione', bozza: 'Da verificare', confermata: 'Registrata' };

/** Le voci della tendina: il cantiere, con le fasi come figli. */
function opzioniCantieri(cantieri: CantiereOpzione[]): OpzioneScelta[] {
  return cantieri.map((c) => ({
    valore: c.id,
    etichetta: c.nome,
    dettaglio: c.cliente ?? undefined,
    cerca: c.codice ?? undefined,
    figli: (c.sottocantieri ?? []).map((f) => ({ valore: valoreLuogo(c.id, f.id), etichetta: f.codice ? `${f.codice} · ${f.nome}` : f.nome })),
  }));
}

/**
 * «Le mie spese» da computer: le mie ricevute, e il caricamento di una nuova.
 * Il caricamento passa dalla STESSA rotta del telefono (`/api/kantiere/spese/upload`):
 * la foto va su R2 e i campi li compila l'analisi in cloud, poi la riga appare.
 */
export function SpeseMioClient({ spese, cantieri, kontabilita }: { spese: SpesaMia[]; cantieri: CantiereOpzione[]; kontabilita: boolean }) {
  const router = useRouter();
  const [lightbox, setLightbox] = React.useState<MediaItem | null>(null);
  const [luogo, setLuogo] = React.useState<string | null>(null);
  const [file, setFile] = React.useState<File | null>(null);
  const [stato, setStato] = React.useState<'fermo' | 'invio' | 'fatto' | 'errore'>('fermo');
  const [messaggio, setMessaggio] = React.useState<string | null>(null);
  const opzioni = React.useMemo(() => opzioniCantieri(cantieri), [cantieri]);

  async function invia(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setStato('invio');
    setMessaggio(null);
    const fd = new FormData();
    fd.append('foto', file);
    const l = luogoDaValore(luogo);
    if (l) {
      fd.append('cantiereId', l.cantiereId);
      if (l.sottocantiereId) fd.append('sottocantiereId', l.sottocantiereId);
    }
    try {
      const res = await fetch('/api/kantiere/spese/upload', { method: 'POST', body: fd });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; code?: string } | null;
      if (!res.ok || !json?.ok) {
        setStato('errore');
        setMessaggio(json?.code === 'CANTIERE_CHIUSO' ? 'Il cantiere scelto è chiuso.' : 'Caricamento non riuscito. Riprovare.');
        return;
      }
      setStato('fatto');
      setMessaggio('Ricevuta caricata. I dati vengono letti in automatico: la riga compare tra pochi secondi.');
      setFile(null);
      setLuogo(null);
      router.refresh();
    } catch {
      setStato('errore');
      setMessaggio('Caricamento non riuscito. Riprovare.');
    }
  }

  return (
    <div className="space-y-4">
      {kontabilita ? (
        <Card>
          <CardContent className="pt-4">
            <form onSubmit={invia} className="flex flex-wrap items-end gap-3">
              <div className="min-w-[16rem]">
                <p className="mb-1 text-xs font-medium text-muted-foreground">Cantiere</p>
                <Scelta opzioni={opzioni} valore={luogo} onCambia={setLuogo} segnaposto="Nessun cantiere" etichettaNessuno="Nessun cantiere" segnapostoRicerca="Cerca cantiere o fase…" aria-label="Cantiere della spesa" />
              </div>
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">Ricevuta (foto o PDF)</p>
                <div className="flex h-10 items-center gap-3">
                  <label className="inline-flex h-10 cursor-pointer items-center rounded-md border border-input bg-background px-3 text-xs font-medium text-foreground shadow-sm hover:bg-muted/60">
                    Scegli il file
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                      className="sr-only"
                      aria-label="File della ricevuta"
                    />
                  </label>
                  <span className={cn('truncate text-sm', file ? 'text-foreground' : 'text-muted-foreground')}>
                    {file ? file.name : 'Nessun file scelto'}
                  </span>
                </div>
              </div>
              <Button size="sm" type="submit" disabled={!file || stato === 'invio'}>
                {stato === 'invio' ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Upload className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />}
                Carica ricevuta
              </Button>
              {messaggio ? (
                <p className={cn('basis-full text-xs', stato === 'errore' ? 'text-destructive' : 'text-muted-foreground')} role="status">
                  {messaggio}
                </p>
              ) : null}
            </form>
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardContent className="p-0 sm:p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="w-28 px-3 py-2 font-medium">Data</th>
                <th className="px-3 py-2 font-medium">Esercente</th>
                <th className="px-3 py-2 font-medium">Cantiere</th>
                <th className="w-28 px-3 py-2 font-medium">Categoria</th>
                <th className="w-24 px-3 py-2 text-right font-medium">Importo</th>
                <th className="w-32 px-3 py-2 font-medium">Stato</th>
                <th className="w-24 px-3 py-2" aria-label="Ricevuta" />
              </tr>
            </thead>
            <tbody>
              {spese.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center text-sm text-muted-foreground">
                    Nessuna spesa registrata.
                  </td>
                </tr>
              ) : (
                spese.map((s) => {
                  const cat = s.categoria && CATEGORIA_META[s.categoria as keyof typeof CATEGORIA_META];
                  return (
                    <tr key={s.id} className="border-b border-border">
                      <td className="px-3 py-2 tabular-nums">{fmtData(s.data)}</td>
                      <td className="px-3 py-2">{s.ragioneSociale ?? <span className="text-muted-foreground">—</span>}</td>
                      <td className="px-3 py-2 text-muted-foreground">{s.cantiere ?? '—'}</td>
                      <td className="px-3 py-2 text-muted-foreground">{cat ? cat.label : s.categoria ?? '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtValuta(s.importo, s.valuta)}</td>
                      <td className="px-3 py-2">
                        <span className={cn('rounded-full border px-2 py-0.5 text-[11px] font-medium', s.stato === 'confermata' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : s.stato === 'in_elaborazione' ? 'border-sky-200 bg-sky-50 text-sky-800' : 'border-amber-200 bg-amber-50 text-amber-800')}>
                          {STATO[s.stato ?? ''] ?? s.stato ?? '—'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        {s.hasFile ? (
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                            onClick={() => setLightbox({ id: s.id, src: `/api/kantiere/spese/${s.id}/foto`, mime: s.fotoMime || 'image/jpeg', filename: `ricevuta_${s.id.slice(0, 8)}`, downloadUrl: `/api/kantiere/spese/${s.id}/foto?download=1` })}
                          >
                            <Receipt className="h-3.5 w-3.5" aria-hidden="true" /> Apri
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
      {lightbox ? <MediaLightbox items={[lightbox]} initialIndex={0} open onOpenChange={(o) => !o && setLightbox(null)} /> : null}
    </div>
  );
}
