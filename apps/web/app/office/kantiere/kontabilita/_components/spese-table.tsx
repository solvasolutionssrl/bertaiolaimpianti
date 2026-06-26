'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Trash2, Receipt, FileText, MapPin, User, ExternalLink } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@kommessa/ui';
import { CATEGORIA_META, CATEGORIE_ORDINATE } from '@/app/_components/spese/categoria';
import type { CategoriaSpesa } from '@kommessa/api/spese';
import { MediaLightbox, type MediaItem } from '@/app/_components/media-lightbox';
import { aggiornaSpesa, eliminaSpesa } from '@/app/_actions/kantiere-spese';

import { NuovaSpesaOffice } from './nuova-spesa-office';

export type SpesaRiga = {
  id: string;
  dipendenteNome: string;
  cantiereNome: string | null;
  cantiereId: string | null;
  categoria: string | null;
  ragioneSociale: string | null;
  importoTotale: number | null;
  importoIva: number | null;
  imponibile: number | null;
  valuta: string;
  dataScontrino: string | null;
  note: string | null;
  fotoMime: string | null;
  hasFile: boolean;
};

export type CantiereOption = { id: string; nome: string };
export type DipendenteOption = { id: string; nome: string };

const SENZA_CANTIERE = 'Da assegnare';

function fmtValuta(n: number | null | undefined, valuta: string): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return 'n.d.';
  try {
    return new Intl.NumberFormat('it-IT', { style: 'currency', currency: valuta || 'EUR' }).format(n);
  } catch {
    return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n);
  }
}

function fmtDataScontrino(iso: string | null): string {
  if (!iso) return 'n.d.';
  try {
    return new Date(iso).toLocaleDateString('it-IT', {
      timeZone: 'Europe/Rome',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso.slice(0, 10);
  }
}

/** Costruisce il MediaItem (1 elemento) per la ricevuta di una spesa. */
function buildMediaItem(s: SpesaRiga): MediaItem {
  return {
    id: s.id,
    src: `/api/kantiere/spese/${s.id}/foto`,
    mime: s.fotoMime || 'image/jpeg',
    filename: `ricevuta_${s.id.slice(0, 8)}`,
    downloadUrl: `/api/kantiere/spese/${s.id}/foto?download=1`,
  };
}

function CategoriaBadge({ categoria }: { categoria: string | null }) {
  const cat = categoria as CategoriaSpesa | null;
  const meta = cat && CATEGORIA_META[cat] ? CATEGORIA_META[cat] : null;
  if (!meta) {
    return (
      <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
        n.d.
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${meta.badge}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} aria-hidden="true" />
      {meta.label}
    </span>
  );
}

/** Miniatura ricevuta: thumb immagine, icona PDF/file, o placeholder se nessun file. */
function Thumb({ spesa }: { spesa: SpesaRiga }) {
  const [errore, setErrore] = React.useState(false);
  const isPdf = spesa.fotoMime === 'application/pdf';
  const isImage = !!spesa.fotoMime && spesa.fotoMime.startsWith('image/');

  if (!spesa.hasFile) {
    return (
      <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-dashed border-border bg-muted/40">
        <Receipt className="h-5 w-5 text-muted-foreground/60" aria-hidden="true" />
      </div>
    );
  }

  if (isPdf || errore || !isImage) {
    return (
      <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-border bg-muted">
        <FileText className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/api/kantiere/spese/${spesa.id}/foto?size=thumb`}
      alt="Ricevuta"
      width={48}
      height={48}
      loading="lazy"
      onError={() => setErrore(true)}
      className="h-12 w-12 rounded-lg border border-border object-cover"
    />
  );
}

interface Props {
  spese: SpesaRiga[];
  cantieri: CantiereOption[];
  dipendentiOptions: DipendenteOption[];
  mioDipendenteId: string | null;
}

export function SpeseTable({ spese, cantieri, dipendentiOptions, mioDipendenteId }: Props) {
  const router = useRouter();
  const [aperta, setAperta] = React.useState<SpesaRiga | null>(null);
  const [lightbox, setLightbox] = React.useState<MediaItem | null>(null);

  const apriRicevuta = React.useCallback((s: SpesaRiga) => {
    setLightbox(buildMediaItem(s));
  }, []);

  // Raggruppa per cantiere (nome o "Da assegnare").
  const gruppi = React.useMemo(() => {
    const map = new Map<string, SpesaRiga[]>();
    for (const s of spese) {
      const key = s.cantiereNome ?? SENZA_CANTIERE;
      const arr = map.get(key) ?? [];
      arr.push(s);
      map.set(key, arr);
    }
    return [...map.entries()].sort((a, b) => {
      if (a[0] === SENZA_CANTIERE) return 1;
      if (b[0] === SENZA_CANTIERE) return -1;
      return a[0].localeCompare(b[0], 'it');
    });
  }, [spese]);

  const totaleGenerale = React.useMemo(
    () => spese.reduce((acc, s) => acc + (s.importoTotale ?? 0), 0),
    [spese],
  );

  return (
    <div className="space-y-4">
      {/* Intestazione: conteggio + totale + nuova spesa */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 px-1 text-sm text-muted-foreground">
          <span>
            <span className="font-medium text-foreground">{spese.length}</span> spes
            {spese.length === 1 ? 'a' : 'e'}
          </span>
          <span className="text-border">|</span>
          <span>
            Totale{' '}
            <span className="tabular-nums font-semibold text-foreground">
              {fmtValuta(totaleGenerale, 'EUR')}
            </span>
          </span>
        </div>
        <NuovaSpesaOffice
          cantieri={cantieri}
          dipendentiOptions={dipendentiOptions}
          mioDipendenteId={mioDipendenteId}
        />
      </div>

      {spese.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nessuna spesa trovata con i filtri selezionati.
        </p>
      ) : (
        gruppi.map(([nomeCantiere, righe]) => {
          const subtotale = righe.reduce((acc, s) => acc + (s.importoTotale ?? 0), 0);
          return (
            <Card key={nomeCantiere}>
              <CardContent className="p-0">
                <div className="flex items-center justify-between border-b border-border bg-muted/40 px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">{nomeCantiere}</span>
                    <span className="text-xs text-muted-foreground">
                      {righe.length} spes{righe.length === 1 ? 'a' : 'e'}
                    </span>
                  </div>
                  <span className="tabular-nums text-sm font-semibold text-foreground">
                    {fmtValuta(subtotale, 'EUR')}
                  </span>
                </div>

                <ul className="divide-y divide-border/60">
                  {righe.map((s) => (
                    <li
                      key={s.id}
                      onClick={() => setAperta(s)}
                      className="group flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40"
                    >
                      <Thumb spesa={s} />

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-semibold text-foreground">
                            {s.ragioneSociale?.trim() || 'Senza nome'}
                          </p>
                          <CategoriaBadge categoria={s.categoria} />
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <User className="h-3 w-3" aria-hidden="true" />
                            {s.dipendenteNome}
                          </span>
                          {s.cantiereNome ? (
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="h-3 w-3" aria-hidden="true" />
                              {s.cantiereNome}
                            </span>
                          ) : null}
                          <span className="tabular-nums">{fmtDataScontrino(s.dataScontrino)}</span>
                        </div>
                      </div>

                      {s.hasFile ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            apriRicevuta(s);
                          }}
                          className="hidden shrink-0 items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground sm:inline-flex"
                          title="Apri ricevuta fiscale"
                        >
                          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                          Ricevuta
                        </button>
                      ) : null}

                      <div className="shrink-0 text-right">
                        <p className="tabular-nums text-sm font-semibold text-foreground">
                          {fmtValuta(s.importoTotale, s.valuta)}
                        </p>
                        {typeof s.importoIva === 'number' && Number.isFinite(s.importoIva) ? (
                          <p className="tabular-nums text-xs text-muted-foreground">
                            IVA {fmtValuta(s.importoIva, s.valuta)}
                          </p>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          );
        })
      )}

      {aperta ? (
        <DettaglioDialog
          spesa={aperta}
          cantieri={cantieri}
          onApriRicevuta={() => apriRicevuta(aperta)}
          onClose={() => setAperta(null)}
          onSaved={() => {
            setAperta(null);
            router.refresh();
          }}
        />
      ) : null}

      <MediaLightbox
        items={lightbox ? [lightbox] : []}
        initialIndex={lightbox ? 0 : null}
        open={!!lightbox}
        onOpenChange={(o) => {
          if (!o) setLightbox(null);
        }}
      />
    </div>
  );
}

interface DettaglioProps {
  spesa: SpesaRiga;
  cantieri: CantiereOption[];
  onApriRicevuta: () => void;
  onClose: () => void;
  onSaved: () => void;
}

function DettaglioDialog({ spesa, cantieri, onApriRicevuta, onClose, onSaved }: DettaglioProps) {
  const [categoria, setCategoria] = React.useState<string>(spesa.categoria ?? 'varie');
  const [cantiereId, setCantiereId] = React.useState<string>(spesa.cantiereId ?? '');
  const [note, setNote] = React.useState<string>(spesa.note ?? '');
  const [errore, setErrore] = React.useState<string | null>(null);
  const [confermaElimina, setConfermaElimina] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  const isPdf = spesa.fotoMime === 'application/pdf';
  const isImage = !!spesa.fotoMime && spesa.fotoMime.startsWith('image/');

  function salva() {
    setErrore(null);
    startTransition(async () => {
      const res = await aggiornaSpesa({
        id: spesa.id,
        categoria: categoria as CategoriaSpesa,
        cantiereId: cantiereId ? cantiereId : null,
        note: note.trim() ? note.trim() : null,
      });
      if (res.ok) onSaved();
      else setErrore('Salvataggio non riuscito. Riprova.');
    });
  }

  function elimina() {
    setErrore(null);
    startTransition(async () => {
      const res = await eliminaSpesa(spesa.id);
      if (res.ok) onSaved();
      else setErrore('Eliminazione non riuscita. Riprova.');
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Dettaglio spesa</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Anteprima ricevuta */}
          {spesa.hasFile ? (
            <button
              type="button"
              onClick={onApriRicevuta}
              className="group relative block w-full overflow-hidden rounded-lg border border-border bg-muted"
              title="Apri ricevuta fiscale"
            >
              {isImage && !isPdf ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`/api/kantiere/spese/${spesa.id}/foto`}
                  alt="Ricevuta"
                  className="mx-auto max-h-64 w-auto object-contain"
                />
              ) : (
                <div className="flex flex-col items-center justify-center gap-2 py-10 text-muted-foreground">
                  <FileText className="h-8 w-8" aria-hidden="true" />
                  <span className="text-sm font-medium">Documento allegato</span>
                </div>
              )}
              <span className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-center gap-1.5 bg-gradient-to-t from-black/60 to-transparent py-2 text-xs font-medium text-white opacity-0 transition group-hover:opacity-100">
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                Apri ricevuta fiscale
              </span>
            </button>
          ) : null}

          {spesa.hasFile ? (
            <Button variant="outline" size="sm" className="w-full" onClick={onApriRicevuta}>
              <ExternalLink className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Apri ricevuta fiscale
            </Button>
          ) : (
            <p className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2 text-center text-xs text-muted-foreground">
              Nessun file allegato a questa spesa.
            </p>
          )}

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-xs text-muted-foreground">Esercente</span>
              <p className="font-medium">{spesa.ragioneSociale?.trim() || 'Senza nome'}</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Dipendente</span>
              <p className="font-medium">{spesa.dipendenteNome}</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Importo</span>
              <p className="font-medium tabular-nums">{fmtValuta(spesa.importoTotale, spesa.valuta)}</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">IVA</span>
              <p className="font-medium tabular-nums">{fmtValuta(spesa.importoIva, spesa.valuta)}</p>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Categoria</label>
            <select
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {CATEGORIE_ORDINATE.map((c) => (
                <option key={c} value={c}>
                  {CATEGORIA_META[c].label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Cantiere</label>
            <select
              value={cantiereId}
              onChange={(e) => setCantiereId(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Da assegnare</option>
              {cantieri.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.nome}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Note</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              className="resize-y rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Annotazioni interne"
            />
          </div>

          {errore ? <p className="text-sm text-rose-600">{errore}</p> : null}
        </div>

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          {confermaElimina ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Eliminare?</span>
              <Button variant="destructive" size="sm" onClick={elimina} disabled={pending}>
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Conferma'}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfermaElimina(false)} disabled={pending}>
                Annulla
              </Button>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="text-rose-600 hover:text-rose-700"
              onClick={() => setConfermaElimina(true)}
              disabled={pending}
            >
              <Trash2 className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Elimina
            </Button>
          )}
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onClose} disabled={pending}>
              Chiudi
            </Button>
            <Button size="sm" onClick={salva} disabled={pending}>
              {pending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              Salva
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
