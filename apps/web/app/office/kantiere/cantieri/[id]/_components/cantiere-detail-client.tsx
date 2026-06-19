'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ChevronLeft,
  Crown,
  Loader2,
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
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from '@kommessa/ui';
import { useConfirm } from '@/app/_components/confirm-provider';
import { AddressAutocomplete } from '@/app/_components/address-autocomplete';
import { fmtData, fmtDataOra } from '@/app/office/_lib/format';
import {
  aggiornaCantiere,
  eliminaCantiere,
  generaQrCantiere,
  rigeneraQrCantiere,
  impostaSquadraCantiere,
} from '../../../../_actions/cantieri';

// ── Types ──────────────────────────────────────────────────────────────────

interface CantiereProp {
  id: string;
  codice: string;
  nome: string;
  indirizzo: string | null;
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

interface QrInfo {
  token: string;
  createdAt: string;
  scansioni: number;
  dataUrl: string | null;
}

export interface RapportinoCantiere {
  rapportinoId: string;
  dipendenteNome: string;
  data: string;
  stato: string;
  ore_ordinarie: number;
  ore_straordinarie: number;
  ore_viaggio: number;
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
  commessaCollegata: string | null;
  rapportiniCantiere: RapportinoCantiere[];
  anomalie: AnomaliaRow[];
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

// ── Rapportino stato badge ────────────────────────────────────────────────

function StatoRapportinoBadge({ stato }: { stato: string }) {
  const map: Record<string, string> = {
    bozza: 'text-muted-foreground',
    inviato: 'text-blue-600 dark:text-blue-400',
    approvato: 'text-emerald-600 dark:text-emerald-400',
    rifiutato: 'text-destructive',
  };
  const labelMap: Record<string, string> = {
    bozza: 'Bozza',
    inviato: 'Inviato',
    approvato: 'Approvato',
    rifiutato: 'Rifiutato',
  };
  return (
    <span className={`text-xs font-medium ${map[stato] ?? 'text-muted-foreground'}`}>
      {labelMap[stato] ?? stato}
    </span>
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
  commessaCollegata,
  rapportiniCantiere,
  anomalie,
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
    note: cantiere.note ?? '',
  });
  const [savePending, startSave] = React.useTransition();
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [saveOk, setSaveOk] = React.useState(false);

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

  return (
    <div className="space-y-6">
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
        </div>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-semibold">{cantiere.nome}</h1>
            <span className="font-mono text-xs text-muted-foreground">{cantiere.codice}</span>
            <StatoCantiereBadge stato={cantiere.stato} />
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
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={openSquadraDialog}
            >
              <Users className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              Gestisci squadra
            </Button>
          </div>
        </div>
      </div>

      {/* ── QR prominente in alto ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <QrCode className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            QR cantiere
          </CardTitle>
        </CardHeader>
        <CardContent>
          {qr ? (
            <div className="flex flex-col sm:flex-row gap-6 items-start">
              {/* Immagine QR */}
              <div className="shrink-0">
                {qr.dataUrl ? (
                  <img
                    src={qr.dataUrl}
                    alt="QR cantiere"
                    width={160}
                    height={160}
                    className="rounded-md border border-border"
                  />
                ) : (
                  <div className="h-40 w-40 rounded-md border border-border bg-muted/30 flex items-center justify-center">
                    <QrCode className="h-10 w-10 text-muted-foreground/40" aria-hidden="true" />
                  </div>
                )}
              </div>
              {/* Info + azioni */}
              <div className="flex flex-col gap-4 min-w-0">
                <div className="space-y-1.5 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground w-32 shrink-0">Generato il</span>
                    <span className="font-medium tabular-nums">{fmtDataOra(qr.createdAt)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground w-32 shrink-0">Timbrature totali</span>
                    <span className="font-mono font-medium tabular-nums">{qr.scansioni}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
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
                <p className="text-xs text-muted-foreground">
                  Rigenerando il QR, le copie stampate in precedenza smetteranno di funzionare.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                Nessun QR attivo. Genera un QR per permettere ai dipendenti di timbrare entrata e uscita da questo cantiere.
              </p>
              <div>
                <Button
                  type="button"
                  size="sm"
                  disabled={qrPending}
                  onClick={handleGeneraQr}
                >
                  {qrPending ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <QrCode className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  Genera QR
                </Button>
              </div>
            </div>
          )}
          {qrError ? (
            <p role="alert" className="mt-3 text-xs text-destructive">{qrError}</p>
          ) : null}
        </CardContent>
      </Card>

      {/* ── Grid principale ── */}
      <div className="grid gap-6 xl:grid-cols-3">
        {/* ── Anagrafica (2 colonne su xl) ── */}
        <Card className="xl:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Anagrafica</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
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

                <div className="space-y-1.5">
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
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="indirizzo">Indirizzo cantiere</Label>
                <AddressAutocomplete
                  id="indirizzo"
                  value={form.indirizzo}
                  onChange={(label) => {
                    setForm((f) => ({ ...f, indirizzo: label }));
                    setSaveOk(false);
                  }}
                  onSelect={(r) => {
                    setForm((f) => ({
                      ...f,
                      indirizzo: r.label,
                      indirizzoLat: r.lat,
                      indirizzoLng: r.lng,
                    }));
                    setSaveOk(false);
                  }}
                  placeholder="Via Roma 12, Torino"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="sedePartenza">
                  Sede di partenza{' '}
                  <span className="text-xs text-muted-foreground">(default per questo cantiere)</span>
                </Label>
                <AddressAutocomplete
                  id="sedePartenza"
                  value={form.sedePartenza}
                  onChange={(label) => {
                    setForm((f) => ({ ...f, sedePartenza: label }));
                    setSaveOk(false);
                  }}
                  onSelect={(r) => {
                    setForm((f) => ({
                      ...f,
                      sedePartenza: r.label,
                      sedePartenzaLat: r.lat,
                      sedePartenzaLng: r.lng,
                    }));
                    setSaveOk(false);
                  }}
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
                  <p className="text-xs text-muted-foreground">
                    Era collegata a: {commessaCollegata}
                  </p>
                )}
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

              {saveError ? (
                <p className="text-xs text-destructive">{saveError}</p>
              ) : null}
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
          </CardContent>
        </Card>

        {/* ── Squadra ── */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base">
                Squadra{' '}
                <span className="font-mono text-xs font-normal text-muted-foreground">
                  {squadra.length}
                </span>
              </CardTitle>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={openSquadraDialog}
              >
                <Users className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                Gestisci
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {squadra.length === 0 ? (
              <p className="text-xs italic text-muted-foreground">
                Nessun dipendente assegnato a questo cantiere.
              </p>
            ) : (
              <div className="space-y-2">
                {/* Capo */}
                {capi.map((m) => (
                  <div
                    key={m.dipendente_id}
                    className="flex items-center gap-2 rounded-md border border-orange-200/60 bg-orange-50/40 px-2.5 py-1.5 dark:border-orange-900/30 dark:bg-orange-950/20"
                  >
                    <Crown className="h-3 w-3 shrink-0 text-orange-500" aria-hidden="true" />
                    <span className="flex-1 truncate text-xs font-semibold">{m.nome}</span>
                    <span className="shrink-0 text-[10px] text-orange-500/80 uppercase tracking-wide">capo</span>
                  </div>
                ))}
                {/* Membri */}
                {membri.length > 0 && (
                  <div className="rounded-md border border-border bg-muted/30">
                    {capi.length > 0 && (
                      <p className="px-2.5 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                        Membri
                      </p>
                    )}
                    <ul className={capi.length > 0 ? 'border-t border-border' : undefined}>
                      {membri.map((m) => (
                        <li
                          key={m.dipendente_id}
                          className="flex items-center gap-2 px-2.5 py-1.5"
                        >
                          <span className="ml-1 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/50" />
                          <span className="flex-1 truncate text-xs">{m.nome}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Rapportini del cantiere ── */}
        <Card className="xl:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              Rapportini{' '}
              <span className="font-mono text-xs font-normal text-muted-foreground">
                {rapportiniCantiere.length}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {rapportiniCantiere.length === 0 ? (
              <p className="text-xs italic text-muted-foreground">
                Nessun rapportino registrato per questo cantiere.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="pb-2 text-left text-xs font-medium text-muted-foreground">Dipendente</th>
                      <th className="pb-2 text-left text-xs font-medium text-muted-foreground">Data</th>
                      <th className="pb-2 text-left text-xs font-medium text-muted-foreground">Stato</th>
                      <th className="pb-2 text-right text-xs font-medium text-muted-foreground">Ord.</th>
                      <th className="pb-2 text-right text-xs font-medium text-muted-foreground">Straord.</th>
                      <th className="pb-2 text-right text-xs font-medium text-muted-foreground">Viaggio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rapportiniCantiere.map((r) => (
                      <tr
                        key={r.rapportinoId}
                        className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors"
                      >
                        <td className="py-2 pr-3 text-xs">{r.dipendenteNome}</td>
                        <td className="py-2 pr-3 text-xs tabular-nums">{fmtData(r.data)}</td>
                        <td className="py-2 pr-3">
                          <StatoRapportinoBadge stato={r.stato} />
                        </td>
                        <td className="py-2 pr-3 text-right text-xs tabular-nums">
                          {r.ore_ordinarie > 0 ? r.ore_ordinarie : <span className="text-muted-foreground/50">—</span>}
                        </td>
                        <td className="py-2 pr-3 text-right text-xs tabular-nums">
                          {r.ore_straordinarie > 0 ? r.ore_straordinarie : <span className="text-muted-foreground/50">—</span>}
                        </td>
                        <td className="py-2 text-right text-xs tabular-nums">
                          {r.ore_viaggio > 0 ? r.ore_viaggio : <span className="text-muted-foreground/50">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Anomalie ── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle
                className={`h-4 w-4 ${anomalie.length > 0 ? 'text-amber-500' : 'text-muted-foreground'}`}
                aria-hidden="true"
              />
              Anomalie
              {anomalie.length > 0 && (
                <span className="ml-auto font-mono text-xs font-normal text-amber-600 dark:text-amber-400">
                  {anomalie.length}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {anomalie.length === 0 ? (
              <p className="text-xs italic text-muted-foreground">
                Nessuna anomalia negli ultimi 30 giorni.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {anomalie.map((a, i) => (
                  <li
                    key={`${a.dipendente_id}-${a.giorno}-${i}`}
                    className="flex items-center justify-between gap-2 rounded-md border border-amber-200/50 bg-amber-50/30 px-2.5 py-1.5 dark:border-amber-900/30 dark:bg-amber-950/10"
                  >
                    <span className="truncate text-xs">{a.dipendenteNome}</span>
                    <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
                      {fmtData(a.giorno)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {anomalie.length > 0 && (
              <p className="mt-3 text-xs text-muted-foreground">
                Timbrature senza coppia ingresso/uscita negli ultimi 30 giorni.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Dialog Gestisci squadra ── */}
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
