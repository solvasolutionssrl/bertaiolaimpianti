'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  Camera,
  Check,
  FileText,
  Image as ImageIcon,
  Loader2,
  Mic,
  Save,
  Sparkles,
  Square,
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
} from '@kommessa/ui';

import {
  aggiornaRiunione,
  creaRiunione,
  generaReportRiunione,
  materializzaTodoDaRiunione,
  type TodoProposto,
} from '../../../../../_actions/commessa-riunione';
import { useAlert, useConfirm } from '@/app/_components/confirm-provider';
import { useUploadQueue } from '@/app/_components/upload-queue-provider';
import { VIDEO_MAX_SIZE_BYTES } from '@/app/_lib/upload-queue/types';
import { PdfCameraCapture } from '@/app/_components/pdf-camera-capture';

interface Props {
  commessaId: string;
  contestoCommessa: string;
  tecniciTenant: Array<{ id: string; display_name: string | null }>;
  onClose: () => void;
}

type Step = 'contenuto' | 'report';

interface AttachmentDraft {
  blob: Blob;
  previewUrl: string;
  filename: string;
  mime: string;
  kind: 'foto' | 'video' | 'pdf_acquisito';
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
  const askConfirm = useConfirm();
  const uploadQueue = useUploadQueue();
  const [step, setStep] = React.useState<Step>('contenuto');

  // ─── Step 1: Dati ─────────────────────────────────────────────────
  const today = new Date().toISOString().slice(0, 10);
  const [dataRiunione, setDataRiunione] = React.useState(today);
  const [titolo, setTitolo] = React.useState('');

  // ─── Step 1: Contenuto ────────────────────────────────────────────
  const [corpoLibero, setCorpoLibero] = React.useState('');
  const [trascrizione, setTrascrizione] = React.useState('');
  const [attachments, setAttachments] = React.useState<AttachmentDraft[]>([]);

  // ─── Dettatura ─────────────────────────────────────────────────────
  const [recording, setRecording] = React.useState(false);
  const [transcribing, setTranscribing] = React.useState(false);
  const [recSecs, setRecSecs] = React.useState(0);
  const recorderRef = React.useRef<MediaRecorder | null>(null);
  const chunksRef = React.useRef<BlobPart[]>([]);
  const timerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

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
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        setRecSecs(0);
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
            const j = (await res.json().catch(() => null)) as {
              error?: string;
              detail?: string;
            } | null;
            const msg = j
              ? j.detail
                ? `${j.error ?? 'Errore'} — ${j.detail}`
                : (j.error ?? `HTTP ${res.status}`)
              : `HTTP ${res.status}`;
            throw new Error(msg);
          }
          const j = (await res.json()) as { transcript: string };
          setCorpoLibero((prev) =>
            prev ? `${prev}\n\n${j.transcript}` : j.transcript,
          );
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
      // timeslice=500ms: flush ogni mezzo secondo → robusto su mobile/Safari
      mr.start(500);
      recorderRef.current = mr;
      setRecording(true);
      setRecSecs(0);
      timerRef.current = setInterval(() => setRecSecs((s) => s + 1), 1000);
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
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  // cleanup timer on unmount
  React.useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // ─── Foto ─────────────────────────────────────────────────────────
  const fotoCameraRef = React.useRef<HTMLInputElement | null>(null);
  const fotoGalleryRef = React.useRef<HTMLInputElement | null>(null);
  const onFotoSelected = (files: FileList | null) => {
    if (!files) return;
    const drafts: AttachmentDraft[] = [];
    const oversizedVideo: string[] = [];
    for (const f of Array.from(files)) {
      const isImage = f.type.startsWith('image/');
      const isVideo = f.type.startsWith('video/');
      if (!isImage && !isVideo) continue;
      if (isVideo && f.size > VIDEO_MAX_SIZE_BYTES) {
        oversizedVideo.push(f.name);
        continue;
      }
      drafts.push({
        blob: f,
        previewUrl: URL.createObjectURL(f),
        filename: f.name || (isVideo ? `video-${Date.now()}.mp4` : `foto-${Date.now()}.jpg`),
        mime: f.type || (isVideo ? 'video/mp4' : 'image/jpeg'),
        kind: isVideo ? 'video' : 'foto',
      });
    }
    setAttachments((a) => [...a, ...drafts]);
    if (oversizedVideo.length > 0) {
      void showAlert({
        title: 'Alcuni video sono troppo grandi',
        body: `Limite: 500 MB.\n\nFile esclusi:\n${oversizedVideo.join('\n')}`,
      });
    }
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
        mime: blob.type || 'application/pdf',
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

  const attachmentsRef = React.useRef(attachments);
  React.useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);
  React.useEffect(() => {
    return () => {
      for (const a of attachmentsRef.current) URL.revokeObjectURL(a.previewUrl);
    };
  }, []);

  // ─── Step 2: Report AI ─────────────────────────────────────────────
  const [generating, setGenerating] = React.useState(false);
  const [reportino, setReportino] = React.useState('');
  const [reportModello, setReportModello] = React.useState('');
  const [todosConferma, setTodosConferma] = React.useState<TodoConferma[]>([]);

  const generaReport = async () => {
    setGenerating(true);
    const fotoN = attachments.filter((a) => a.kind === 'foto').length;
    const pdfN = attachments.filter((a) => a.kind === 'pdf_acquisito').length;
    const res = await generaReportRiunione({
      corpoLibero,
      trascrizione,
      contestoCommessa,
      fotoCount: fotoN,
      pdfCount: pdfN,
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

  // ─── Step 3: Salva ─────────────────────────────────────────────────
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

      if (reportino.trim()) {
        await aggiornaRiunione({
          id: riunioneId,
          reportino: reportino.trim(),
          reportinoModello: reportModello || null,
        });
      }

      // Allegati: NON più bloccanti. Vanno nella UploadQueue globale che
      // li carica su R2 (staging) e il server crea il link
      // commessa_riunione_allegato al complete. Il dialog si chiude subito,
      // l'utente vede il progress nel tray in basso a destra e gli allegati
      // appaiono nell'espansione della riunione man mano che si caricano.
      for (const a of attachments) {
        uploadQueue.enqueue({
          fileBlob: a.blob,
          fileName: a.filename,
          fileMime: a.mime,
          fileSize: a.blob.size,
          commessaId,
          riunioneId,
          kind: a.kind,
        });
      }

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

  const hasTextContent =
    corpoLibero.trim().length > 0 || trascrizione.trim().length > 0;
  const hasContent = hasTextContent || attachments.length > 0;

  const handleClose = async () => {
    const hasUnsavedAI = reportino.trim().length > 0;
    if (hasUnsavedAI || hasContent) {
      const ok = await askConfirm({
        title: 'Chiudere senza salvare?',
        description: hasUnsavedAI
          ? 'Il reportino AI generato e gli eventuali TODO proposti verranno persi.'
          : 'Perderai il contenuto inserito.',
        destructive: true,
        confirmLabel: 'Chiudi e perdi',
      });
      if (!ok) return;
    }
    onClose();
  };

  // ─── render ───────────────────────────────────────────────────────
  return (
    <Dialog open onOpenChange={(o) => !o && void handleClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-primary" />
            Nuova riunione
          </DialogTitle>
        </DialogHeader>

        <StepIndicator step={step} />

        {/* ─── STEP 1 — CONTENUTO ──────────────────────────────── */}
        {step === 'contenuto' ? (
          <div className="space-y-3">
            {/* Data + Titolo */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="r_data" className="text-xs text-muted-foreground">Data</Label>
                <Input
                  id="r_data"
                  type="date"
                  value={dataRiunione}
                  onChange={(e) => setDataRiunione(e.target.value)}
                  className="mt-1 h-8"
                />
              </div>
              <div>
                <Label htmlFor="r_tit" className="text-xs text-muted-foreground">
                  Titolo <span className="font-normal opacity-60">(opzionale)</span>
                </Label>
                <Input
                  id="r_tit"
                  value={titolo}
                  onChange={(e) => setTitolo(e.target.value)}
                  placeholder="Es. Sopralluogo, Allineamento…"
                  className="mt-1 h-8"
                />
              </div>
            </div>

            {/* Contenuto con dettatura */}
            <div>
              <div className="mb-1 flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Contenuto</Label>
                <RecordingButton
                  recording={recording}
                  transcribing={transcribing}
                  recSecs={recSecs}
                  onStart={startRec}
                  onStop={stopRec}
                />
              </div>

              {recording ? (
                <div className="mb-1.5 flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-1.5 text-xs text-destructive">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-destructive" />
                  <span className="font-medium">Registrazione — {fmtSecs(recSecs)}</span>
                  <span className="ml-auto text-destructive/60">Premi «Ferma» quando hai finito</span>
                </div>
              ) : null}

              {transcribing ? (
                <div className="mb-1.5 flex items-center gap-2 rounded-md border border-primary/20 bg-primary/5 px-2.5 py-1.5 text-xs text-primary">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Trascrizione in corso…
                </div>
              ) : null}

              <textarea
                value={corpoLibero}
                onChange={(e) => setCorpoLibero(e.target.value)}
                rows={6}
                placeholder="Punti discussi, decisioni, cose da fare… oppure premi «Vocale» per dettare."
                className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm leading-relaxed placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring"
              />
              {corpoLibero.length > 0 ? (
                <p className="mt-0.5 text-right text-[10px] text-muted-foreground">
                  {corpoLibero.length} car.
                </p>
              ) : null}
            </div>

            {/* Allegati */}
            <div>
              <Label className="mb-1.5 block text-xs text-muted-foreground">Allegati</Label>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={fotoCameraRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  multiple
                  onChange={(e) => {
                    onFotoSelected(e.target.files);
                    e.target.value = '';
                  }}
                  className="hidden"
                />
                <input
                  ref={fotoGalleryRef}
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  onChange={(e) => {
                    onFotoSelected(e.target.files);
                    e.target.value = '';
                  }}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fotoCameraRef.current?.click()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted transition-colors"
                >
                  <Camera className="h-4 w-4" />
                  + Scatta
                </button>
                <button
                  type="button"
                  onClick={() => fotoGalleryRef.current?.click()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted transition-colors"
                >
                  <ImageIcon className="h-4 w-4" />
                  + Foto / video
                </button>
                <button
                  type="button"
                  onClick={() => setPdfCaptureOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted transition-colors"
                >
                  <FileText className="h-4 w-4" />
                  + File
                </button>
              </div>
              {attachments.length > 0 ? (
                <ul className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-5">
                  {attachments.map((a, idx) => (
                    <li
                      key={idx}
                      className="relative overflow-hidden rounded-md border border-border bg-muted/20"
                    >
                      {a.kind === 'foto' ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={a.previewUrl}
                          alt={a.filename}
                          className="aspect-square w-full object-cover"
                        />
                      ) : a.kind === 'video' ? (
                        <div className="relative aspect-square w-full bg-black">
                          <video
                            src={a.previewUrl}
                            preload="metadata"
                            muted
                            playsInline
                            className="h-full w-full object-cover"
                          />
                          <span className="absolute bottom-1 left-1 rounded-full bg-black/70 px-1.5 py-px font-mono text-[9px] font-bold text-white">
                            ▶ VIDEO
                          </span>
                        </div>
                      ) : (
                        <div className="flex aspect-square w-full flex-col items-center justify-center gap-1 text-xs text-muted-foreground">
                          <FileText className="h-6 w-6" />
                          <span className="font-mono text-[10px]">PDF</span>
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => removeAttachment(idx)}
                        className="absolute right-1 top-1 rounded-full bg-background/90 p-0.5 text-muted-foreground hover:text-destructive"
                        aria-label="Rimuovi"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>
        ) : null}

        {/* ─── STEP 2 — REPORT ─────────────────────────────────── */}
        {step === 'report' ? (
          <div className="space-y-3">
            <div>
              <div className="mb-1 flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Reportino generato</Label>
                {reportModello ? (
                  <span className="text-[10px] text-muted-foreground">{reportModello}</span>
                ) : null}
              </div>
              <textarea
                value={reportino}
                onChange={(e) => setReportino(e.target.value)}
                rows={7}
                className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                Puoi modificare il testo prima di salvare.
              </p>
            </div>

            {todosConferma.length > 0 ? (
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">TODO proposti</Label>
                  <span className="text-[10px] text-muted-foreground">
                    {todosConferma.filter((t) => t.selezionato).length}/{todosConferma.length} selezionati
                  </span>
                </div>
                <ul className="space-y-1.5">
                  {todosConferma.map((t, i) => (
                    <li
                      key={i}
                      className={cn(
                        'rounded-md border px-3 py-2 transition-colors',
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
                          className="mt-0.5"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="flex-1 text-sm font-medium">{t.titolo}</p>
                            <Badge
                              variant="outline"
                              className={cn('text-[10px] uppercase', PRIORITA_CHIP[t.priorita])}
                            >
                              {t.priorita}
                            </Badge>
                          </div>
                          {t.note ? (
                            <p className="mt-0.5 text-xs text-muted-foreground">{t.note}</p>
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
              <p className="rounded-md border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                Nessun TODO automatico estratto. Puoi crearne a mano dopo aver salvato la riunione.
              </p>
            )}
          </div>
        ) : null}

        {/* ─── FOOTER ──────────────────────────────────────────────── */}
        <DialogFooter className="mt-1 flex-col gap-2 sm:flex-row sm:gap-2">
          {step === 'contenuto' ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void handleClose()}
                className="sm:mr-auto"
              >
                Annulla
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={submit}
                disabled={submitting || !hasContent}
              >
                {submitting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                Salva senza AI
              </Button>
              <Button
                size="sm"
                onClick={generaReport}
                disabled={generating || !hasTextContent}
                title={!hasTextContent ? 'Scrivi o detta del contenuto per usare il report AI' : undefined}
              >
                {generating ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                {generating ? 'Generazione…' : 'Genera report AI'}
              </Button>
            </>
          ) : null}
          {step === 'report' ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setStep('contenuto')}
                disabled={submitting}
                className="sm:mr-auto"
              >
                ← Indietro
              </Button>
              <Button size="sm" onClick={submit} disabled={submitting}>
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
    { key: 'contenuto', label: 'Contenuto' },
    { key: 'report', label: 'Report AI' },
  ];
  const idx = steps.findIndex((s) => s.key === step);
  return (
    <div className="-mt-1 mb-3 flex items-center gap-1">
      {steps.map((s, i) => (
        <React.Fragment key={s.key}>
          <div
            className={cn(
              'flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors',
              i === idx
                ? 'bg-primary text-primary-foreground'
                : i < idx
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground',
            )}
          >
            <span
              className={cn(
                'flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold',
                i < idx
                  ? 'bg-primary/30'
                  : i === idx
                    ? 'bg-white/20'
                    : 'border border-muted-foreground/30',
              )}
            >
              {i < idx ? <Check className="h-2.5 w-2.5" /> : i + 1}
            </span>
            {s.label}
          </div>
          {i < steps.length - 1 ? (
            <div
              className={cn(
                'h-px flex-1 transition-colors',
                i < idx ? 'bg-primary/30' : 'bg-border',
              )}
            />
          ) : null}
        </React.Fragment>
      ))}
    </div>
  );
}

// ────────────────────────────────────────────────────────────

interface RecordingButtonProps {
  recording: boolean;
  transcribing: boolean;
  recSecs: number;
  onStart: () => void;
  onStop: () => void;
}

function RecordingButton({
  recording,
  transcribing,
  recSecs,
  onStart,
  onStop,
}: RecordingButtonProps) {
  if (transcribing) {
    return (
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Trascrizione…
      </span>
    );
  }
  if (recording) {
    return (
      <button
        type="button"
        onClick={onStop}
        className="inline-flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-2 text-sm font-semibold text-destructive hover:bg-destructive/15 transition-colors"
      >
        <Square className="h-4 w-4 fill-current" />
        Ferma · {fmtSecs(recSecs)}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onStart}
      className="inline-flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/5 px-4 py-2 text-sm font-semibold text-primary hover:bg-primary/10 transition-colors"
    >
      <Mic className="h-4 w-4" />
      Vocale
    </button>
  );
}

// ────────────────────────────────────────────────────────────
// utils

function fmtSecs(s: number): string {
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${rem.toString().padStart(2, '0')}`;
}

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
  const m = (b.type || '').toLowerCase();
  if (m.includes('mp4') || m.includes('m4a')) return 'm4a';
  if (m.includes('ogg')) return 'ogg';
  if (m.includes('wav')) return 'wav';
  return 'webm';
}
