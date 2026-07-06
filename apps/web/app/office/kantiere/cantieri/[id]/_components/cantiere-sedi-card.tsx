'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  Building2,
  Check,
  Home,
  Hotel,
  Loader2,
  MapPin,
  Plus,
  Search,
  Star,
  X,
} from 'lucide-react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from '@kommessa/ui';
import { AddressAutocomplete } from '@/app/_components/address-autocomplete';
import {
  associaSedeCantiere,
  dissociaSedeCantiere,
  creaSede,
} from '@/app/office/_actions/kantiere-sedi';

type TipoSede = 'sede_principale' | 'sede_secondaria' | 'hotel' | 'altro';

export interface SedeTenant {
  id: string;
  nome: string;
  tipo: TipoSede;
  is_default: boolean;
}

const TIPO_LABEL: Record<TipoSede, string> = {
  sede_principale: 'Sede principale',
  sede_secondaria: 'Sede secondaria',
  hotel: 'Hotel',
  altro: 'Altro',
};

function IconaTipo({ tipo, className }: { tipo: TipoSede; className?: string }) {
  if (tipo === 'hotel') return <Hotel className={className} aria-hidden="true" />;
  if (tipo === 'altro') return <MapPin className={className} aria-hidden="true" />;
  return <Building2 className={className} aria-hidden="true" />;
}

const SELECT_CLS =
  'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

/**
 * Card "Sedi di partenza" della scheda cantiere (office).
 *
 * Sostituisce la vecchia checklist "Sedi specifiche" (che mostrava TUTTE le
 * sedi). Mostra in modo semplice cosa i tecnici vedranno alla domanda "Da dove
 * sei partito?" per QUESTO cantiere:
 *  - la **sede predefinita** del tenant (sempre, sola lettura);
 *  - **Abitazione privata** (sempre disponibile a fine turno, sola lettura);
 *  - le **sedi collegate** a questo cantiere (rimovibili);
 *  - due modi per aggiungerne: "usa una sede esistente" (ricerca) o "crea nuova".
 *
 * Stato ottimistico + `router.refresh()`. Azioni: associa/dissocia/crea sede.
 */
export function CantiereSediCard({
  cantiereId,
  sediTenant,
  sediAssociate,
}: {
  cantiereId: string;
  sediTenant: SedeTenant[];
  sediAssociate: string[];
}) {
  const router = useRouter();
  const [associate, setAssociate] = React.useState<Set<string>>(() => new Set(sediAssociate));
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [errore, setErrore] = React.useState<string | null>(null);

  React.useEffect(() => {
    setAssociate(new Set(sediAssociate));
  }, [sediAssociate]);

  const sedeDefault = sediTenant.find((s) => s.is_default) ?? null;

  // Sedi collegate a QUESTO cantiere (escludo la predefinita: è già sempre in cima).
  const collegate = sediTenant.filter((s) => associate.has(s.id) && !s.is_default);
  // Sedi selezionabili da "usa esistente": non predefinita e non già collegata.
  const aggiungibili = sediTenant.filter((s) => !s.is_default && !associate.has(s.id));

  async function toggle(sedeId: string, collega: boolean) {
    setBusyId(sedeId);
    setErrore(null);
    setAssociate((prev) => {
      const next = new Set(prev);
      if (collega) next.add(sedeId);
      else next.delete(sedeId);
      return next;
    });
    try {
      const action = collega ? associaSedeCantiere : dissociaSedeCantiere;
      const res = await action({ cantiereId, sedeId });
      if (!res.ok) {
        setAssociate((prev) => {
          const next = new Set(prev);
          if (collega) next.delete(sedeId);
          else next.add(sedeId);
          return next;
        });
        setErrore(res.error);
      } else {
        router.refresh();
      }
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-2.5">
      <p className="text-xs leading-relaxed text-muted-foreground">
        Da dove i tecnici possono partire per questo cantiere. Compaiono nella scelta
        &ldquo;Da dove sei partito?&rdquo; alla timbratura.
      </p>

      <ul className="space-y-1.5">
        {/* Sede predefinita — sempre, sola lettura */}
        {sedeDefault ? (
          <RigaFissa
            icona={<Star className="h-4 w-4 fill-emerald-500 text-emerald-500" aria-hidden="true" />}
            nome={sedeDefault.nome}
            badge="Predefinita · sempre"
            badgeCls="bg-emerald-100 text-emerald-800"
          />
        ) : (
          <li className="rounded-lg border border-dashed border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Nessuna sede predefinita impostata.{' '}
            <a href="/office/kantiere/sedi" className="font-medium underline-offset-2 hover:underline">
              Impostala in Sedi
            </a>
            .
          </li>
        )}

        {/* Abitazione privata — sempre, a fine turno */}
        <RigaFissa
          icona={<Home className="h-4 w-4 text-slate-500" aria-hidden="true" />}
          nome="Abitazione privata"
          badge="A fine turno · sempre"
          badgeCls="bg-slate-100 text-slate-600"
        />

        {/* Sedi collegate — rimovibili */}
        {collegate.map((s) => (
          <li
            key={s.id}
            className="flex items-center gap-2.5 rounded-lg border border-primary/20 bg-primary/[0.04] px-3 py-2"
          >
            <IconaTipo tipo={s.tipo} className="h-4 w-4 shrink-0 text-primary/80" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-foreground">{s.nome}</span>
              <span className="text-[11px] text-muted-foreground">{TIPO_LABEL[s.tipo]}</span>
            </span>
            <button
              type="button"
              onClick={() => toggle(s.id, false)}
              disabled={busyId === s.id}
              aria-label={`Scollega ${s.nome}`}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
            >
              {busyId === s.id ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <X className="h-3.5 w-3.5" />
              )}
            </button>
          </li>
        ))}
      </ul>

      {errore ? <p className="text-xs text-destructive">{errore}</p> : null}

      {/* Azioni: usa esistente (ricerca) · crea nuova */}
      <div className="flex flex-col gap-2 pt-0.5 sm:flex-row">
        <UsaEsistente sedi={aggiungibili} onPick={(id) => toggle(id, true)} />
        <CreaSedeButton cantiereId={cantiereId} onCreata={() => router.refresh()} />
      </div>
    </div>
  );
}

// ── riga fissa (predefinita / abitazione) ─────────────────────────────────────

function RigaFissa({
  icona,
  nome,
  badge,
  badgeCls,
}: {
  icona: React.ReactNode;
  nome: string;
  badge: string;
  badgeCls: string;
}) {
  return (
    <li className="flex items-center gap-2.5 rounded-lg border border-border bg-muted/30 px-3 py-2">
      <span className="shrink-0">{icona}</span>
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{nome}</span>
      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${badgeCls}`}>
        {badge}
      </span>
    </li>
  );
}

// ── "usa una sede esistente" — dropdown inline con ricerca ────────────────────

function UsaEsistente({
  sedi,
  onPick,
}: {
  sedi: SedeTenant[];
  onPick: (id: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState('');
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  React.useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 40);
      return () => clearTimeout(t);
    }
  }, [open]);

  const filtrate = React.useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return sedi;
    return sedi.filter((s) =>
      `${s.nome} ${TIPO_LABEL[s.tipo]}`.toLowerCase().includes(n),
    );
  }, [q, sedi]);

  if (sedi.length === 0) return null;

  return (
    <div ref={wrapRef} className="relative flex-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border bg-background py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/40"
      >
        <Plus className="h-4 w-4" aria-hidden="true" /> Usa una sede esistente
      </button>
      {open && (
        <div className="absolute bottom-full left-0 right-0 z-30 mb-1 overflow-hidden rounded-lg border border-border bg-popover shadow-lg">
          <div className="border-b border-border p-2">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <input
                ref={inputRef}
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Cerca sede…"
                aria-label="Cerca sede"
                className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>
          <ul className="max-h-[14rem] overflow-y-auto py-1">
            {filtrate.length === 0 ? (
              <li className="px-3 py-5 text-center text-sm text-muted-foreground">
                Nessuna sede trovata.
              </li>
            ) : (
              filtrate.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onPick(s.id);
                      setOpen(false);
                      setQ('');
                    }}
                    className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left transition-colors hover:bg-muted/60"
                  >
                    <IconaTipo tipo={s.tipo} className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-foreground">{s.nome}</span>
                      <span className="text-[11px] text-muted-foreground">{TIPO_LABEL[s.tipo]}</span>
                    </span>
                    <Check className="h-3.5 w-3.5 shrink-0 text-transparent" aria-hidden="true" />
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── "crea nuova sede" — stesso dialog dell'anagrafica, poi auto-collega ───────

function CreaSedeButton({
  cantiereId,
  onCreata,
}: {
  cantiereId: string;
  onCreata: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({
    nome: '',
    tipo: 'hotel' as TipoSede,
    indirizzo: '',
    lat: null as number | null,
    lng: null as number | null,
  });
  const [pending, startTransition] = React.useTransition();
  const [errore, setErrore] = React.useState<string | null>(null);

  function reset() {
    setForm({ nome: '', tipo: 'hotel', indirizzo: '', lat: null, lng: null });
    setErrore(null);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrore(null);
    startTransition(async () => {
      const res = await creaSede({
        nome: form.nome,
        tipo: form.tipo,
        indirizzo: form.indirizzo || undefined,
        lat: form.lat,
        lng: form.lng,
      });
      if (!res.ok) {
        setErrore(res.error);
        return;
      }
      // Auto-collega la sede appena creata a questo cantiere.
      await associaSedeCantiere({ cantiereId, sedeId: res.id });
      setOpen(false);
      reset();
      onCreata();
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="flex-1 gap-1.5"
        onClick={() => {
          reset();
          setOpen(true);
        }}
      >
        <Plus className="h-4 w-4" aria-hidden="true" /> Crea nuova sede
      </Button>
      <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nuova sede per questo cantiere</DialogTitle>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="nuovaSedeNome">Nome *</Label>
              <Input
                id="nuovaSedeNome"
                value={form.nome}
                onChange={(e) => setForm((s) => ({ ...s, nome: e.target.value }))}
                required
                placeholder="Es. Hotel Excelsior Monfalcone"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="nuovaSedeTipo">Tipo</Label>
              <select
                id="nuovaSedeTipo"
                value={form.tipo}
                onChange={(e) => setForm((s) => ({ ...s, tipo: e.target.value as TipoSede }))}
                className={SELECT_CLS}
              >
                <option value="sede_principale">Sede principale</option>
                <option value="sede_secondaria">Sede secondaria</option>
                <option value="hotel">Hotel</option>
                <option value="altro">Altro</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="nuovaSedeIndirizzo">Indirizzo</Label>
              <AddressAutocomplete
                id="nuovaSedeIndirizzo"
                value={form.indirizzo}
                onChange={(label) => setForm((s) => ({ ...s, indirizzo: label }))}
                onSelect={(r) => setForm((s) => ({ ...s, indirizzo: r.label, lat: r.lat, lng: r.lng }))}
                placeholder="Cerca un indirizzo (geolocalizzato)"
              />
            </div>
            {errore ? <p className="text-xs text-destructive">{errore}</p> : null}
            <DialogFooter className="gap-2 pt-1">
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
                Annulla
              </Button>
              <Button type="submit" disabled={pending || !form.nome.trim()}>
                {pending ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                )}
                Crea e collega
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
