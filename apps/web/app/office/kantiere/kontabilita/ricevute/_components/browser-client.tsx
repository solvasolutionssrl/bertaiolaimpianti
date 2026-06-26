'use client';

import * as React from 'react';
import {
  ChevronRight,
  Folder,
  FileText,
  Image as ImageIcon,
  Download,
  Eye,
  Loader2,
  ArrowUp,
  FolderArchive,
} from 'lucide-react';

import { Button, Card, CardContent, Badge, cn } from '@kommessa/ui';
import { CATEGORIA_META } from '@/app/_components/spese/categoria';
import { MediaLightbox, type MediaItem } from '@/app/_components/media-lightbox';

// ── Tipi della risposta /api/kantiere/spese/browse ──────────────────────────
type SpesaInfo = {
  id: string;
  esercente: string | null;
  importo: number | null;
  valuta: string | null;
  categoria: string | null;
  dipendenteId: string | null;
  dipendenteNome?: string;
  dataScontrino: string | null;
};
type FolderEntry = { prefix: string; label: string };
type FileEntry = {
  key: string;
  name: string;
  size: number | null;
  lastModified: string | null;
  spesa: SpesaInfo | null;
};
type BrowseOk =
  | { ok: true; level: 'folders'; prefix: string; base: string; folders: FolderEntry[] }
  | { ok: true; level: 'files'; prefix: string; base: string; files: FileEntry[] };
type BrowseErr = { ok: false; code: string };
type BrowseRes = BrowseOk | BrowseErr;

// ── Helper di formato ───────────────────────────────────────────────────────
const EUR = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
const DATETIME = new Intl.DateTimeFormat('it-IT', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Rome',
});
const DATE = new Intl.DateTimeFormat('it-IT', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'Europe/Rome',
});

const MESI = [
  'Gennaio',
  'Febbraio',
  'Marzo',
  'Aprile',
  'Maggio',
  'Giugno',
  'Luglio',
  'Agosto',
  'Settembre',
  'Ottobre',
  'Novembre',
  'Dicembre',
];

function formatBytes(b: number | null): string {
  if (b == null || !Number.isFinite(b)) return 'n.d.';
  if (b < 1024) return `${b} B`;
  const kb = b / 1024;
  if (kb < 1024) return `${kb.toFixed(kb < 10 ? 1 : 0)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return 'n.d.';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'n.d.';
  return DATETIME.format(d);
}

function formatDataScontrino(iso: string | null): string {
  if (!iso) return 'n.d.';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'n.d.';
  return DATE.format(d);
}

function isPdfName(name: string): boolean {
  return /\.pdf$/i.test(name);
}

function mimeFromName(name: string): string {
  return isPdfName(name) ? 'application/pdf' : 'image/jpeg';
}

function fileUrl(key: string, download = false): string {
  const base = `/api/kantiere/spese/file?key=${encodeURIComponent(key)}`;
  return download ? `${base}&download=1` : base;
}

/**
 * Etichetta leggibile di una cartella: "06" dentro un anno diventa "Giugno
 * 2026" se riusciamo a dedurre l'anno dal prefisso, altrimenti restiamo sul
 * valore grezzo. Gli anni (4 cifre) si mostrano come sono.
 */
function labelCartella(folder: FolderEntry, base: string): string {
  const raw = folder.label;
  // segmenti del prefisso sotto base (es. ['2026', '06'])
  const rel = folder.prefix.slice(base.length).replace(/\/+$/, '');
  const segs = rel ? rel.split('/') : [];
  if (segs.length === 2 && /^\d{1,2}$/.test(raw)) {
    const mese = MESI[Number(raw) - 1];
    const anno = segs[0];
    if (mese) return `${mese} ${anno}`;
  }
  return raw;
}

export function BrowserClient() {
  // prefix === undefined → radice (l'endpoint usa la base del tenant)
  const [prefix, setPrefix] = React.useState<string | undefined>(undefined);
  const [data, setData] = React.useState<BrowseOk | null>(null);
  const [errCode, setErrCode] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  // lightbox
  const [lbOpen, setLbOpen] = React.useState(false);
  const [lbIndex, setLbIndex] = React.useState<number | null>(null);

  React.useEffect(() => {
    let annullato = false;
    setLoading(true);
    setErrCode(null);
    const qs = prefix ? `?prefix=${encodeURIComponent(prefix)}` : '';
    fetch(`/api/kantiere/spese/browse${qs}`)
      .then((r) => r.json() as Promise<BrowseRes>)
      .then((res) => {
        if (annullato) return;
        if (res.ok) {
          setData(res);
        } else {
          setData(null);
          setErrCode(res.code || 'ERRORE');
        }
      })
      .catch(() => {
        if (!annullato) setErrCode('RETE');
      })
      .finally(() => {
        if (!annullato) setLoading(false);
      });
    return () => {
      annullato = true;
    };
  }, [prefix]);

  const base = data?.base ?? '';
  const currentPrefix = data?.prefix ?? prefix ?? base;

  // ── Breadcrumb dal prefisso corrente ──────────────────────────────────────
  const crumbs = React.useMemo(() => {
    if (!base) return [] as { label: string; prefix: string | undefined }[];
    const rel = currentPrefix.slice(base.length).replace(/\/+$/, '');
    const segs = rel ? rel.split('/') : [];
    const out: { label: string; prefix: string | undefined }[] = [
      { label: 'Ricevute', prefix: undefined },
    ];
    let acc = base;
    segs.forEach((seg, i) => {
      acc = `${acc}${seg}/`;
      let label = seg;
      if (i === 1 && /^\d{1,2}$/.test(seg)) {
        const mese = MESI[Number(seg) - 1];
        if (mese) label = mese;
      }
      out.push({ label, prefix: acc });
    });
    return out;
  }, [base, currentPrefix]);

  const parentPrefix = React.useMemo(() => {
    if (!base) return undefined;
    const rel = currentPrefix.slice(base.length).replace(/\/+$/, '');
    const segs = rel ? rel.split('/') : [];
    if (segs.length === 0) return undefined;
    if (segs.length === 1) return undefined; // su = radice
    return `${base}${segs.slice(0, -1).join('/')}/`;
  }, [base, currentPrefix]);

  const isRoot = !base || currentPrefix.replace(/\/+$/, '') === base.replace(/\/+$/, '');

  // ── MediaItems per il lightbox (solo a livello file) ──────────────────────
  const files = data && data.level === 'files' ? data.files : [];
  const mediaItems: MediaItem[] = React.useMemo(
    () =>
      files.map((f) => ({
        id: f.key,
        src: fileUrl(f.key),
        downloadUrl: fileUrl(f.key, true),
        mime: mimeFromName(f.name),
        filename: f.name,
      })),
    [files],
  );

  return (
    <div className="space-y-4">
      {/* Breadcrumb + azioni cartella */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="flex flex-wrap items-center gap-1 text-sm">
          {crumbs.map((c, i) => {
            const last = i === crumbs.length - 1;
            return (
              <span key={c.prefix ?? 'root'} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                {last ? (
                  <span className="font-medium text-foreground">{c.label}</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setPrefix(c.prefix)}
                    className="rounded px-1 text-muted-foreground transition-colors hover:text-foreground hover:underline"
                  >
                    {c.label}
                  </button>
                )}
              </span>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          {!isRoot && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPrefix(parentPrefix)}
              className="gap-1.5"
            >
              <ArrowUp className="h-4 w-4" />
              Torna su
            </Button>
          )}
          {data?.level === 'files' && files.length > 0 && (
            <a
              href={`/api/kantiere/spese/zip?prefix=${encodeURIComponent(currentPrefix)}`}
            >
              <Button size="sm" className="gap-1.5">
                <FolderArchive className="h-4 w-4" />
                Scarica cartella (zip)
              </Button>
            </a>
          )}
        </div>
      </div>

      {/* Stati */}
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Caricamento...
        </div>
      ) : errCode ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-sm font-medium text-destructive">
              Impossibile caricare le ricevute
            </p>
            <p className="mt-1 font-mono text-xs text-muted-foreground">{errCode}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => setPrefix((p) => p)}
            >
              Riprova
            </Button>
          </CardContent>
        </Card>
      ) : data?.level === 'folders' ? (
        data.folders.length === 0 ? (
          <EmptyState messaggio={isRoot ? 'Nessuna ricevuta ancora.' : 'Cartella vuota.'} />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {data.folders.map((f) => (
              <button
                key={f.prefix}
                type="button"
                onClick={() => setPrefix(f.prefix)}
                className="group flex items-center gap-3 rounded-lg border border-border bg-background p-4 text-left transition-colors hover:border-primary/40 hover:bg-muted/40"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-amber-50 text-amber-600">
                  <Folder className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-foreground">
                    {labelCartella(f, base)}
                  </span>
                  <span className="block text-xs text-muted-foreground">Apri cartella</span>
                </span>
              </button>
            ))}
          </div>
        )
      ) : data?.level === 'files' ? (
        files.length === 0 ? (
          <EmptyState messaggio="Nessun file in questa cartella." />
        ) : (
          <FilesList
            files={files}
            onApri={(i) => {
              setLbIndex(i);
              setLbOpen(true);
            }}
          />
        )
      ) : (
        <EmptyState messaggio="Nessuna ricevuta ancora." />
      )}

      <MediaLightbox
        items={mediaItems}
        initialIndex={lbIndex}
        open={lbOpen}
        onOpenChange={setLbOpen}
      />
    </div>
  );
}

function EmptyState({ messaggio }: { messaggio: string }) {
  return (
    <Card>
      <CardContent className="py-12 text-center text-sm text-muted-foreground">
        {messaggio}
      </CardContent>
    </Card>
  );
}

function FilesList({
  files,
  onApri,
}: {
  files: FileEntry[];
  onApri: (index: number) => void;
}) {
  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">File</th>
                <th className="px-4 py-3 font-medium">Spesa collegata</th>
                <th className="px-4 py-3 font-medium">Dimensione</th>
                <th className="px-4 py-3 font-medium">Caricato</th>
                <th className="px-4 py-3 text-right font-medium">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {files.map((f, i) => {
                const pdf = isPdfName(f.name);
                const cat =
                  f.spesa?.categoria && f.spesa.categoria in CATEGORIA_META
                    ? CATEGORIA_META[f.spesa.categoria as keyof typeof CATEGORIA_META]
                    : null;
                return (
                  <tr
                    key={f.key}
                    className="border-b border-border/60 last:border-0 hover:bg-muted/30"
                  >
                    {/* File */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span
                          className={cn(
                            'flex h-9 w-9 shrink-0 items-center justify-center rounded-md',
                            pdf
                              ? 'bg-rose-50 text-rose-600'
                              : 'bg-sky-50 text-sky-600',
                          )}
                        >
                          {pdf ? (
                            <FileText className="h-4 w-4" />
                          ) : (
                            <ImageIcon className="h-4 w-4" />
                          )}
                        </span>
                        <span className="min-w-0">
                          <span
                            className="block max-w-[220px] truncate font-mono text-xs text-foreground"
                            title={f.name}
                          >
                            {f.name}
                          </span>
                        </span>
                      </div>
                    </td>

                    {/* Spesa collegata */}
                    <td className="px-4 py-3">
                      {f.spesa ? (
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-foreground">
                              {f.spesa.esercente || 'Esercente n.d.'}
                            </span>
                            {cat && (
                              <Badge variant="outline" className={cn('border', cat.badge)}>
                                {cat.label}
                              </Badge>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                            <span className="font-medium text-foreground">
                              {f.spesa.importo != null
                                ? EUR.format(f.spesa.importo)
                                : 'n.d.'}
                            </span>
                            <span>{f.spesa.dipendenteNome || 'Senza nome'}</span>
                            <span>{formatDataScontrino(f.spesa.dataScontrino)}</span>
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">n.d.</span>
                      )}
                    </td>

                    {/* Dimensione */}
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                      {formatBytes(f.size)}
                    </td>

                    {/* Caricato */}
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                      {formatDateTime(f.lastModified)}
                    </td>

                    {/* Azioni */}
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onApri(i)}
                          className="gap-1.5"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          Apri
                        </Button>
                        <a href={fileUrl(f.key, true)}>
                          <Button variant="ghost" size="sm" className="gap-1.5">
                            <Download className="h-3.5 w-3.5" />
                            Scarica
                          </Button>
                        </a>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
