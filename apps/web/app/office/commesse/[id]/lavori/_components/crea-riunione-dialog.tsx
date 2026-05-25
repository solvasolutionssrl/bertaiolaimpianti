'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  FileText,
  Image as ImageIcon,
  Loader2,
  Mic,
  PencilLine,
  Save,
  Sparkles,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  cn,
} from '@impiantixplus/ui';

import {
  aggiungiAllegatoRiunione,
  aggiornaRiunione,
  creaRiunione,
  generaReportRiunione,
  materializzaTodoDaRiunione,
  type TodoProposto,
} from '../../../../../_actions/commessa-riunione';
import { useAlert } from '@/app/_components/confirm-provider';
import { PdfCameraCapture } from '@/app/_components/pdf-camera-capture';

interface Props {
  commessaId: string;
  contestoCommessa: string;
  tecniciTenant: Array<{ id: string; display_name: string | null }>;
  onClose: () => void;
}

type Step = 'dati' | 'contenuto' | 'report' | 'salva';

interface AttachmentDraft {
  /** Blob locale del file da uploadare al submit. */
  blob: Blob;
  /** Anteprima URL.createObjectURL (revoke al cleanup). */
  previewUrl: string;
  /** Nome file proposto. */
  filename: string;
  /** Tipo logico. */
  kind: 'foto' | 'pdf_acquisito';
}

interface TodoConferma extends TodoProposto {
  selezionato: boolean;
  assegnatoA?: string | null;
}

const PRIORITA_CHIP: Record<TodoProposto['priorita'], string> = {
  bassa: 'bg-muted text-muted-foreground',
  media: 'bg-blue-500/15 text-blue-700 dark:text-blue-400',
  alta: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  urgente: 'bg-red-500/15 text-red-700 dark:text-red-400',
};

export function CreaRiunioneDialog({
  commessaId,
  contestoCommessa,
  tecniciTenant,
  onClose,
}: Props) {
  const router = useRouter();
  const showAlert = useAlert();
  const [step, setStep] = React.useState<Step>('dati');

  // ─── Step 1: Dati ─────────────────────────────────────────────────
  const today = new Date().toISOString().slice(0, 10);
  const [dataRiunione, setDataRiunione] = React.useState(today);
  const [titolo, setTitolo] = React.useState('');

  // ─── Step 2: Contenuto ────────────────────────────────────────────
  type ContentTab = 'scrivi' | 'detta' | 'foto' | 'pdf';
  const [tab, setTab] = React.useState<ContentTab>('scrivi');
  const [corpoLibero, setCorpoLibero] = React.useState('');
  const [trascrizione, setTrascrizione] = React.useState('');
  const [attachments, setAttachments] = React.useState<AttachmentDraft[]>([]);

  // ─── Dettatura ─────────────────────────────────────────────────────
  const [recording, setRecording] = React.useState(false);
  const [transcribing, setTranscribing] = React.useState(false);
  const recorderRef = React.useRef<MediaRecorder | null>(null);
  const chunksRef = React.useRef<BlobPart[]>([]);

  const startRec = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: pickAudioMime() });
      chunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: mr.mimeType });
        if (blob.size === 0) return;
        setTranscribing(true);
        try {
          const fd = new FormData();
          fd.append('audio', blob, `riunione.${blobExt(blob)}`);
          fd.append('mode', 'transcript-only');
          const res = await fetch('/api/voice/extract', {
            method: 'POST',
            body: fd,
          });
          if (!res.ok) {
            const j = await res.json().catch(() => null);
            throw new Error(j?.error ?? `HTTP ${res.status}`);
          }
          const j = (await res.json()) as { transcript: string };
          setTrascrizione((prev) =>
            prev ? `${prev}\n\n${j.transcript}` : j.transcript,
          );
        } catch (e) {
          await showAlert({
            title: 'Trascrizione fallita',
            body: e instanceof Error ? e.message : 'Riprova',
          });
        } finally {
          setTranscribing(false);
        }
      };
      mr.start();
      recorderRef.current = mr;
      setRecording(true);
    } catch (e) {
      await showAlert({
        title: 'Microfono non disponibile',
        body: e instanceof Error ? e.message : 'Permessi negati?',
      });
    }
  };
  const stopRec = () => {
    recorderRef.current?.stop();
    setRecording(false);
  };

  // ─── Foto: input file ──────────────────────────────────────────────
  const fotoInputRef = React.useRef<HTMLInputElement | null>(null);
  const onFotoSelected = (files: FileList | null) => {
    if (!files) return;
    const drafts: AttachmentDraft[] = [];
    for (const f of Array.from(files)) {
      if (!f.type.startsWith('image/')) continue;
      drafts.push({
        blob: f,
        previewUrl: URL.createObjectURL(f),
        filename: f.name || `foto-${Date.now()}.jpg`,
        kind: 'foto',
      });
    }
    setAttachments((a) => [...a, ...drafts]);
  };

  // ─── PDF camera capture ───────────────────────────────────────────
  const [pdfCaptureOpen, setPdfCaptureOpen] = React.useState(false);
  const onPdfReady = (blob: Blob, filename: string) => {
    setAttachments((a) => [
      ...a,
      {
        blob,
        previewUrl: URL.createObjectURL(blob),
        filename,
        kind: 'pdf_acquisito',
      },
    ]);
    setPdfCaptureOpen(false);
  };

  const removeAttachment = (idx: number) => {
    setAttachments((a) => {
      const next = [...a];
      const [removed] = next.splice(idx, 1);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return next;
    });
  };

  // cleanup previewUrl al unmount
  React.useEffect(() => {
    return () => {
      for (const a of attachments) URL.revokeObjectURL(a.previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Step 3: Report AI ─────────────────────────────────────────────
  const [generating, setGenerating] = React.useState(false);
  const [reportino, setReportino] = React.useState('');
  const [reportModello, setReportModello] = React.useState('');
  const [todosConferma, setTodosConferma] = React.useState<TodoConferma[]>([]);

  const generaReport = async () => {
    setGenerating(true);
    const res = await generaReportRiunione({
      corpoLibero,
      trascrizione,
      contestoCommessa,
    });
    setGenerating(false);
    if (!res.ok) {
      await showAlert({ title: 'Errore generazione', body: res.error });
      return;
    }
    setReportino(res.data.reportino);
    setReportModello(res.data.modello);
    setTodosConferma(
      res.data.todo_proposti.map((t) => ({
        ...t,
        selezionato: true,
        assegnatoA: null,
      })),
    );
    setStep('report');
  };

  // ─── Step 4: Salva ─────────────────────────────────────────────────
  const [submitting, setSubmitting] = React.useState(false);

  const submit = async () => {
    setSubmitting(true);
    try {
      const created = await creaRiunione({
        commessaId,
        dataRiunione,
        titolo: titolo.trim() || undefined,
        corpoLibero: corpoLibero.trim() || undefined,
        trascrizione: trascrizione.trim() || undefined,
      });
      if (!created.ok) throw new Error(created.error);
      const riunioneId = created.data.id;

      // Salva reportino se presente
      if (reportino.trim()) {
        await aggiornaRiunione({
          id: riunioneId,
          reportino: reportino.trim(),
          reportinoModello: reportModello || null,
        });
      }

      // Upload allegati
      for (const a of attachments) {
        try {
          const fd = new FormData();
          fd.append('file', a.blob, a.filename);
          const headers: Record<string, string> = {
            'x-file-size': String(a.blob.size),
          };
          const url = `/api/upload/media?commessaId=${commessaId}&momento=sopralluogo`;
          const upRes = await fetch(url, {
            method: 'POST',
            headers,
            body: fd,
          });
          if (!upRes.ok) {
            console.warn('upload allegato riunione fallito', a.filename);
            continue;
          }
          const j = (await upRes.json()) as { ok: boolean; fileRefId?: string };
          if (j.fileRefId) {
            await aggiungiAllegatoRiunione({
              riunioneId,
              fileRefId: j.fileRefId,
              kind: a.kind,
            });
          }
        } catch (e) {
          console.warn('upload riunione exception', e);
        }
      }

      // Materializza TODO selezionati
      const selezionati = todosConferma.filter((t) => t.selezionato);
      if (selezionati.length > 0) {
        await materializzaTodoDaRiunione({
          commessaId,
          riunioneId,
          todos: selezionati.map((t) => ({
            titolo: t.titolo,
            priorita: t.priorita,
            note: t.note,
            assegnatoA: t.assegnatoA ?? null,
          })),
        });
      }

      router.refresh();
      onClose();
    } catch (e) {
      await showAlert({
        title: 'Errore',
        body: e instanceof Error ? e.message : 'Salvataggio fallito',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const hasContent =
    corpoLibero.trim().length > 0 ||
    trascrizione.trim().length > 0 ||
    attachments.length > 0;

  // ─── render ───────────────────────────────────────────────────────
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Nuova riunione
          </DialogTitle>
        </DialogHeader>

        {/* Step indicator */}
        <StepIndicator step={step} />

        {/* ─── STEP 1 — DATI ──────────────────────────────────────── */}
        {step === 'dati' ? (
          <div className="space-y-4">
            <div>
              <Label htmlFor="r_data">Data della riunione</Label>
              <Input
                id="r_data"
                type="date"
                value={dataRiunione}
                onChange={(e) => setDataRiunione(e.target.value)}
                className="mt-1.5 h-10"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Default: oggi. Cambia se stai verbalizzando una riunione di
                un'altra data.
              </p>
            </div>
            <div>
              <Label htmlFor="r_tit">Titolo (opzionale)</Label>
              <Input
                id="r_tit"
                value={titolo}
                onChange={(e) => setTitolo(e.target.value)}
                placeholder="Es. Sopralluogo prima posa, Allineamento col cliente…"
                className="mt-1.5 h-10"
              />
            </div>
          </div>
        ) : null}

        {/* ─── STEP 2 — CONTENUTO ─────────────────────────────────── */}
        {step === 'contenuto' ? (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Aggiungi il contenuto della riunione: puoi combinare più modalità
              (scrivere + dettare + foto + PDF). Il sistema farà il riassunto
              alla fine.
            </p>

            {/* Tabs */}
            <div className="flex gap-1 rounded-md bg-muted/40 p-1">
              {(
                [
                  ['scrivi', 'Scrivi', PencilLine],
                  ['detta', 'Detta', Mic],
                  ['foto', 'Foto', ImageIcon],
                  ['pdf', 'Acquisisci PDF', FileText],
                ] as const
              ).map(([k, l, Icon]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setTab(k)}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-1.5 rounded px-3 py-1.5 text-xs transition-colors',
                    tab === k
                      ? 'bg-card font-medium shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {l}
                </button>
              ))}
            </div>

            {/* Contenuto tab */}
            {tab === 'scrivi' ? (
              <textarea
                value={corpoLibero}
                onChange={(e) => setCorpoLibero(e.target.value)}
                rows={10}
                placeholder="Scrivi un riepilogo della riunione, i punti principali, le decisioni prese, le cose da fare…"
                className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            ) : null}

            {tab === 'detta' ? (
              <div className="space-y-3 rounded-md border border-border bg-muted/30 p-4">
                <div className="flex items-center gap-3">
                  {!recording ? (
                    <Button
                      type="button"
                      onClick={startRec}
                      disabled={transcribing}
                    >
                      <Mic className="h-4 w-4" />
                      Avvia registrazione
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={stopRec}
                      className="border-destructive text-destructive"
                    >
                      <Square className="h-4 w-4 fill-current" />
                      Ferma e trascrivi
                    </Button>
                  )}
                  {transcribing ? (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Trascrizione in corso…
                    </span>
                  ) : null}
                  {recording ? (
                    <span className="flex items-center gap-1 text-xs">
                      <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
                      Recording…
                    </span>
                  ) : null}
                </div>
                <textarea
                  value={trascrizione}
                  onChange={(e) => setTrascrizione(e.target.value)}
                  rows={8}
                  placeholder="La trascrizione apparirà qui. Puoi anche correggerla a mano."
                  className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
                <p className="text-[11px] text-muted-foreground">
                  Suggerimento: registra più clip separate per spezzare la
                  riunione (verranno concatenate sotto).
                </p>
              </div>
            ) : null}

            {tab === 'foto' ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <input
                    ref={fotoInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    multiple
                    onChange={(e) => onFotoSelected(e.target.files)}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => fotoInputRef.current?.click()}
                  >
                    <Camera className="h-4 w-4" />
                    Aggiungi foto
                  </Button>
                  <p className="text-[11px] text-muted-foreground">
                    Camera (mobile) o galleria.
                  </p>
                </div>
                <AttachmentsGrid
                  attachments={attachments.filter((a) => a.kind === 'foto')}
                  onRemove={(idx) => {
                    const real = attachments.findIndex(
                      (a, i) =>
                        a.kind === 'foto' &&
                        attachments.filter((b, j) => b.kind === 'foto' && j <= i)
                          .length -
                          1 ===
                          idx,
                    );
                    if (real >= 0) removeAttachment(real);
                  }}
                />
              </div>
            ) : null}

            {tab === 'pdf' ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setPdfCaptureOpen(true)}
                  >
                    <FileText className="h-4 w-4" />
                    Acquisisci foglio
                  </Button>
                  <p className="text-[11px] text-muted-foreground">
                    Apre fotocamera, rileva i bordi del foglio e produce un PDF
                    single-page.
                  </p>
                </div>
                <AttachmentsGrid
                  attachments={attachments.filter(
                    (a) => a.kind === 'pdf_acquisito',
                  )}
                  onRemove={(idx) => {
                    const real = attachments.findIndex(
                      (a, i) =>
                        a.kind === 'pdf_acquisito' &&
                        attachments.filter(
                          (b, j) => b.kind === 'pdf_acquisito' && j <= i,
                        ).length -
                          1 ===
                          idx,
                    );
                    if (real >= 0) removeAttachment(real);
                  }}
                />
              </div>
            ) : null}

            <div className="rounded-md bg-muted/40 p-2 text-[11px] text-muted-foreground">
              <strong>Contenuto totale:</strong>{' '}
              {corpoLibero.length + trascrizione.length} caratteri ·{' '}
              {attachments.length} allegati
            </div>
          </div>
        ) : null}

        {/* ─── STEP 3 — REPORT ────────────────────────────────────── */}
        {step === 'report' ? (
          <div className="space-y-3">
            <div>
              <Label>Reportino generato</Label>
              <textarea
                value={reportino}
                onChange={(e) => setReportino(e.target.value)}
                rows={8}
                className="mt-1.5 w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
              {reportModello ? (
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Modello: <code>{reportModello}</code> · Puoi modificare il
                  testo prima di salvare.
                </p>
              ) : null}
            </div>

            {todosConferma.length > 0 ? (
              <div>
                <Label className="mb-2 flex items-center justify-between">
                  <span>TODO proposti dal report</span>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {todosConferma.filter((t) => t.selezionato).length} di{' '}
                    {todosConferma.length} selezionati
                  </span>
                </Label>
                <ul className="space-y-2">
                  {todosConferma.map((t, i) => (
                    <li
                      key={i}
                      className={cn(
                        'rounded-md border p-3 transition-colors',
                        t.selezionato
                          ? 'border-primary/40 bg-primary/5'
                          : 'border-border bg-card opacity-60',
                      )}
                    >
                      <div className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          checked={t.selezionato}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setTodosConferma((arr) =>
                              arr.map((x, idx) =>
                                idx === i ? { ...x, selezionato: checked } : x,
                              ),
                            );
                          }}
                          className="mt-1"
                        />
                        <div className="flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="flex-1 text-sm font-medium">
                              {t.titolo}
                            </p>
                            <Badge
                              variant="outline"
                              className={cn(
                                'text-[10px] uppercase',
                                PRIORITA_CHIP[t.priorita],
                              )}
                            >
                              {t.priorita}
                            </Badge>
                          </div>
                          {t.note ? (
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {t.note}
                            </p>
                          ) : null}
                          <div className="mt-1.5">
                            <select
                              value={t.assegnatoA ?? ''}
                              onChange={(e) => {
                                const v = e.target.value || null;
                                setTodosConferma((arr) =>
                                  arr.map((x, idx) =>
                                    idx === i ? { ...x, assegnatoA: v } : x,
                                  ),
                                );
                              }}
                              disabled={!t.selezionato}
                              className="h-7 rounded-md border border-border bg-background px-2 text-xs disabled:opacity-50"
                            >
                              <option value="">Non assegnato</option>
                              {tecniciTenant.map((u) => (
                                <option key={u.id} value={u.id}>
                                  Assegna a {u.display_name ?? u.id.slice(0, 8)}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Il report non ha proposto TODO automatici. Puoi sempre crearli a
                mano dopo aver salvato la riunione.
              </p>
            )}
          </div>
        ) : null}

        {/* ─── FOOTER ──────────────────────────────────────────────── */}
        <DialogFooter className="gap-2 sm:gap-2">
          {step === 'dati' ? (
            <>
              <Button variant="outline" onClick={onClose}>
                Annulla
              </Button>
              <Button onClick={() => setStep('contenuto')} disabled={!dataRiunione}>
                Avanti
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </>
          ) : null}
          {step === 'contenuto' ? (
            <>
              <Button variant="outline" onClick={() => setStep('dati')}>
                <ArrowLeft className="h-3.5 w-3.5" />
                Indietro
              </Button>
              <Button variant="outline" onClick={submit} disabled={submitting || !hasContent}>
                {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Salva senza AI
              </Button>
              <Button onClick={generaReport} disabled={generating || !hasContent}>
                {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                Genera report AI
              </Button>
            </>
          ) : null}
          {step === 'report' ? (
            <>
              <Button variant="outline" onClick={() => setStep('contenuto')} disabled={submitting}>
                <ArrowLeft className="h-3.5 w-3.5" />
                Indietro
              </Button>
              <Button onClick={submit} disabled={submitting}>
                {submitting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
                Salva riunione
                {todosConferma.filter((t) => t.selezionato).length > 0
                  ? ` + ${todosConferma.filter((t) => t.selezionato).length} TODO`
                  : ''}
              </Button>
            </>
          ) : null}
        </DialogFooter>

        {pdfCaptureOpen ? (
          <PdfCameraCapture
            onCancel={() => setPdfCaptureOpen(false)}
            onReady={onPdfReady}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

// ────────────────────────────────────────────────────────────

function StepIndicator({ step }: { step: Step }) {
  const steps: Array<{ key: Step; label: string }> = [
    { key: 'dati', label: 'Data' },
    { key: 'contenuto', label: 'Contenuto' },
    { key: 'report', label: 'Report' },
  ];
  const idx = steps.findIndex((s) => s.key === step);
  return (
    <div className="-mt-2 mb-3 flex items-center gap-2 text-[11px] uppercase tracking-wider">
      {steps.map((s, i) => (
        <React.Fragment key={s.key}>
          <span
            className={cn(
              'flex items-center gap-1.5',
              i <= idx ? 'text-primary' : 'text-muted-foreground',
            )}
          >
            <span
              className={cn(
                'flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold',
                i < idx
                  ? 'bg-primary text-primary-foreground'
                  : i === idx
                    ? 'border-2 border-primary'
                    : 'border border-muted-foreground/30',
              )}
            >
              {i < idx ? <Check className="h-2.5 w-2.5" /> : i + 1}
            </span>
            {s.label}
          </span>
          {i < steps.length - 1 ? (
            <span className="text-muted-foreground/30">·</span>
          ) : null}
        </React.Fragment>
      ))}
    </div>
  );
}

function AttachmentsGrid({
  attachments,
  onRemove,
}: {
  attachments: AttachmentDraft[];
  onRemove: (idx: number) => void;
}) {
  if (attachments.length === 0)
    return (
      <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
        Nessun allegato.
      </p>
    );
  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {attachments.map((a, i) => (
        <li key={i} className="relative overflow-hidden rounded-md border border-border bg-muted/20">
          {a.kind === 'foto' ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={a.previewUrl} alt={a.filename} className="aspect-square w-full object-cover" />
          ) : (
            <div className="flex aspect-square w-full flex-col items-center justify-center gap-1 text-xs text-muted-foreground">
              <FileText className="h-7 w-7" />
              <span className="font-mono">PDF</span>
            </div>
          )}
          <button
            type="button"
            onClick={() => onRemove(i)}
            className="absolute right-1 top-1 rounded-full bg-background/90 p-1 text-muted-foreground hover:text-destructive"
            aria-label="Rimuovi"
          >
            <X className="h-3 w-3" />
          </button>
          <p className="truncate px-1.5 py-1 text-[10px] text-muted-foreground">
            {a.filename}
          </p>
        </li>
      ))}
    </ul>
  );
}

// ────────────────────────────────────────────────────────────
// utils audio

function pickAudioMime(): string {
  if (typeof MediaRecorder === 'undefined') return 'audio/webm';
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg',
  ];
  for (const m of candidates) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return 'audio/webm';
}
function blobExt(b: Blob): string {
  if (b.type.includes('mp4')) return 'mp4';
  if (b.type.includes('ogg')) return 'ogg';
  return 'webm';
}
