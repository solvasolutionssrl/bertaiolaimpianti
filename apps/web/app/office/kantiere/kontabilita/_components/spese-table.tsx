'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Trash2, Receipt } from 'lucide-react';
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
import { aggiornaSpesa, eliminaSpesa } from '@/app/_actions/kantiere-spese';

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
};

export type CantiereOption = { id: string; nome: string };

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
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return iso.slice(0, 10);
  }
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

function Thumb({ id }: { id: string }) {
  const [errore, setErrore] = React.useState(false);
  if (errore) {
    return (
      <div className="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-muted">
        <Receipt className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/api/kantiere/spese/${id}/foto?size=thumb`}
      alt="Scontrino"
      width={40}
      height={40}
      loading="lazy"
      onError={() => setErrore(true)}
      className="h-10 w-10 rounded-md border border-border object-cover"
    />
  );
}

interface Props {
  spese: SpesaRiga[];
  cantieri: CantiereOption[];
}

export function SpeseTable({ spese, cantieri }: Props) {
  const router = useRouter();
  const [aperta, setAperta] = React.useState<SpesaRiga | null>(null);

  // Raggruppa per cantiere (nome o "Da assegnare").
  const gruppi = React.useMemo(() => {
    const map = new Map<string, SpesaRiga[]>();
    for (const s of spese) {
      const key = s.cantiereNome ?? SENZA_CANTIERE;
      const arr = map.get(key) ?? [];
      arr.push(s);
      map.set(key, arr);
    }
    // "Da assegnare" in fondo, gli altri in ordine alfabetico.
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

  if (spese.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nessuna spesa trovata con i filtri selezionati.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {/* Totale generale */}
      <div className="flex items-center gap-3 px-1 text-sm text-muted-foreground">
        <span>
          <span className="font-medium text-foreground">{spese.length}</span> spese
        </span>
        <span className="text-border">|</span>
        <span>
          Totale{' '}
          <span className="tabular-nums font-semibold text-foreground">
            {fmtValuta(totaleGenerale, 'EUR')}
          </span>
        </span>
      </div>

      {gruppi.map(([nomeCantiere, righe]) => {
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
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      <th className="px-4 py-2 font-medium">Foto</th>
                      <th className="px-4 py-2 font-medium">Data</th>
                      <th className="px-4 py-2 font-medium">Esercente</th>
                      <th className="px-4 py-2 font-medium">Chi</th>
                      <th className="px-4 py-2 font-medium">Categoria</th>
                      <th className="px-4 py-2 text-right font-medium">Importo</th>
                      <th className="px-4 py-2 text-right font-medium">IVA</th>
                    </tr>
                  </thead>
                  <tbody>
                    {righe.map((s) => (
                      <tr
                        key={s.id}
                        onClick={() => setAperta(s)}
                        className="cursor-pointer border-b border-border/60 transition-colors last:border-0 hover:bg-muted/50"
                      >
                        <td className="px-4 py-2">
                          <Thumb id={s.id} />
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap tabular-nums">
                          {fmtDataScontrino(s.dataScontrino)}
                        </td>
                        <td className="px-4 py-2">{s.ragioneSociale?.trim() || 'Senza nome'}</td>
                        <td className="px-4 py-2 whitespace-nowrap">{s.dipendenteNome}</td>
                        <td className="px-4 py-2">
                          <CategoriaBadge categoria={s.categoria} />
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap text-right tabular-nums font-medium">
                          {fmtValuta(s.importoTotale, s.valuta)}
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap text-right tabular-nums text-muted-foreground">
                          {fmtValuta(s.importoIva, s.valuta)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        );
      })}

      {aperta ? (
        <DettaglioDialog
          spesa={aperta}
          cantieri={cantieri}
          onClose={() => setAperta(null)}
          onSaved={() => {
            setAperta(null);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}

interface DettaglioProps {
  spesa: SpesaRiga;
  cantieri: CantiereOption[];
  onClose: () => void;
  onSaved: () => void;
}

function DettaglioDialog({ spesa, cantieri, onClose, onSaved }: DettaglioProps) {
  const [categoria, setCategoria] = React.useState<string>(spesa.categoria ?? 'varie');
  const [cantiereId, setCantiereId] = React.useState<string>(spesa.cantiereId ?? '');
  const [note, setNote] = React.useState<string>(spesa.note ?? '');
  const [errore, setErrore] = React.useState<string | null>(null);
  const [confermaElimina, setConfermaElimina] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

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
          {/* Foto full-size */}
          <div className="overflow-hidden rounded-lg border border-border bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/kantiere/spese/${spesa.id}/foto`}
              alt="Scontrino"
              className="mx-auto max-h-72 w-auto object-contain"
            />
          </div>

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
