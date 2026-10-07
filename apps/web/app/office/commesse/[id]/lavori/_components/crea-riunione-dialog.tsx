'use client';

import * as React from 'react';

import {
  DURATA_MINIMA_MS,
  AVVISO_TROPPO_BREVE,
  AVVISO_NIENTE_DA_CAPIRE,
} from '@/app/_lib/registrazione';
import { useRouter } from 'next/navigation';
import {
  Calendar,
  Camera,
  Check,
  FileText,
  Image as ImageIcon,
  Loader2,
  Mic,
  Save,
  ScanLine,
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
import { useLimitiUpload } from '@/app/_components/limiti-upload-provider';
import { PdfCameraCapture } from '@/app/_components/pdf-camera-capture';
import { PrioritaChip } from '@/app/_components/priorita-ui';

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
  // Il limite dei video lo decide il pannello super admin (globale o per
  // tenant), non una costante: stesso valore che usa il selettore media.
  const { maxVideoMb } = useLimitiUpload();
  const maxVideoBytes = maxVideoMb * 1024 * 1024;
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
  /**
   * L'avviso calmo, in linea, sotto il microfono.
   *
   * ⚠️ Non un popup. Quando la registrazione e' troppo breve o non si e'
   * capito niente non si e' rotto nulla: basta riparlare. Un dialog di errore
   * su un gesto da rifare insegna a temere il tasto.
   */
  const [avvisoVoce, setAvvisoVoce] = React.useState<string | null>(null);
  const recorderRef = React.useRef<MediaRecorder | null>(null);
  const chunksRef = React.useRef<BlobPart[]>([]);
  const timerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  /** Quando e' partita: serve a sapere se e' durata abbastanza. */
  const iniziataRef = React.useRef<number>(0);
  /** Se e' stata scartata perche' breve, `onstop` non deve mandare niente. */
  const scartaRef = React.useRef(false);

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
        if (scartaRef.current) {
          scartaRef.current = false;
          return; // troppo breve: l'avviso l'ha gia' messo `stopRec`
        }
        const blob = new Blob(chunksRef.current, { type: mr.mimeType });
        if (blob.size === 0) {
          // ⚠️ Prima qui c'era un `return` muto: il tasto tornava come prima e
          // non compariva nessun testo. «Ho premuto e non e' successo niente»
          // e' un guasto peggiore di un errore, perche' non si sa cosa fare.
          setAvvisoVoce(AVVISO_TROPPO_BREVE);
          return;
        }
        setTranscribing(true);
        try {
          const fd = new FormData();
          fd.append('audio', blob, `riunione.${blobExt(blob)}`);
          fd.append('mode', 'transcript-only');
          const res = await fetch('/api/voice/extract', {
            method: 'POST',
            body: fd,
          });
          // ⚠️ 422 = «l'audio c'era, testo riconosciuto: nessuno». Capita con un
          // sussurro, col rumore di un cantiere, o con tre secondi di esitazione.
          // Non e' un guasto dell'app e non merita un popup: avviso in linea e
          // tasto subito ripremibile. Prima diventava «Trascrizione fallita».
          if (res.status === 422) {
            setAvvisoVoce(AVVISO_NIENTE_DA_CAPIRE);
            return;
          }
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
      setAvvisoVoce(null);
      iniziataRef.current = Date.now();
      scartaRef.current = false;
      timerRef.current = setInterval(() => setRecSecs((s) => s + 1), 1000);
    } catch (e) {
      await showAlert({
        title: 'Microfono non disponibile',
        body: e instanceof Error ? e.message : 'Permessi negati?',
      });
    }
  };

  const stopRec = () => {
    // ⚠️ La soglia dei tre secondi. Gli altri cinque punti dell'app che
    // registrano ce l'hanno da agosto, dentro `VoiceRecorder`; questo dialog
    // ha un registratore proprio e non l'aveva: mezzo secondo di audio
    // arrivava all'AI, tornava vuoto e diventava il popup «Trascrizione
    // fallita». La regola ora sta in `@/app/_lib/registrazione`, un posto
    // solo per tutti e due.
    if (Date.now() - iniziataRef.current < DURATA_MINIMA_MS) {
      scartaRef.current = true;
      setAvvisoVoce(AVVISO_TROPPO_BREVE);
    }
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
      if (isVideo && f.size > maxVideoBytes) {
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
        body: `Limite: ${maxVideoMb} MB.\n\nFile esclusi:\n${oversizedVideo.join('\n')}`,
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
        // ⚠️ L'esito si guarda. Prima no, e quando questa chiamata falliva la
        // riunione si salvava lo stesso, senza il riassunto e senza che
        // nessuno lo dicesse: il lavoro dell'AI spariva in silenzio. È
        // successo davvero, su due riunioni vere.
        const conRiassunto = await aggiornaRiunione({
          id: riunioneId,
          reportino: reportino.trim(),
          reportinoModello: reportModello || null,
        });
        if (!conRiassunto.ok) {
          throw new Error(`Riunione salvata, ma il riassunto no: ${conRiassunto.error}`);
        }
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
      <DialogContent
        className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"
        // Niente auto-focus all'apertura: su iOS il focus automatico sul campo
        // data apriva subito il date picker (fastidio segnalato). Il focus resta
        // comunque intrappolato nel dialog.
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
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
            {/* Data + Titolo affiancati 50/50. Data = campo custom (display
                formattato + <input type=date> INVISIBILE sopra) così su iOS non
                sfora dal box (stesso pattern delle spese). `items-end` tiene gli
                input allineati anche se una label andasse a capo. */}
            <div className="grid grid-cols-2 items-end gap-3">
              <div className="min-w-0">
                <Label htmlFor="r_data" className="block truncate text-xs text-muted-foreground">
                  Data
                </Label>
                <div className="relative mt-1">
                  <div
                    aria-hidden="true"
                    className="pointer-events-none flex h-10 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <Calendar className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 truncate tabular-nums">{fmtDataBreve(dataRiunione)}</span>
                  </div>
                  <input
                    id="r_data"
                    type="date"
                    value={dataRiunione}
                    onChange={(e) => setDataRiunione(e.target.value)}
                    aria-label="Data riunione"
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  />
                </div>
              </div>
              <div className="min-w-0">
                <Label htmlFor="r_tit" className="block truncate text-xs text-muted-foreground">
                  Titolo <span className="font-normal opacity-60">(opz.)</span>
                </Label>
                <Input
                  id="r_tit"
                  value={titolo}
                  onChange={(e) => setTitolo(e.target.value)}
                  placeholder="Es. Sopralluogo…"
                  className="mt-1 h-10"
                />
              </div>
            </div>

            {/* Contenuto: la voce è la via preferita, la scrittura è il fallback */}
            <div>
              <Label className="text-xs text-muted-foreground">Contenuto della riunione</Label>
              <div className="mt-1.5">
                <RecordingButton
                  recording={recording}
                  transcribing={transcribing}
                  recSecs={recSecs}
                  onStart={startRec}
                  onStop={stopRec}
                />
              </div>

              {/* L'avviso calmo: la registrazione era troppo breve, o non si
                  e' capito niente. Non e' un errore, e non si presenta come
                  tale: si rilegge la frase e si ritocca il microfono. */}
              {avvisoVoce && !recording && !transcribing ? (
                <p
                  role="status"
                  className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-center text-[11px] text-amber-800 dark:text-amber-300"
                >
                  {avvisoVoce}
                </p>
              ) : null}

              {recording ? (
                <p className="mt-2 text-center text-[11px] text-muted-foreground">
                  Parla pure: quando hai finito premi «Ferma», l&apos;AI trascrive e compila i campi.
                </p>
              ) : !transcribing ? (
                <p className="mt-2 text-center text-[11px] text-muted-foreground">
                  Racconta la riunione a voce: l&apos;AI la trascrive e prepara reportino e cose da fare.
                </p>
              ) : null}

              <div className="mt-3">
                <textarea
                  value={corpoLibero}
                  onChange={(e) => setCorpoLibero(e.target.value)}
                  rows={5}
                  placeholder="Punti discussi, decisioni, cose da fare…"
                  className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm leading-relaxed placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring"
                />
                {corpoLibero.length > 0 ? (
                  <p className="mt-0.5 text-right text-[10px] text-muted-foreground">
                    {corpoLibero.length} car.
                  </p>
                ) : null}
              </div>
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
                  title="Scansiona uno o più fogli in un unico PDF"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted transition-colors"
                >
                  <ScanLine className="h-4 w-4" />
                  Scansione
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
                            <PrioritaChip priorita={t.priorita} />
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
              {/* Secondario, azzurrino: comunica che l'AI RISCRIVE il testo.
                  Volutamente meno prominente del salvataggio normale. */}
              <Button
                variant="outline"
                size="sm"
                onClick={generaReport}
                disabled={generating || !hasTextContent}
                title={
                  !hasTextContent
                    ? 'Scrivi o detta del contenuto per riscrivere con AI'
                    : "L'AI riordina e riscrive il testo per renderlo più chiaro e leggibile"
                }
                className="border-sky-300 bg-sky-50 text-sky-700 hover:bg-sky-100 hover:text-sky-800 dark:border-sky-500/40 dark:bg-sky-500/10 dark:text-sky-300 dark:hover:bg-sky-500/20"
              >
                {generating ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                {generating ? 'Riscrittura…' : 'Riscrivi con AI'}
              </Button>
              {/* Azione PRIMARIA: salvataggio normale (l'utente raramente vuole
                  che l'AI riscriva). Bottone solido, posizione prominente. */}
              <Button
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
    <div className="-mt-1 mb-1.5 flex items-center gap-1">
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
      <div className="flex w-full items-center justify-center gap-2 rounded-xl border border-primary/20 bg-primary/5 py-3.5 text-sm font-medium text-primary">
        <Loader2 className="h-4 w-4 animate-spin" />
        Trascrizione in corso…
      </div>
    );
  }
  if (recording) {
    return (
      <button
        type="button"
        onClick={onStop}
        className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-destructive/50 bg-destructive/10 py-3.5 text-base font-semibold text-destructive transition-colors hover:bg-destructive/15"
      >
        <Square className="h-4 w-4 fill-current" />
        Ferma registrazione · {fmtSecs(recSecs)}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onStart}
      className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-primary/40 bg-primary/[0.06] py-3.5 text-base font-semibold text-primary transition-all hover:bg-primary/10 active:scale-[0.99]"
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
        <Mic className="h-4 w-4" aria-hidden="true" />
      </span>
      Detta a voce
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

/** "YYYY-MM-DD" → "DD/MM/YYYY" (senza `new Date`, così niente shift di fuso). */
function fmtDataBreve(iso: string): string {
  const [y, m, d] = iso.split('-');
  return y && m && d ? `${d}/${m}/${y}` : iso;
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
