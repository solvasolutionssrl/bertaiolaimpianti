'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Crown,
  Loader2,
  Plus,
  QrCode,
  RefreshCw,
  Trash2,
  X,
  ChevronDown,
  ChevronUp,
  Printer,
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
import { fmtDataOra } from '@/app/office/_lib/format';
import {
  aggiornaCantiere,
  eliminaCantiere,
  aggiungiMembroSquadraCantiere,
  rimuoviMembroSquadraCantiere,
  impostaRuoloSquadraCantiere,
  generaQrCantiere,
  rigeneraQrCantiere,
} from '../../../../_actions/cantieri';

// ── Types ──────────────────────────────────────────────────────────────────

interface CantiereProp {
  id: string;
  codice: string;
  nome: string;
  indirizzo: string | null;
  sedePartenza: string | null;
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
}

interface Props {
  cantiere: CantiereProp;
  squadra: MembroSquadra[];
  dipendentiDisponibili: DipendenteDisp[];
  qr: QrInfo | null;
  commesse: CommessaOption[];
  commessaCollegata: string | null;
}

// ── Select style ──────────────────────────────────────────────────────────

const SELECT_CLS =
  'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

// ── Main component ────────────────────────────────────────────────────────

export function CantiereDetailClient({
  cantiere,
  squadra: squadraInit,
  dipendentiDisponibili: dispInit,
  qr: qrInit,
  commesse,
  commessaCollegata,
}: Props) {
  const router = useRouter();
  const confirm = useConfirm();

  // ── Anagrafica state ──
  const [form, setForm] = React.useState({
    nome: cantiere.nome,
    indirizzo: cantiere.indirizzo ?? '',
    sedePartenza: cantiere.sedePartenza ?? '',
    commessaId: cantiere.commessaId ?? '',
    stato: cantiere.stato,
    note: cantiere.note ?? '',
  });
  const [savePending, startSave] = React.useTransition();
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [saveOk, setSaveOk] = React.useState(false);

  // ── Squadra state ──
  const [squadra, setSquadra] = React.useState(squadraInit);
  const [disp, setDisp] = React.useState(dispInit);
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [pickDipId, setPickDipId] = React.useState('');
  const [pickRuolo, setPickRuolo] = React.useState<'capo' | 'membro'>('membro');
  const [squadraError, setSquadraError] = React.useState<string | null>(null);
  const [squadraPending, setSquadraPending] = React.useState<string | null>(null);

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
        sedePartenza: form.sedePartenza || null,
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

  // ── Squadra helpers ──

  function nomeBreve(m: MembroSquadra) {
    return m.nome;
  }

  async function handleRimuovi(dipendenteId: string) {
    setSquadraPending(`${dipendenteId}:remove`);
    setSquadraError(null);
    const res = await rimuoviMembroSquadraCantiere({ cantiereId: cantiere.id, dipendenteId });
    setSquadraPending(null);
    if (!res.ok) { setSquadraError(res.error); return; }
    const rimosso = squadra.find((m) => m.dipendente_id === dipendenteId);
    setSquadra((s) => s.filter((m) => m.dipendente_id !== dipendenteId));
    if (rimosso) {
      setDisp((d) => [...d, { id: rimosso.dipendente_id, nome: rimosso.nome }].sort((a, b) => a.nome.localeCompare(b.nome)));
    }
  }

  async function handleCambioRuolo(dipendenteId: string, nuovoRuolo: 'capo' | 'membro') {
    setSquadraPending(`${dipendenteId}:ruolo`);
    setSquadraError(null);
    const res = await impostaRuoloSquadraCantiere({ cantiereId: cantiere.id, dipendenteId, ruolo: nuovoRuolo });
    setSquadraPending(null);
    if (!res.ok) { setSquadraError(res.error); return; }
    setSquadra((s) =>
      s.map((m) => (m.dipendente_id === dipendenteId ? { ...m, ruolo: nuovoRuolo } : m)),
    );
  }

  async function handleAggiungi() {
    if (!pickDipId) { setSquadraError('Seleziona un dipendente'); return; }
    setSquadraPending(`${pickDipId}:add`);
    setSquadraError(null);
    const res = await aggiungiMembroSquadraCantiere({
      cantiereId: cantiere.id,
      dipendenteId: pickDipId,
      ruolo: pickRuolo,
    });
    setSquadraPending(null);
    if (!res.ok) { setSquadraError(res.error); return; }
    const aggiunto = disp.find((d) => d.id === pickDipId);
    if (aggiunto) {
      setSquadra((s) => [...s, { dipendente_id: aggiunto.id, nome: aggiunto.nome, ruolo: pickRuolo }]);
      setDisp((d) => d.filter((dd) => dd.id !== pickDipId));
    }
    setPickDipId('');
    setPickRuolo('membro');
    setPickerOpen(false);
  }

  // ── QR handlers ──

  function handleGeneraQr() {
    setQrError(null);
    startQr(async () => {
      const res = await generaQrCantiere({ cantiereId: cantiere.id });
      if (!res.ok) { setQrError(res.error); return; }
      setQr({ token: res.token, createdAt: new Date().toISOString(), scansioni: 0 });
      router.refresh();
    });
  }

  async function handleRigeneraQr() {
    const ok = await confirm({
      title: 'Rigenerare il QR?',
      description:
        'Le copie stampate in precedenza smetteranno di funzionare. Sarà necessario ristampare il nuovo QR.',
      confirmLabel: 'Rigenera',
      destructive: true,
    });
    if (!ok) return;
    setQrError(null);
    startQr(async () => {
      const res = await rigeneraQrCantiere({ cantiereId: cantiere.id });
      if (!res.ok) { setQrError(res.error); return; }
      setQr({ token: res.token, createdAt: new Date().toISOString(), scansioni: 0 });
      router.refresh();
    });
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const capi = squadra.filter((m) => m.ruolo === 'capo');
  const membri = squadra.filter((m) => m.ruolo !== 'capo');
  const isAdding = squadraPending?.endsWith(':add') ?? false;

  return (
    <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
      {/* ── Anagrafica ── */}
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
              <Input
                id="indirizzo"
                name="indirizzo"
                value={form.indirizzo}
                onChange={handleChange}
                placeholder="Via Roma 12, Torino"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="sedePartenza">
                Sede di partenza{' '}
                <span className="text-xs text-muted-foreground">(default per questo cantiere)</span>
              </Label>
              <Input
                id="sedePartenza"
                name="sedePartenza"
                value={form.sedePartenza}
                onChange={handleChange}
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
              variant={pickerOpen ? 'default' : 'outline'}
              onClick={() => { setPickerOpen((v) => !v); setSquadraError(null); }}
            >
              <Plus className="h-3.5 w-3.5" />
              {pickerOpen ? 'Chiudi' : 'Aggiungi'}
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
              {/* Capi */}
              {capi.map((m) => (
                <div
                  key={m.dipendente_id}
                  className="rounded-md border border-orange-200/60 bg-orange-50/40 dark:border-orange-900/30 dark:bg-orange-950/20"
                >
                  <div className="flex items-center gap-2 px-2.5 py-1.5">
                    <Crown className="h-3 w-3 shrink-0 text-orange-500" aria-hidden="true" />
                    <span className="flex-1 truncate text-xs font-semibold">{nomeBreve(m)}</span>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        title="Rendi membro"
                        disabled={squadraPending === `${m.dipendente_id}:ruolo`}
                        onClick={() => handleCambioRuolo(m.dipendente_id, 'membro')}
                        className="rounded p-0.5 text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50"
                      >
                        {squadraPending === `${m.dipendente_id}:ruolo` ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <ChevronDown className="h-3 w-3" />
                        )}
                      </button>
                      <button
                        type="button"
                        title="Rimuovi dalla squadra"
                        disabled={squadraPending === `${m.dipendente_id}:remove`}
                        onClick={() => handleRimuovi(m.dipendente_id)}
                        className="rounded p-0.5 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                      >
                        {squadraPending === `${m.dipendente_id}:remove` ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <X className="h-3 w-3" />
                        )}
                      </button>
                    </div>
                  </div>
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
                        <span className="flex-1 truncate text-xs">{nomeBreve(m)}</span>
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            title="Promuovi a capo squadra"
                            disabled={squadraPending === `${m.dipendente_id}:ruolo`}
                            onClick={() => handleCambioRuolo(m.dipendente_id, 'capo')}
                            className="rounded p-0.5 text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50"
                          >
                            {squadraPending === `${m.dipendente_id}:ruolo` ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <ChevronUp className="h-3 w-3" />
                            )}
                          </button>
                          <button
                            type="button"
                            title="Rimuovi dalla squadra"
                            disabled={squadraPending === `${m.dipendente_id}:remove`}
                            onClick={() => handleRimuovi(m.dipendente_id)}
                            className="rounded p-0.5 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                          >
                            {squadraPending === `${m.dipendente_id}:remove` ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <X className="h-3 w-3" />
                            )}
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Picker aggiungi */}
          {pickerOpen && (
            <div className="mt-4 space-y-3 rounded-md border border-border bg-muted/20 p-3">
              <p className="text-xs font-medium">Aggiungi dipendente</p>

              <div>
                <label className="mb-1 block text-[11px] text-muted-foreground">Dipendente</label>
                <select
                  value={pickDipId}
                  onChange={(e) => setPickDipId(e.target.value)}
                  className="block w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                >
                  <option value="">Scegli...</option>
                  {disp.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.nome}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-[11px] text-muted-foreground">Ruolo</label>
                <div className="flex gap-2">
                  {(['membro', 'capo'] as const).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setPickRuolo(r)}
                      className={
                        'flex-1 rounded-md border px-2 py-1.5 text-xs font-medium transition ' +
                        (pickRuolo === r
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border bg-card text-muted-foreground hover:border-primary/40')
                      }
                    >
                      {r === 'capo' ? 'Capo squadra' : 'Membro'}
                    </button>
                  ))}
                </div>
              </div>

              <Button
                type="button"
                size="sm"
                className="w-full"
                disabled={!pickDipId || isAdding}
                onClick={handleAggiungi}
              >
                {isAdding ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                )}
                Aggiungi alla squadra
              </Button>
            </div>
          )}

          {squadraError ? (
            <p role="alert" className="mt-2 text-xs text-destructive">
              {squadraError}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {/* ── QR cantiere ── */}
      <Card className="lg:col-span-2 xl:col-span-1">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <QrCode className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            QR cantiere
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {qr ? (
            <>
              <div className="space-y-1.5 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Generato il</span>
                  <span className="font-medium tabular-nums">{fmtDataOra(qr.createdAt)}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Timbrature totali</span>
                  <span className="font-mono font-medium tabular-nums">{qr.scansioni}</span>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <Button asChild size="sm">
                  <Link href={`/office/kantiere/cantieri/${cantiere.id}/stampa`}>
                    <Printer className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                    Stampa QR
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
                  Rigenera QR
                </Button>
              </div>

              <p className="text-xs text-muted-foreground">
                Rigenerando il QR le copie stampate in precedenza smetteranno di funzionare.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Nessun QR attivo. Genera un QR per permettere ai dipendenti di timbrare entrata e
                uscita da questo cantiere.
              </p>
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
            </>
          )}

          {qrError ? (
            <p role="alert" className="text-xs text-destructive">{qrError}</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
