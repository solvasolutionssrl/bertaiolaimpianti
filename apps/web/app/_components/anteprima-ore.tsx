import { minutiDaTesto, oreDecimaliDaTesto } from '@kommessa/api/ore-testo';

const hm = (min: number) => `${Math.floor(min / 60)}:${String(Math.round(min) % 60).padStart(2, '0')}`;

/**
 * Come e' stato letto quello che si sta scrivendo (28/10/2026). Le ore si
 * scrivono come ore e minuti («0:30»), ma un decimale resta valido: «0,30» e'
 * 18 minuti, non mezz'ora. Mostrarlo mentre si scrive e' il modo meno invasivo
 * di evitare l'equivoco senza rifiutare chi scrive «0,5».
 * `paghe`: si legge con `oreDecimaliDaTesto` e si dice anche il valore nel file.
 */
export function AnteprimaOre({ testo, paghe = false, className = '' }: { testo: string; paghe?: boolean; className?: string }) {
  const t = testo.trim();
  if (!t) return null;
  const minuti = paghe ? (oreDecimaliDaTesto(t) ?? null) : minutiDaTesto(t);
  const min = minuti === null ? null : paghe ? Math.round(minuti * 60) : minuti;
  if (min === null) return <span className={`text-[11px] text-destructive ${className}`}>Scrivere le ore come 1:30</span>;
  // Gia' scritto come ore e minuti: non c'e' niente da chiarire.
  if (/^\d{1,2}:\d{2}$/.test(t) && !paghe) return null;
  return (
    <span className={`text-[11px] tabular-nums text-muted-foreground ${className}`}>
      = {hm(min)}
      {paghe ? ` · nel file ${(min / 60).toFixed(2).replace('.', ',')}` : ''}
    </span>
  );
}
