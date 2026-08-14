'use client';

import * as React from 'react';
import {
  ChevronRight,
  Folder,
  FolderOpen,
  Calendar,
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

/**
 * Etichetta di un nodo dell'alberatura: gli anni (profondità 1) restano grezzi,
 * i mesi (profondità 2) diventano "Giugno 2026".
 */
function labelNodo(prefix: string, label: string, base: string): string {
  const rel = prefix.slice(base.length).replace(/\/+$/, '');
  const segs = rel ? rel.split('/') : [];
  if (segs.length === 2 && /^\d{1,2}$/.test(label)) {
    const mese = MESI[Number(label) - 1];
    if (mese) return `${mese} ${segs[0]}`;
  }
  return label;
}

function normPrefix(p: string | undefined): string {
  return (p ?? '').replace(/\/+$/, '');
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

  // ── Alberatura sidebar (lazy) ──────────────────────────────────────────────
  // childrenByPrefix: figli cartella per prefisso. La chiave '' = radice (anni).
  const [childrenByPrefix, setChildrenByPrefix] = React.useState<
    Record<string, FolderEntry[]>
  >({});
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const [treeLoading, setTreeLoading] = React.useState<Set<string>>(new Set());
  const [treeBase, setTreeBase] = React.useState('');
  // mobile: sidebar a comparsa
  const [sidebarOpen, setSidebarOpen] = React.useState(false);

  // Carica i figli di un prefisso (o la radice se prefix è undefined) e li
  // memorizza in cache. Restituisce la base scoperta dall'endpoint.
  const fetchFolders = React.useCallback(
    async (p: string | undefined): Promise<{ folders: FolderEntry[]; base: string } | null> => {
      const qs = p ? `?prefix=${encodeURIComponent(p)}` : '';
      try {
        const res = (await fetch(`/api/kantiere/spese/browse${qs}`).then((r) =>
          r.json(),
        )) as BrowseRes;
        if (res.ok && res.level === 'folders') {
          return { folders: res.folders, base: res.base };
        }
        // livello file → nessuna sottocartella
        if (res.ok) return { folders: [], base: res.base };
        return null;
      } catch {
        return null;
      }
    },
    [],
  );

  const loadChildren = React.useCallback(
    async (cacheKey: string, p: string | undefined) => {
      setTreeLoading((s) => new Set(s).add(cacheKey));
      const r = await fetchFolders(p);
      setTreeLoading((s) => {
        const n = new Set(s);
        n.delete(cacheKey);
        return n;
      });
      if (r) {
        if (r.base) setTreeBase(r.base);
        setChildrenByPrefix((m) => ({ ...m, [cacheKey]: r.folders }));
      }
    },
    [fetchFolders],
  );

  // Radice (anni) al mount.
  React.useEffect(() => {
    void loadChildren('', undefined);
  }, [loadChildren]);

  const toggleNode = React.useCallback(
    (nodePrefix: string) => {
      setExpanded((s) => {
        const n = new Set(s);
        if (n.has(nodePrefix)) {
          n.delete(nodePrefix);
        } else {
          n.add(nodePrefix);
          // lazy load se non già in cache
          if (!(nodePrefix in childrenByPrefix)) {
            void loadChildren(nodePrefix, nodePrefix);
          }
        }
        return n;
      });
    },
    [childrenByPrefix, loadChildren],
  );

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

  const base = data?.base ?? treeBase;
  const currentPrefix = data?.prefix ?? prefix ?? base;

  // Sincronizza l'alberatura con la navigazione del pannello destro:
  // espande gli antenati del prefisso corrente così l'evidenziazione resta
  // coerente quando si naviga dalle card o dal breadcrumb.
  React.useEffect(() => {
    if (!base || !currentPrefix) return;
    const rel = currentPrefix.slice(base.length).replace(/\/+$/, '');
    if (!rel) return;
    const segs = rel.split('/');
    // espandi tutti gli antenati (cartella anno se siamo nel mese, ecc.)
    let acc = base;
    const toExpand: string[] = [];
    for (let i = 0; i < segs.length - 1; i++) {
      acc = `${acc}${segs[i]}/`;
      toExpand.push(acc);
    }
    if (toExpand.length === 0) return;
    setExpanded((s) => {
      let changed = false;
      const n = new Set(s);
      for (const p of toExpand) {
        if (!n.has(p)) {
          n.add(p);
          changed = true;
          if (!(p in childrenByPrefix)) void loadChildren(p, p);
        }
      }
      return changed ? n : s;
    });
  }, [base, currentPrefix, childrenByPrefix, loadChildren]);

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

  // Naviga a un prefisso (anche dalla sidebar) e chiude il drawer mobile.
  const navega = React.useCallback((p: string | undefined) => {
    setPrefix(p);
    setSidebarOpen(false);
  }, []);

  // Prefisso attualmente selezionato, normalizzato (per evidenziazione tree).
  const activePrefix = normPrefix(currentPrefix);

  const years = childrenByPrefix[''] ?? [];

  // ── MediaItems per il lightbox (solo a livello file) ──────────────────────
  // Stabile fra un render e l'altro: altrimenti l'elenco vuoto sarebbe un array
  // nuovo ogni volta e il memo qui sotto non memorizzerebbe mai niente.
  const files = React.useMemo(
    () => (data && data.level === 'files' ? data.files : []),
    [data],
  );
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

  const tree = (
    <Tree
      base={base}
      years={years}
      childrenByPrefix={childrenByPrefix}
      expanded={expanded}
      treeLoading={treeLoading}
      activePrefix={activePrefix}
      onToggle={toggleNode}
      onSelect={navega}
    />
  );

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
      {/* Toggle sidebar (solo mobile/tablet) */}
      <div className="lg:hidden">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setSidebarOpen((v) => !v)}
          className="gap-1.5"
        >
          <Folder className="h-4 w-4" />
          {sidebarOpen ? 'Nascondi cartelle' : 'Mostra cartelle'}
        </Button>
        {sidebarOpen && (
          <Card className="mt-2">
            <CardContent className="max-h-[60vh] overflow-y-auto p-2">{tree}</CardContent>
          </Card>
        )}
      </div>

      {/* Sidebar alberatura (desktop) */}
      <aside className="hidden w-56 shrink-0 self-stretch lg:block xl:w-64">
        <div className="sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto rounded-lg border border-border bg-background p-2">
          <p className="px-2 pb-2 pt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Cartelle
          </p>
          {tree}
        </div>
      </aside>

      {/* Pannello destro: breadcrumb + contenuto */}
      <div className="min-w-0 flex-1 space-y-4">
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
                      onClick={() => navega(c.prefix)}
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
                onClick={() => navega(parentPrefix)}
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
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4">
              {data.folders.map((f) => (
                <button
                  key={f.prefix}
                  type="button"
                  onClick={() => navega(f.prefix)}
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
      </div>

      <MediaLightbox
        items={mediaItems}
        initialIndex={lbIndex}
        open={lbOpen}
        onOpenChange={setLbOpen}
      />
    </div>
  );
}

// ── Alberatura (sidebar) ─────────────────────────────────────────────────────
function Tree({
  base,
  years,
  childrenByPrefix,
  expanded,
  treeLoading,
  activePrefix,
  onToggle,
  onSelect,
}: {
  base: string;
  years: FolderEntry[];
  childrenByPrefix: Record<string, FolderEntry[]>;
  expanded: Set<string>;
  treeLoading: Set<string>;
  activePrefix: string;
  onToggle: (prefix: string) => void;
  onSelect: (prefix: string | undefined) => void;
}) {
  const rootLoading = treeLoading.has('');
  if (rootLoading && years.length === 0) {
    return (
      <div className="flex items-center gap-2 px-2 py-3 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Caricamento...
      </div>
    );
  }
  if (years.length === 0) {
    return (
      <p className="px-2 py-3 text-xs text-muted-foreground">Nessuna cartella.</p>
    );
  }
  return (
    <ul className="space-y-0.5">
      {years.map((y) => (
        <TreeNode
          key={y.prefix}
          node={y}
          depth={0}
          base={base}
          childrenByPrefix={childrenByPrefix}
          expanded={expanded}
          treeLoading={treeLoading}
          activePrefix={activePrefix}
          onToggle={onToggle}
          onSelect={onSelect}
        />
      ))}
    </ul>
  );
}

function TreeNode({
  node,
  depth,
  base,
  childrenByPrefix,
  expanded,
  treeLoading,
  activePrefix,
  onToggle,
  onSelect,
}: {
  node: FolderEntry;
  depth: number;
  base: string;
  childrenByPrefix: Record<string, FolderEntry[]>;
  expanded: Set<string>;
  treeLoading: Set<string>;
  activePrefix: string;
  onToggle: (prefix: string) => void;
  onSelect: (prefix: string | undefined) => void;
}) {
  const isExpanded = expanded.has(node.prefix);
  const isActive = activePrefix === normPrefix(node.prefix);
  const isLoading = treeLoading.has(node.prefix);
  const children = childrenByPrefix[node.prefix];
  // gli anni (depth 0) hanno sotto-cartelle (mesi); i mesi sono foglie.
  const isYear = depth === 0;
  const label = labelNodo(node.prefix, node.label, base);

  return (
    <li>
      <div
        className={cn(
          'flex items-center gap-1 rounded-md pr-1 text-sm transition-colors',
          isActive
            ? 'bg-primary/10 text-foreground'
            : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
        )}
        style={{ paddingLeft: depth * 12 }}
      >
        {/* Chevron / spazio per le foglie */}
        {isYear ? (
          <button
            type="button"
            aria-label={isExpanded ? 'Chiudi' : 'Apri'}
            onClick={() => onToggle(node.prefix)}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded hover:bg-muted"
          >
            {isLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ChevronRight
                className={cn(
                  'h-3.5 w-3.5 transition-transform',
                  isExpanded && 'rotate-90',
                )}
              />
            )}
          </button>
        ) : (
          <span className="h-6 w-6 shrink-0" />
        )}

        {/* Etichetta cliccabile → naviga */}
        <button
          type="button"
          onClick={() => onSelect(node.prefix)}
          className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left"
        >
          {isYear ? (
            isExpanded ? (
              <FolderOpen className="h-4 w-4 shrink-0 text-amber-600" />
            ) : (
              <Folder className="h-4 w-4 shrink-0 text-amber-600" />
            )
          ) : (
            <Calendar className="h-4 w-4 shrink-0 text-sky-600" />
          )}
          <span
            className={cn('truncate', isActive && 'font-medium')}
            title={label}
          >
            {label}
          </span>
        </button>
      </div>

      {/* Figli (mesi) */}
      {isYear && isExpanded && (
        <ul className="space-y-0.5">
          {isLoading && !children ? (
            <li
              className="flex items-center gap-2 py-1.5 text-xs text-muted-foreground"
              style={{ paddingLeft: (depth + 1) * 12 + 28 }}
            >
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Caricamento...
            </li>
          ) : children && children.length === 0 ? (
            <li
              className="py-1.5 text-xs text-muted-foreground"
              style={{ paddingLeft: (depth + 1) * 12 + 28 }}
            >
              Vuota
            </li>
          ) : (
            (children ?? []).map((c) => (
              <TreeNode
                key={c.prefix}
                node={c}
                depth={depth + 1}
                base={base}
                childrenByPrefix={childrenByPrefix}
                expanded={expanded}
                treeLoading={treeLoading}
                activePrefix={activePrefix}
                onToggle={onToggle}
                onSelect={onSelect}
              />
            ))
          )}
        </ul>
      )}
    </li>
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
