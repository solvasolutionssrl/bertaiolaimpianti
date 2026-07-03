'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  Clock,
  Crown,
  HardHat,
  History,
  Loader2,
  MapPin,
  Navigation,
  Car,
  Plus,
  Printer,
  QrCode,
  RefreshCw,
  Trash2,
  Users,
} from 'lucide-react';
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
import { useConfirm } from '@/app/_components/confirm-provider';
import { LiveRefresh } from '@/app/_components/live-refresh';
import { AddressAutocomplete } from '@/app/_components/address-autocomplete';
import { fmtData, fmtDataOra } from '@/app/office/_lib/format';
import { categoriaLabel, categoriaTono } from '@/app/_lib/cantiere-categoria';
import {
  aggiornaCantiere,
  eliminaCantiere,
  generaQrCantiere,
  rigeneraQrCantiere,
  impostaSquadraCantiere,
} from '../../../../_actions/cantieri';
import { creaSede } from '../../../../_actions/kantiere-sedi';
import { ChiInCantiere, SezioneHeader, type PresenteRow } from './chi-in-cantiere';
import { StoricoPresenze, type StoricoData } from './storico-presenze';

// ── Types ──────────────────────────────────────────────────────────────────

interface CantiereProp {
  id: string;
  codice: string;
  codiceCommessa: string | null;
  nome: string;
  clienteNome: string | null;
  indirizzo: string | null;
  categoria: string | null;
  indirizzoDaVerificare: boolean;
  indirizzoLat: number | null;
  indirizzoLng: number | null;
  sedePartenza: string | null;
  sedePartenzaLat: number | null;
  sedePartenzaLng: number | null;
  commessaId: string | null;
  stato: 'attivo' | 'sospeso' | 'chiuso';
  note: string | null;
}

interface MembroSquadra {
  dipendente_id: string;
  nome: string;
  ruolo: string;
}

interface DipendenteDisp {
  id: string;
  nome: string;
}

interface CommessaOption {
  id: string;
  titolo: string;
}

interface SedeOption {
  id: string;
  nome: string;
  lat: number | null;
  lng: number | null;
}

interface QrInfo {
  token: string;
  createdAt: string;
  scansioni: number;
  dataUrl: string | null;
}

export interface AnomaliaRow {
  dipendente_id: string;
  dipendenteNome: string;
  giorno: string;
}

interface Props {
  cantiere: CantiereProp;
  squadra: MembroSquadra[];
  dipendentiAttivi: DipendenteDisp[];
  qr: QrInfo | null;
  printHref: string;
  commesse: CommessaOption[];
  sedi: SedeOption[];
  commessaCollegata: string | null;
  anomalie: AnomaliaRow[];
  chiInCantiere: PresenteRow[];
  storico: StoricoData;
}

// ── Select style ──────────────────────────────────────────────────────────

const SELECT_CLS =
  'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

// ── Stato badge ───────────────────────────────────────────────────────────

function StatoCantiereBadge({ stato }: { stato: 'attivo' | 'sospeso' | 'chiuso' }) {
  const map: Record<string, { label: string; cls: string }> = {
    attivo: { label: 'Attivo', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200/70 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800/50' },
    sospeso: { label: 'Sospeso', cls: 'bg-amber-50 text-amber-700 border-amber-200/70 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800/50' },
    chiuso: { label: 'Chiuso', cls: 'bg-muted text-muted-foreground border-border' },
  };
  const s = map[stato] ?? map['chiuso']!;
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${s.cls}`}>
      {s.label}
    </span>
  );
}

// ── Stato indirizzo (verificato / da verificare) ────────────────────────────

function AddressStatus({
  verificato,
  indirizzo,
  onCorreggi,
}: {
  verificato: boolean;
  indirizzo: string;
  onCorreggi: () => void;
}) {
  const mapsHref = indirizzo
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(indirizzo)}`
    : null;
  if (verificato) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400 sm:w-48">
        <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="flex-1">Indirizzo verificato</span>
        {mapsHref ? (
          <a
            href={mapsHref}
            target="_blank"
            rel="noreferrer"
            title="Apri in Maps"
            className="shrink-0 rounded p-0.5 hover:bg-emerald-100 dark:hover:bg-emerald-900/40"
          >
            <Navigation className="h-4 w-4" aria-hidden="true" />
          </a>
        ) : null}
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onCorreggi}
      className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-left text-xs font-medium text-amber-700 transition-colors hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300 dark:hover:bg-amber-900/40 sm:w-48"
    >
      <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="flex-1">Da verificare — correggi</span>
    </button>
  );
}

// ── KPI chip ──────────────────────────────────────────────────────────────

function KpiChip({
  icon,
  valore,
  label,
  accent,
}: {
  icon: React.ReactNode;
  valore: React.ReactNode;
  label: string;
  accent: 'blue' | 'amber' | 'emerald' | 'slate';
}) {
  const map: Record<string, string> = {
    blue: 'border-blue-200/60 bg-blue-50/60 text-blue-700 dark:border-blue-900/40 dark:bg-blue-950/20 dark:text-blue-300',
    amber: 'border-amber-200/60 bg-amber-50/60 text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300',
    emerald: 'border-emerald-200/60 bg-emerald-50/60 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300',
    slate: 'border-border bg-muted/40 text-foreground',
  };
  return (
    <div className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 ${map[accent]}`}>
      <span className="shrink-0 opacity-80">{icon}</span>
      <div className="min-w-0">
        <p className="text-lg font-bold leading-none tabular-nums">{valore}</p>
        <p className="mt-0.5 truncate text-[11px] font-medium uppercase tracking-wide opacity-80">{label}</p>
      </div>
    </div>
  );
}

function fmtOreKpi(n: number): string {
  const totMin = Math.max(0, Math.round(n * 60));
  return `${Math.floor(totMin / 60)}:${String(totMin % 60).padStart(2, '0')}`;
}

// ── Section card wrapper (compatto, con header a icona) ─────────────────────

function Sezione({
  header,
  children,
  className = '',
}: {
  header: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={`shadow-soft ${className}`}>
      <div className="border-b border-border bg-muted/20 px-4 py-2.5">{header}</div>
      <CardContent className="p-4">{children}</CardContent>
    </Card>
  );
}

// ── Main component ────────────────────────────────────────────────────────

export function CantiereDetailClient({
  cantiere,
  squadra: squadraInit,
  dipendentiAttivi,
  qr: qrInit,
  printHref,
  commesse,
  sedi,
  commessaCollegata,
  anomalie,
  chiInCantiere,
  storico,
}: Props) {
  const router = useRouter();
  const confirm = useConfirm();

  // ── Anagrafica state ──
  const [form, setForm] = React.useState({
    nome: cantiere.nome,
    indirizzo: cantiere.indirizzo ?? '',
    indirizzoLat: cantiere.indirizzoLat,
    indirizzoLng: cantiere.indirizzoLng,
    sedePartenza: cantiere.sedePartenza ?? '',
    sedePartenzaLat: cantiere.sedePartenzaLat,
    sedePartenzaLng: cantiere.sedePartenzaLng,
    commessaId: cantiere.commessaId ?? '',
    stato: cantiere.stato,
    indirizzoDaVerificare: cantiere.indirizzoDaVerificare,
    note: cantiere.note ?? '',
  });
  const [savePending, startSave] = React.useTransition();
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [saveOk, setSaveOk] = React.useState(false);

  // Indirizzo: si mostra la card stato; "Correggi" apre il box arancione con
  // l'autocomplete per scegliere+linkare l'indirizzo giusto (smarca "da
  // verificare"). `correzioneOk` = lampo verde prima di richiudere il box.
  const [indirizzoEditing, setIndirizzoEditing] = React.useState(false);
  const [correzioneOk, setCorrezioneOk] = React.useState(false);

  // Sede di partenza: dropdown fra le sedi esistenti + dialog "crea sede".
  const [sediList, setSediList] = React.useState<SedeOption[]>(sedi);
  const [sedeDialogOpen, setSedeDialogOpen] = React.useState(false);
  const [sedeForm, setSedeForm] = React.useState({
    nome: '',
    tipo: 'sede_principale' as 'sede_principale' | 'sede_secondaria' | 'hotel' | 'altro',
    indirizzo: '',
    lat: null as number | null,
    lng: null as number | null,
  });
  const [sedePending, startSede] = React.useTransition();
  const [sedeError, setSedeError] = React.useState<string | null>(null);

  // ── Squadra state ──
  const [squadra, setSquadra] = React.useState(squadraInit);
  const [squadraDialogOpen, setSquadraDialogOpen] = React.useState(false);
  // Dialog state
  const [dialogCapoId, setDialogCapoId] = React.useState<string>('');
  const [dialogMembriIds, setDialogMembriIds] = React.useState<Set<string>>(new Set());
  const [squadraPending, startSquadra] = React.useTransition();
  const [squadraError, setSquadraError] = React.useState<string | null>(null);

  // ── QR state ──
  const [qr, setQr] = React.useState(qrInit);
  const [qrPending, startQr] = React.useTransition();
  const [qrError, setQrError] = React.useState<string | null>(null);

  // ── Anagrafica handlers ──

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
    setSaveOk(false);
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaveError(null);
    setSaveOk(false);
    startSave(async () => {
      const res = await aggiornaCantiere({
        id: cantiere.id,
        nome: form.nome,
        indirizzo: form.indirizzo || null,
        indirizzoLat: form.indirizzoLat,
        indirizzoLng: form.indirizzoLng,
        sedePartenza: form.sedePartenza || null,
        sedePartenzaLat: form.sedePartenzaLat,
        sedePartenzaLng: form.sedePartenzaLng,
        commessaId: form.commessaId || null,
        stato: form.stato,
        indirizzoDaVerificare: form.indirizzoDaVerificare,
        note: form.note || null,
      });
      if (!res.ok) {
        setSaveError(res.error);
        return;
      }
      setSaveOk(true);
      router.refresh();
    });
  }

  // Indirizzo scelto dall'autocomplete (solo con coordinate) → linka + smarca
  // "da verificare", lampo verde, poi chiude il box.
  function selezionaIndirizzo(r: { label: string; lat: number | null; lng: number | null }) {
    setForm((f) => ({
      ...f,
      indirizzo: r.label,
      indirizzoLat: r.lat,
      indirizzoLng: r.lng,
      indirizzoDaVerificare: false,
    }));
    setSaveOk(false);
    setCorrezioneOk(true);
    setTimeout(() => {
      setIndirizzoEditing(false);
      setCorrezioneOk(false);
    }, 1100);
  }

  // Sede scelta dal dropdown.
  function selezionaSede(id: string) {
    if (id === '__crea__') {
      setSedeForm({ nome: '', tipo: 'sede_principale', indirizzo: '', lat: null, lng: null });
      setSedeError(null);
      setSedeDialogOpen(true);
      return;
    }
    if (id === '') {
      setForm((f) => ({ ...f, sedePartenza: '', sedePartenzaLat: null, sedePartenzaLng: null }));
      setSaveOk(false);
      return;
    }
    const s = sediList.find((x) => x.id === id);
    if (!s) return;
    setForm((f) => ({ ...f, sedePartenza: s.nome, sedePartenzaLat: s.lat, sedePartenzaLng: s.lng }));
    setSaveOk(false);
  }

  function handleCreaSede(e: React.FormEvent) {
    e.preventDefault();
    setSedeError(null);
    startSede(async () => {
      const res = await creaSede({
        nome: sedeForm.nome,
        tipo: sedeForm.tipo,
        indirizzo: sedeForm.indirizzo || undefined,
        lat: sedeForm.lat,
        lng: sedeForm.lng,
      });
      if (!res.ok) {
        setSedeError(res.error);
        return;
      }
      const nuova: SedeOption = {
        id: res.id,
        nome: sedeForm.nome,
        lat: sedeForm.lat,
        lng: sedeForm.lng,
      };
      setSediList((list) => [...list, nuova].sort((a, b) => a.nome.localeCompare(b.nome)));
      setForm((f) => ({
        ...f,
        sedePartenza: nuova.nome,
        sedePartenzaLat: nuova.lat,
        sedePartenzaLng: nuova.lng,
      }));
      setSedeDialogOpen(false);
      setSaveOk(false);
    });
  }

  async function handleElimina() {
    const ok = await confirm({
      title: 'Eliminare il cantiere?',
      description:
        'Questa azione rimuove il cantiere e la sua squadra. Le timbrature storiche vengono mantenute.',
      confirmLabel: 'Elimina',
      destructive: true,
    });
    if (!ok) return;
    const res = await eliminaCantiere({ id: cantiere.id });
    if (!res.ok) {
      setSaveError(res.error);
      return;
    }
    router.push('/office/kantiere/cantieri');
  }

  // ── Squadra dialog helpers ──

  function openSquadraDialog() {
    const capo = squadra.find((m) => m.ruolo === 'capo');
    setDialogCapoId(capo?.dipendente_id ?? '');
    setDialogMembriIds(new Set(squadra.filter((m) => m.ruolo !== 'capo').map((m) => m.dipendente_id)));
    setSquadraError(null);
    setSquadraDialogOpen(true);
  }

  function toggleMembro(id: string) {
    setDialogMembriIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleConfermaSquadra() {
    setSquadraError(null);
    startSquadra(async () => {
      const membriIds = [...dialogMembriIds];
      const capoId = dialogCapoId || null;
      const res = await impostaSquadraCantiere({
        cantiereId: cantiere.id,
        capoId,
        membriIds,
      });
      if (!res.ok) {
        setSquadraError(res.error);
        return;
      }
      // Aggiorna la squadra locale
      const nuova: MembroSquadra[] = [];
      if (capoId) {
        const dip = dipendentiAttivi.find((d) => d.id === capoId);
        nuova.push({ dipendente_id: capoId, nome: dip?.nome ?? capoId, ruolo: 'capo' });
      }
      for (const id of membriIds) {
        if (id === capoId) continue;
        const dip = dipendentiAttivi.find((d) => d.id === id);
        nuova.push({ dipendente_id: id, nome: dip?.nome ?? id, ruolo: 'membro' });
      }
      setSquadra(nuova);
      setSquadraDialogOpen(false);
      router.refresh();
    });
  }

  // ── QR handlers ──

  function handleGeneraQr() {
    setQrError(null);
    startQr(async () => {
      const res = await generaQrCantiere({ cantiereId: cantiere.id });
      if (!res.ok) { setQrError(res.error); return; }
      setQr({ token: res.token, createdAt: new Date().toISOString(), scansioni: 0, dataUrl: null });
      router.refresh();
    });
  }

  async function handleRigeneraQr() {
    const ok = await confirm({
      title: 'Rigenerare il QR?',
      description:
        'Le copie stampate in precedenza smetteranno di funzionare. Occorre ristampare il nuovo QR.',
      confirmLabel: 'Rigenera',
      destructive: true,
    });
    if (!ok) return;
    setQrError(null);
    startQr(async () => {
      const res = await rigeneraQrCantiere({ cantiereId: cantiere.id });
      if (!res.ok) { setQrError(res.error); return; }
      setQr({ token: res.token, createdAt: new Date().toISOString(), scansioni: 0, dataUrl: null });
      router.refresh();
    });
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const capi = squadra.filter((m) => m.ruolo === 'capo');
  const membri = squadra.filter((m) => m.ruolo !== 'capo');
  const personeAttive = chiInCantiere.length;

  return (
    <div className="space-y-5">
      {/* ── Header band ── */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Link
            href="/office/kantiere/cantieri"
            className="flex items-center gap-1 hover:text-foreground transition-colors"
          >
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Cantieri
          </Link>
          <span aria-hidden="true">/</span>
          <span className="text-foreground font-medium">{cantiere.nome}</span>
          <LiveRefresh intervalMs={60000} className="ml-auto" />
        </div>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-xl font-semibold">{cantiere.nome}</h1>
            {cantiere.codiceCommessa || cantiere.codice ? (
              <span className="rounded-md bg-primary/10 px-2 py-0.5 font-mono text-xs font-semibold text-primary">
                {cantiere.codiceCommessa?.trim() || cantiere.codice}
              </span>
            ) : null}
            {cantiere.categoria ? (
              <span
                className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${categoriaTono(cantiere.categoria)}`}
              >
                {categoriaLabel(cantiere.categoria)}
              </span>
            ) : null}
            <StatoCantiereBadge stato={cantiere.stato} />
            {cantiere.indirizzoDaVerificare ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                Indirizzo da verificare
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {qr ? (
              <Button asChild size="sm" variant="outline">
                <Link href={printHref}>
                  <Printer className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                  Stampa QR
                </Link>
              </Button>
            ) : null}
            <Button type="button" size="sm" variant="outline" onClick={openSquadraDialog}>
              <Users className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              Gestisci squadra
            </Button>
          </div>
        </div>
        {cantiere.clienteNome ? (
          <p className="text-sm text-muted-foreground">
            Cliente: <span className="font-medium text-foreground">{cantiere.clienteNome}</span>
          </p>
        ) : null}
      </div>

      {/* ── KPI strip (periodo storico) ── */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
        <KpiChip
          accent="emerald"
          icon={<HardHat className="h-4 w-4" aria-hidden="true" />}
          valore={personeAttive}
          label="In cantiere ora"
        />
        <KpiChip
          accent="blue"
          icon={<Clock className="h-4 w-4" aria-hidden="true" />}
          valore={`${fmtOreKpi(storico.totali.totale)}`}
          label={`Ore (${storico.giorni}gg)`}
        />
        <KpiChip
          accent="amber"
          icon={<Clock className="h-4 w-4" aria-hidden="true" />}
          valore={`${fmtOreKpi(storico.totali.straordinarie)}`}
          label="Straordinari"
        />
        <KpiChip
          accent="blue"
          icon={<Car className="h-4 w-4" aria-hidden="true" />}
          valore={`${fmtOreKpi(storico.totali.viaggio)}`}
          label="Viaggio"
        />
        <KpiChip
          accent={anomalie.length > 0 ? 'amber' : 'slate'}
          icon={<AlertTriangle className="h-4 w-4" aria-hidden="true" />}
          valore={anomalie.length}
          label="Anomalie"
        />
      </div>

      {/* ── Due colonne ── */}
      <div className="grid gap-5 lg:grid-cols-3">
        {/* ── LEFT (main, 2/3) ── */}
        <div className="space-y-5 lg:col-span-2">
          {/* Anagrafica compatta */}
          <Sezione
            header={
              <SezioneHeader
                icon={<MapPin className="h-4 w-4" aria-hidden="true" />}
                titolo="Anagrafica"
                accent="blue"
              />
            }
          >
            <form onSubmit={handleSave} className="space-y-4">
              {/* Nome — tutta larghezza */}
              <div className="space-y-1">
                <Label htmlFor="nome">Nome *</Label>
                <Input
                  id="nome"
                  name="nome"
                  value={form.nome}
                  onChange={handleChange}
                  required
                  placeholder="Es. Villa Rossi"
                />
              </div>

              {/* Indirizzo — tutta larghezza. In correzione il box si evidenzia in
                  arancione con la spiegazione e non si chiude finché non è ok;
                  alla scelta di un indirizzo valido → lampo verde poi si chiude. */}
              <div className="space-y-1">
                <Label htmlFor="indirizzo">Indirizzo cantiere</Label>
                {indirizzoEditing ? (
                  <div
                    className={
                      'rounded-lg border-2 p-3 transition-colors duration-300 ' +
                      (correzioneOk
                        ? 'border-emerald-400 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950/30'
                        : 'border-amber-400 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30')
                    }
                  >
                    {correzioneOk ? (
                      <p className="flex items-center gap-2 py-2 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                        <Check className="h-5 w-5" aria-hidden="true" />
                        Indirizzo verificato!
                      </p>
                    ) : (
                      <>
                        <p className="mb-2 flex items-start gap-2 text-xs text-amber-800 dark:text-amber-200">
                          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                          <span>
                            Questo indirizzo è <strong>da verificare</strong>. Cerca qui sotto
                            quello corretto e <strong>selezionalo dai suggerimenti</strong>: il
                            riquadro si chiude da solo quando è a posto.
                          </span>
                        </p>
                        <AddressAutocomplete
                          id="indirizzo"
                          value={form.indirizzo}
                          onChange={(label) => {
                            setForm((f) => ({
                              ...f,
                              indirizzo: label,
                              indirizzoLat: null,
                              indirizzoLng: null,
                            }));
                            setSaveOk(false);
                          }}
                          onSelect={(r) => {
                            if (r.lat != null && r.lng != null) selezionaIndirizzo(r);
                          }}
                          placeholder="Cerca l&apos;indirizzo giusto..."
                        />
                        <button
                          type="button"
                          onClick={() => setIndirizzoEditing(false)}
                          className="mt-2 text-xs text-muted-foreground hover:underline"
                        >
                          Annulla
                        </button>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                    <div className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm">
                      <span className="truncate">
                        {form.indirizzo || (
                          <span className="text-muted-foreground">Nessun indirizzo</span>
                        )}
                      </span>
                      <button
                        type="button"
                        onClick={() => setIndirizzoEditing(true)}
                        className="shrink-0 text-xs font-medium text-primary hover:underline"
                      >
                        Cambia
                      </button>
                    </div>
                    <AddressStatus
                      verificato={!form.indirizzoDaVerificare && form.indirizzoLat != null}
                      indirizzo={form.indirizzo}
                      onCorreggi={() => setIndirizzoEditing(true)}
                    />
                  </div>
                )}
              </div>

              {/* Stato · Commessa · Sede di partenza */}
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1">
                  <Label htmlFor="stato">Stato</Label>
                  <select
                    id="stato"
                    name="stato"
                    value={form.stato}
                    onChange={handleChange}
                    className={SELECT_CLS}
                  >
                    <option value="attivo">Attivo</option>
                    <option value="sospeso">Sospeso</option>
                    <option value="chiuso">Chiuso</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="commessaId">Commessa allegata</Label>
                  <select
                    id="commessaId"
                    name="commessaId"
                    value={form.commessaId}
                    onChange={handleChange}
                    className={SELECT_CLS}
                  >
                    <option value="">Nessuna</option>
                    {commesse.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.titolo}
                      </option>
                    ))}
                  </select>
                  {commessaCollegata && !form.commessaId && (
                    <p className="text-xs text-muted-foreground">Era: {commessaCollegata}</p>
                  )}
                </div>

                <div className="space-y-1">
                  <Label htmlFor="sede">Sede di partenza</Label>
                  <select
                    id="sede"
                    value={sediList.find((s) => s.nome === form.sedePartenza)?.id ?? ''}
                    onChange={(e) => selezionaSede(e.target.value)}
                    className={SELECT_CLS}
                  >
                    <option value="">Nessuna</option>
                    {sediList.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.nome}
                      </option>
                    ))}
                    <option value="__crea__">+ Crea nuova sede…</option>
                  </select>
                  {form.sedePartenza && !sediList.some((s) => s.nome === form.sedePartenza) ? (
                    <p className="text-xs text-muted-foreground">Attuale: {form.sedePartenza}</p>
                  ) : null}
                </div>
              </div>

              <div className="space-y-1">
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

              {saveError ? <p className="text-xs text-destructive">{saveError}</p> : null}
              {saveOk ? (
                <p className="text-xs text-emerald-600 dark:text-emerald-400">Salvato.</p>
              ) : null}

              <div className="flex items-center justify-between pt-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={handleElimina}
                  disabled={savePending}
                >
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                  Elimina cantiere
                </Button>
                <Button type="submit" size="sm" disabled={savePending}>
                  {savePending ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  ) : null}
                  {savePending ? 'Salvo...' : 'Salva'}
                </Button>
              </div>
            </form>
          </Sezione>

          {/* Dialog: crea nuova sede (come dalla tab Sedi) */}
          <Dialog
            open={sedeDialogOpen}
            onOpenChange={(o) => {
              if (!o && !sedePending) setSedeDialogOpen(false);
            }}
          >
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Nuova sede</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreaSede} className="space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="sedeNome">Nome *</Label>
                  <Input
                    id="sedeNome"
                    value={sedeForm.nome}
                    onChange={(e) => setSedeForm((s) => ({ ...s, nome: e.target.value }))}
                    required
                    placeholder="Es. Magazzino Valeggio"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="sedeTipo">Tipo</Label>
                  <select
                    id="sedeTipo"
                    value={sedeForm.tipo}
                    onChange={(e) =>
                      setSedeForm((s) => ({ ...s, tipo: e.target.value as typeof s.tipo }))
                    }
                    className={SELECT_CLS}
                  >
                    <option value="sede_principale">Sede principale</option>
                    <option value="sede_secondaria">Sede secondaria</option>
                    <option value="hotel">Hotel</option>
                    <option value="altro">Altro</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="sedeIndirizzo">Indirizzo</Label>
                  <AddressAutocomplete
                    id="sedeIndirizzo"
                    value={sedeForm.indirizzo}
                    onChange={(label) => setSedeForm((s) => ({ ...s, indirizzo: label }))}
                    onSelect={(r) =>
                      setSedeForm((s) => ({ ...s, indirizzo: r.label, lat: r.lat, lng: r.lng }))
                    }
                    placeholder="Cerca un indirizzo (geolocalizzato)"
                  />
                </div>
                {sedeError ? <p className="text-xs text-destructive">{sedeError}</p> : null}
                <DialogFooter className="gap-2 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setSedeDialogOpen(false)}
                    disabled={sedePending}
                  >
                    Annulla
                  </Button>
                  <Button type="submit" disabled={sedePending || !sedeForm.nome.trim()}>
                    {sedePending ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    Crea sede
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          {/* Chi c'è in cantiere ora */}
          <Sezione
            header={
              <SezioneHeader
                icon={<HardHat className="h-4 w-4" aria-hidden="true" />}
                titolo="Chi c'è in cantiere ora"
                accent="emerald"
                right={
                  personeAttive > 0 ? (
                    <span className="font-mono text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                      {personeAttive}
                    </span>
                  ) : null
                }
              />
            }
          >
            <ChiInCantiere presenti={chiInCantiere} />
          </Sezione>

          {/* Storico presenze */}
          <Sezione
            header={
              <SezioneHeader
                icon={<History className="h-4 w-4" aria-hidden="true" />}
                titolo="Storico presenze"
                accent="blue"
              />
            }
          >
            <StoricoPresenze data={storico} />
          </Sezione>
        </div>

        {/* ── RIGHT (sidebar, 1/3, sticky) ── */}
        <div className="space-y-5 lg:sticky lg:top-4 lg:self-start">
          {/* QR */}
          <Sezione
            header={
              <SezioneHeader
                icon={<QrCode className="h-4 w-4" aria-hidden="true" />}
                titolo="QR cantiere"
                accent="blue"
              />
            }
          >
            {qr ? (
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  {qr.dataUrl ? (
                    <img
                      src={qr.dataUrl}
                      alt="QR cantiere"
                      width={104}
                      height={104}
                      className="shrink-0 rounded-md border border-border"
                    />
                  ) : (
                    <div className="flex h-[104px] w-[104px] shrink-0 items-center justify-center rounded-md border border-border bg-muted/30">
                      <QrCode className="h-8 w-8 text-muted-foreground/40" aria-hidden="true" />
                    </div>
                  )}
                  <div className="min-w-0 space-y-1.5 text-xs">
                    <div>
                      <p className="text-muted-foreground">Generato il</p>
                      <p className="font-medium tabular-nums">{fmtDataOra(qr.createdAt)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Timbrature totali</p>
                      <p className="font-mono text-sm font-semibold tabular-nums">{qr.scansioni}</p>
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button asChild size="sm">
                    <Link href={printHref}>
                      <Printer className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                      Stampa
                    </Link>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={qrPending}
                    onClick={handleRigeneraQr}
                  >
                    {qrPending ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    Rigenera
                  </Button>
                </div>
                <p className="text-[11px] leading-snug text-muted-foreground">
                  Rigenerando il QR, le copie stampate in precedenza smetteranno di funzionare.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Nessun QR attivo. Genera un QR per permettere ai dipendenti di timbrare entrata e
                  uscita da questo cantiere.
                </p>
                <Button type="button" size="sm" disabled={qrPending} onClick={handleGeneraQr}>
                  {qrPending ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <QrCode className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  Genera QR
                </Button>
              </div>
            )}
            {qrError ? (
              <p role="alert" className="mt-3 text-xs text-destructive">{qrError}</p>
            ) : null}
          </Sezione>

          {/* Squadra */}
          <Sezione
            header={
              <SezioneHeader
                icon="persone"
                titolo="Squadra"
                accent="amber"
                right={
                  <Button type="button" size="sm" variant="outline" onClick={openSquadraDialog}>
                    Gestisci
                  </Button>
                }
              />
            }
          >
            {squadra.length === 0 ? (
              <p className="text-xs italic text-muted-foreground">
                Nessun dipendente assegnato a questo cantiere.
              </p>
            ) : (
              <div className="space-y-2">
                {capi.map((m) => (
                  <div
                    key={m.dipendente_id}
                    className="flex items-center gap-2 rounded-md border border-orange-200/60 bg-orange-50/40 px-2.5 py-1.5 dark:border-orange-900/30 dark:bg-orange-950/20"
                  >
                    <Crown className="h-3 w-3 shrink-0 text-orange-500" aria-hidden="true" />
                    <span className="flex-1 truncate text-xs font-semibold">{m.nome}</span>
                    <span className="shrink-0 text-[10px] uppercase tracking-wide text-orange-500/80">capo</span>
                  </div>
                ))}
                {membri.length > 0 && (
                  <div className="rounded-md border border-border bg-muted/30">
                    {capi.length > 0 && (
                      <p className="px-2.5 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                        Membri
                      </p>
                    )}
                    <ul className={capi.length > 0 ? 'border-t border-border' : undefined}>
                      {membri.map((m) => (
                        <li key={m.dipendente_id} className="flex items-center gap-2 px-2.5 py-1.5">
                          <span className="ml-1 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/50" />
                          <span className="flex-1 truncate text-xs">{m.nome}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </Sezione>

          {/* Anomalie */}
          <Sezione
            header={
              <SezioneHeader
                icon={
                  <AlertTriangle
                    className={`h-4 w-4 ${anomalie.length > 0 ? 'text-amber-500' : ''}`}
                    aria-hidden="true"
                  />
                }
                titolo="Anomalie"
                accent="amber"
                right={
                  anomalie.length > 0 ? (
                    <span className="font-mono text-xs font-semibold text-amber-600 dark:text-amber-400">
                      {anomalie.length}
                    </span>
                  ) : null
                }
              />
            }
          >
            {anomalie.length === 0 ? (
              <p className="text-xs italic text-muted-foreground">
                Nessuna anomalia nel periodo selezionato.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {anomalie.map((a, i) => (
                  <li
                    key={`${a.dipendente_id}-${a.giorno}-${i}`}
                    className="flex items-center justify-between gap-2 rounded-md border border-amber-200/50 bg-amber-50/30 px-2.5 py-1.5 dark:border-amber-900/30 dark:bg-amber-950/10"
                  >
                    <span className="truncate text-xs">{a.dipendenteNome}</span>
                    <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                      {fmtData(a.giorno)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {anomalie.length > 0 && (
              <p className="mt-3 text-[11px] leading-snug text-muted-foreground">
                Timbrature senza coppia ingresso/uscita nel periodo selezionato.
              </p>
            )}
          </Sezione>
        </div>
      </div>

      {/* ── Dialog Gestisci squadra (invariato) ── */}
      <Dialog open={squadraDialogOpen} onOpenChange={setSquadraDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Squadra {cantiere.nome}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Capo squadra */}
            <div className="space-y-1.5">
              <Label htmlFor="dialog-capo">Capo squadra</Label>
              <select
                id="dialog-capo"
                value={dialogCapoId}
                onChange={(e) => setDialogCapoId(e.target.value)}
                className={SELECT_CLS}
              >
                <option value="">Nessun capo</option>
                {dipendentiAttivi.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nome}
                  </option>
                ))}
              </select>
            </div>

            {/* Membri (checkbox) */}
            <div className="space-y-1.5">
              <Label>Membri</Label>
              <div className="max-h-56 overflow-y-auto rounded-md border border-border divide-y divide-border">
                {dipendentiAttivi.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-muted-foreground italic">Nessun dipendente attivo.</p>
                ) : (
                  dipendentiAttivi.map((d) => {
                    const isCapo = d.id === dialogCapoId;
                    const checked = isCapo || dialogMembriIds.has(d.id);
                    return (
                      <label
                        key={d.id}
                        className={`flex cursor-pointer items-center gap-2.5 px-3 py-2 hover:bg-muted/50 transition-colors ${isCapo ? 'opacity-60 cursor-not-allowed' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={isCapo}
                          onChange={() => { if (!isCapo) toggleMembro(d.id); }}
                          className="h-3.5 w-3.5 rounded border-border accent-primary"
                        />
                        <span className="flex-1 text-sm">{d.nome}</span>
                        {isCapo && (
                          <Crown className="h-3 w-3 text-orange-500 shrink-0" aria-hidden="true" />
                        )}
                      </label>
                    );
                  })
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Il capo squadra viene incluso automaticamente.
              </p>
            </div>

            {squadraError ? (
              <p role="alert" className="text-xs text-destructive">{squadraError}</p>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setSquadraDialogOpen(false)}
              disabled={squadraPending}
            >
              Annulla
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={squadraPending}
              onClick={handleConfermaSquadra}
            >
              {squadraPending ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : null}
              Conferma
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
