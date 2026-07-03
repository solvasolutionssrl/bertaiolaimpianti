'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronRight, Loader2, Plus, Search, AlertTriangle } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from '@kommessa/ui';
import { useAlert } from '@/app/_components/confirm-provider';
import { AddressAutocomplete } from '@/app/_components/address-autocomplete';
import {
  codiceCantiereMostrato,
  categoriaLabel,
  categoriaTono,
} from '@/app/_lib/cantiere-categoria';
import { CategoriaChips } from '@/app/_components/cantiere-categoria-chips';
import { creaCantiere } from '../../../_actions/cantieri';
import type { CantiereRow, CommessaOption } from '../page';

interface Props {
  rows: CantiereRow[];
  commesse: CommessaOption[];
}

interface FormState {
  nome: string;
  indirizzo: string;
  indirizzoLat: number | null;
  indirizzoLng: number | null;
  sedePartenza: string;
  sedePartenzaLat: number | null;
  sedePartenzaLng: number | null;
  commessaId: string;
  stato: 'attivo' | 'sospeso' | 'chiuso';
  note: string;
}

const EMPTY_FORM: FormState = {
  nome: '',
  indirizzo: '',
  indirizzoLat: null,
  indirizzoLng: null,
  sedePartenza: '',
  sedePartenzaLat: null,
  sedePartenzaLng: null,
  commessaId: '',
  stato: 'attivo',
  note: '',
};

const STATO_CFG = {
  attivo: {
    dot: 'bg-emerald-500',
    text: 'text-emerald-700 dark:text-emerald-400',
    label: 'Attivo',
  },
  sospeso: {
    dot: 'bg-amber-500',
    text: 'text-amber-700 dark:text-amber-400',
    label: 'Sospeso',
  },
  chiuso: {
    dot: 'bg-slate-400',
    text: 'text-slate-500 dark:text-slate-400',
    label: 'Chiuso',
  },
} satisfies Record<'attivo' | 'sospeso' | 'chiuso', { dot: string; text: string; label: string }>;

function StatoBadge({ stato }: { stato: 'attivo' | 'sospeso' | 'chiuso' }) {
  const cfg = STATO_CFG[stato];
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${cfg.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

export function CantieriClient({ rows, commesse }: Props) {
  const router = useRouter();
  const showAlert = useAlert();
  const [pending, start] = React.useTransition();

  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState<FormState>(EMPTY_FORM);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  // Ricerca + filtro tipologia
  const [q, setQ] = React.useState('');
  const [cat, setCat] = React.useState<string | null>(null);

  const categorie = React.useMemo(
    () =>
      [...new Set(rows.map((r) => r.categoria).filter(Boolean) as string[])].sort((a, b) =>
        a.localeCompare(b),
      ),
    [rows],
  );

  const filtered = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (cat && r.categoria !== cat) return false;
      if (!needle) return true;
      return [r.nome, r.codice_commessa, r.codice, r.cliente_nome, r.indirizzo]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(needle));
    });
  }, [rows, q, cat]);

  const filtroAttivo = q.trim() !== '' || cat !== null;

  function openNew() {
    setForm(EMPTY_FORM);
    setErrorMsg(null);
    setOpen(true);
  }

  function closeDialog() {
    if (!pending) {
      setOpen(false);
      setErrorMsg(null);
    }
  }

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    start(async () => {
      const res = await creaCantiere({
        nome: form.nome,
        indirizzo: form.indirizzo || null,
        indirizzoLat: form.indirizzoLat,
        indirizzoLng: form.indirizzoLng,
        sedePartenza: form.sedePartenza || null,
        sedePartenzaLat: form.sedePartenzaLat,
        sedePartenzaLng: form.sedePartenzaLng,
        commessaId: form.commessaId || null,
        stato: form.stato,
        note: form.note || null,
      });
      if (!res.ok) {
        setErrorMsg(res.error);
        return;
      }
      setOpen(false);
      router.push(`/office/kantiere/cantieri/${res.id}`);
    });
  }

  const nAttivi = rows.filter((r) => r.stato === 'attivo').length;

  return (
    <>
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {rows.length === 0
            ? 'Nessun cantiere registrato.'
            : filtroAttivo
              ? `${filtered.length} risultat${filtered.length === 1 ? 'o' : 'i'} su ${rows.length}`
              : `${rows.length} cantier${rows.length === 1 ? 'e' : 'i'} · ${nAttivi} attiv${nAttivi === 1 ? 'o' : 'i'}`}
        </p>
        <Button size="sm" onClick={openNew}>
          <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
          Nuovo cantiere
        </Button>
      </div>

      {/* Ricerca + filtro tipologia */}
      {rows.length > 0 ? (
        <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-xs">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cerca codice, nome, cliente, indirizzo..."
              aria-label="Cerca cantiere"
              className="pl-8"
            />
          </div>
          {categorie.length > 0 ? (
            <CategoriaChips categorie={categorie} selected={cat} onSelect={setCat} />
          ) : null}
        </div>
      ) : null}

      {/* Table */}
      {rows.length > 0 ? (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="w-28 px-3 py-2 font-medium">Codice</th>
                    <th className="px-3 py-2 font-medium">Nome</th>
                    <th className="px-3 py-2 font-medium">Cliente</th>
                    <th className="px-3 py-2 font-medium">Tipologia</th>
                    <th className="px-3 py-2 font-medium">Indirizzo</th>
                    <th className="w-28 px-3 py-2 font-medium">Stato</th>
                    <th className="w-20 px-3 py-2 font-medium">Persone</th>
                    <th className="w-16 px-3 py-2 font-medium">QR</th>
                    <th className="w-24 px-3 py-2" aria-label="Azioni" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td
                        colSpan={9}
                        className="px-3 py-10 text-center text-sm text-muted-foreground"
                      >
                        Nessun cantiere trovato con questi filtri.
                      </td>
                    </tr>
                  ) : (
                    filtered.map((row) => (
                      <tr
                        key={row.id}
                        className="group cursor-pointer border-b border-border transition-colors hover:bg-muted/40"
                        onClick={() => router.push(`/office/kantiere/cantieri/${row.id}`)}
                      >
                        <td className="px-3 py-2">
                          <div className="font-mono text-xs font-medium text-foreground">
                            {codiceCantiereMostrato(row)}
                          </div>
                        </td>
                        <td className="px-3 py-2 font-semibold">{row.nome}</td>
                        <td className="max-w-[160px] truncate px-3 py-2 text-muted-foreground">
                          {row.cliente_nome ?? <span className="text-muted-foreground/50">·</span>}
                        </td>
                        <td className="px-3 py-2">
                          {row.categoria ? (
                            <span
                              className={`inline-block whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium ${categoriaTono(row.categoria)}`}
                            >
                              {categoriaLabel(row.categoria)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/50">·</span>
                          )}
                        </td>
                        <td className="max-w-[220px] px-3 py-2 text-muted-foreground">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate">
                              {row.indirizzo ?? (
                                <span className="text-muted-foreground/50">Indirizzo mancante</span>
                              )}
                            </span>
                            {row.indirizzo_da_verificare ? (
                              <AlertTriangle
                                className="h-3.5 w-3.5 shrink-0 text-amber-500"
                                aria-label="Da verificare"
                              />
                            ) : null}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <StatoBadge stato={row.stato} />
                        </td>
                        <td className="px-3 py-2 tabular-nums text-muted-foreground">
                          {row.nPersone > 0 ? (
                            <span className="font-medium text-foreground">{row.nPersone}</span>
                          ) : (
                            '0'
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {row.haQr ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                              Sì
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground/50">·</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Button size="sm" asChild onClick={(e) => e.stopPropagation()}>
                            <Link href={`/office/kantiere/cantieri/${row.id}`}>
                              Apri
                              <ChevronRight className="ml-1 h-3.5 w-3.5" aria-hidden="true" />
                            </Link>
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Nessun cantiere registrato. Creane uno con il pulsante &ldquo;Nuovo cantiere&rdquo;.
          </CardContent>
        </Card>
      )}

      {/* Dialog nuovo cantiere */}
      <Dialog open={open} onOpenChange={(o) => { if (!o) closeDialog(); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Nuovo cantiere</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="nome">Nome *</Label>
              <Input
                id="nome"
                name="nome"
                value={form.nome}
                onChange={handleChange}
                required
                placeholder="Es. Villa Rossi, via Roma 12"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="indirizzo">Indirizzo</Label>
              <AddressAutocomplete
                id="indirizzo"
                value={form.indirizzo}
                onChange={(label) => setForm((f) => ({ ...f, indirizzo: label }))}
                onSelect={(r) =>
                  setForm((f) => ({
                    ...f,
                    indirizzo: r.label,
                    indirizzoLat: r.lat,
                    indirizzoLng: r.lng,
                  }))
                }
                placeholder="Via Roma 12, Torino"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="sedePartenza">Sede di partenza</Label>
              <AddressAutocomplete
                id="sedePartenza"
                value={form.sedePartenza}
                onChange={(label) => setForm((f) => ({ ...f, sedePartenza: label }))}
                onSelect={(r) =>
                  setForm((f) => ({
                    ...f,
                    sedePartenza: r.label,
                    sedePartenzaLat: r.lat,
                    sedePartenzaLng: r.lng,
                  }))
                }
                placeholder="Lascia vuoto per usare il default del modulo"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="commessaId">Commessa collegata</Label>
              <select
                id="commessaId"
                name="commessaId"
                value={form.commessaId}
                onChange={handleChange}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">Nessuna</option>
                {commesse.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.titolo}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="stato">Stato</Label>
              <select
                id="stato"
                name="stato"
                value={form.stato}
                onChange={handleChange}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="attivo">Attivo</option>
                <option value="sospeso">Sospeso</option>
                <option value="chiuso">Chiuso</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="note">Note</Label>
              <textarea
                id="note"
                name="note"
                value={form.note}
                onChange={handleChange}
                rows={2}
                placeholder="Annotazioni facoltative..."
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>

            {errorMsg ? (
              <p className="text-xs text-destructive">{errorMsg}</p>
            ) : null}

            <DialogFooter className="gap-2 pt-2">
              <Button type="button" variant="outline" onClick={closeDialog} disabled={pending}>
                Annulla
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : null}
                {pending ? 'Creo...' : 'Crea cantiere'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
