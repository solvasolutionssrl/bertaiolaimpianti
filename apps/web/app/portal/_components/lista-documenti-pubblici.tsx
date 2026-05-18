import { FileText, FileImage, FileSpreadsheet, File as FileIcon, Download } from 'lucide-react';

import { Card, CardContent } from '@impiantixplus/ui';

export interface DocumentoPubblico {
  id: string;
  filename: string;
  mime: string;
  sizeBytes: number;
  uploadedAt: string;
  /** Path relativo alla root commessa (es. "Preventivi/Bagno_v2.pdf"). */
  relativePath: string;
  /** Signed URL (validità breve). */
  downloadUrl: string;
}

export interface ListaDocumentiPubbliciProps {
  documenti: DocumentoPubblico[];
}

/**
 * Lista documenti consultabili dal cliente.
 *
 * Sicurezza:
 *  - i `downloadUrl` sono firmati per **10 minuti** (`getDownloadUrl(path, 600)`)
 *    e generati lato server per file già filtrati dalla `portal_files_view`.
 *  - se per qualunque motivo questo componente riceve un path *non*
 *    pubblicabile, NON dobbiamo qui ri-validare le RLS: la RLS deve aver
 *    già tagliato a monte. Tuttavia raggruppare per cartella aiuta il
 *    cliente a capire cosa sta scaricando.
 */
export function ListaDocumentiPubblici({ documenti }: ListaDocumentiPubbliciProps) {
  if (documenti.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
          <FileText className="h-8 w-8 text-muted-foreground" aria-hidden />
          <p className="text-sm font-medium">
            Nessun documento ancora pubblicato dall&apos;ufficio
          </p>
          <p className="text-xs text-muted-foreground">
            Appena saranno disponibili preventivi, DICO o certificazioni li
            troverai qui.
          </p>
        </CardContent>
      </Card>
    );
  }

  const gruppi = raggruppaPerCartella(documenti);

  return (
    <div className="flex flex-col gap-6">
      {gruppi.map(({ cartella, files }) => (
        <section key={cartella} className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {umanizzaCartella(cartella)}
          </h3>
          <ul className="flex flex-col gap-2">
            {files.map((doc) => (
              <li
                key={doc.id}
                className="flex items-center gap-3 rounded-md border border-border bg-card p-3 transition hover:border-[var(--brand-color,theme(colors.primary.DEFAULT))]"
              >
                <IconaMime mime={doc.mime} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium" title={doc.filename}>
                    {doc.filename}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatBytes(doc.sizeBytes)} ·{' '}
                    {new Date(doc.uploadedAt).toLocaleDateString('it-IT', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </p>
                </div>
                <a
                  href={doc.downloadUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted"
                  aria-label={`Scarica ${doc.filename}`}
                  download={doc.filename}
                >
                  <Download className="h-3.5 w-3.5" />
                  Scarica
                </a>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function raggruppaPerCartella(docs: DocumentoPubblico[]) {
  const map = new Map<string, DocumentoPubblico[]>();
  for (const d of docs) {
    const cartella = d.relativePath.split('/').slice(0, -1).join('/') || 'Altri';
    const cur = map.get(cartella) ?? [];
    cur.push(d);
    map.set(cartella, cur);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b, 'it'))
    .map(([cartella, files]) => ({
      cartella,
      files: files.sort((a, b) => a.filename.localeCompare(b.filename, 'it')),
    }));
}

function umanizzaCartella(c: string): string {
  return c
    .split('/')
    .map((seg) => seg.replace(/_/g, ' '))
    .join(' › ');
}

function IconaMime({ mime }: { mime: string }) {
  const cls = 'h-8 w-8 shrink-0 text-muted-foreground';
  if (mime.startsWith('image/')) return <FileImage className={cls} aria-hidden />;
  if (mime.includes('pdf')) return <FileText className={cls} aria-hidden />;
  if (mime.includes('sheet') || mime.includes('excel'))
    return <FileSpreadsheet className={cls} aria-hidden />;
  return <FileIcon className={cls} aria-hidden />;
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
