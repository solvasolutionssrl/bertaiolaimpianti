import { HardHat, CheckCircle2, ScanLine } from 'lucide-react';

/**
 * "Render" del flusso QR: un poster col QR affisso alla porta del cantiere,
 * un fascio di scansione che lo attraversa e, sovrapposta, la conferma
 * "Ingresso registrato". Serve a spiegare a colpo d'occhio come si timbra.
 * CSS-only (nessun JS): scan-sweep + success-pop già in globals.
 */

// Matrice QR fittizia 21×21: 3 finder pattern agli angoli + moduli pseudo-casuali
// deterministici (nessun Math.random → build stabile). Puramente decorativa.
function buildMatrix(): boolean[][] {
  const N = 21;
  const m: boolean[][] = Array.from({ length: N }, () => Array<boolean>(N).fill(false));
  const finder = (r0: number, c0: number) => {
    for (let r = 0; r < 7; r++)
      for (let c = 0; c < 7; c++) {
        const border = r === 0 || r === 6 || c === 0 || c === 6;
        const core = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        if (border || core) m[r0 + r]![c0 + c] = true;
      }
  };
  finder(0, 0);
  finder(0, N - 7);
  finder(N - 7, 0);
  const inFinder = (r: number, c: number) =>
    (r < 8 && c < 8) || (r < 8 && c >= N - 8) || (r >= N - 8 && c < 8);
  for (let r = 0; r < N; r++)
    for (let c = 0; c < N; c++) {
      if (inFinder(r, c)) continue;
      if ((r * 13 + c * 7 + r * c) % 7 < 3) m[r]![c] = true;
    }
  return m;
}

const MATRIX = buildMatrix();

function QrGrid() {
  return (
    <div
      aria-hidden
      className="grid gap-0"
      style={{ gridTemplateColumns: `repeat(21, minmax(0, 1fr))` }}
    >
      {MATRIX.flatMap((row, r) =>
        row.map((on, c) => (
          <span
            key={`${r}-${c}`}
            className={on ? 'aspect-square bg-neutral-900' : 'aspect-square'}
          />
        )),
      )}
    </div>
  );
}

export function QrIngresso() {
  return (
    <div className="relative mx-auto w-full max-w-[20rem] animate-float-soft">
      {/* alone brand dietro */}
      <div
        aria-hidden
        className="absolute -inset-6 -z-10 rounded-[2.5rem] bg-gradient-to-tr from-primary/25 via-transparent to-accent/25 blur-2xl"
      />

      {/* Porta / cancello del cantiere */}
      <div className="relative overflow-hidden rounded-3xl border border-white/12 bg-gradient-to-b from-[hsl(220_16%_26%)] to-[hsl(220_20%_15%)] p-6 shadow-soft-lg">
        {/* bulloni angolari */}
        {['left-3 top-3', 'right-3 top-3', 'left-3 bottom-3', 'right-3 bottom-3'].map((p) => (
          <span key={p} className={`absolute ${p} h-2 w-2 rounded-full bg-white/15 ring-1 ring-black/20`} />
        ))}

        {/* insegna cantiere */}
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 rounded-md bg-warning px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-neutral-900">
            <HardHat className="h-3.5 w-3.5" /> Cantiere
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/45">
            accesso
          </span>
        </div>

        {/* nastro pericolo */}
        <div
          aria-hidden
          className="mt-3 h-1.5 w-full rounded-full opacity-80"
          style={{
            backgroundImage:
              'repeating-linear-gradient(45deg, hsl(38 92% 50%) 0 8px, hsl(220 20% 15%) 8px 16px)',
          }}
        />

        {/* Poster col QR affisso */}
        <div className="relative mx-auto mt-5 w-[70%] rounded-xl bg-white p-3 shadow-soft-lg">
          <p className="text-center text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">
            Timbra l&apos;ingresso
          </p>
          <div className="relative mt-2 overflow-hidden rounded-md bg-white p-1">
            <QrGrid />
            {/* fascio di scansione */}
            <span
              aria-hidden
              className="animate-scan-sweep absolute inset-x-0 z-10 h-5 rounded-sm"
              style={{
                background:
                  'linear-gradient(180deg, transparent, hsl(220 80% 45% / 0.18) 45%, hsl(22 92% 54% / 0.22) 60%, transparent)',
                boxShadow: '0 1px 0 hsl(22 92% 54% / 0.7)',
              }}
            />
          </div>
          <p className="mt-2 inline-flex w-full items-center justify-center gap-1 text-center text-[9px] font-medium text-neutral-500">
            <ScanLine className="h-3 w-3" /> Inquadra col telefono
          </p>
        </div>
      </div>

      {/* Conferma sovrapposta */}
      <div className="absolute -bottom-5 -right-2 flex w-56 items-center gap-2.5 rounded-2xl border border-black/5 bg-white p-3 shadow-soft-lg sm:-right-5">
        <span className="relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-success/12">
          <CheckCircle2 className="animate-success-pop h-5 w-5 text-success" />
        </span>
        <span className="min-w-0">
          <span className="block text-[13px] font-semibold text-neutral-900">Ingresso registrato</span>
          <span className="block font-mono text-[11px] tabular-nums text-neutral-500">
            07:58 · Cantiere Belvedere
          </span>
        </span>
      </div>
    </div>
  );
}
