const STATI: Record<string, { label: string; dot: string; text: string }> = {
  bozza: { label: 'Bozza', dot: 'bg-slate-400', text: 'text-slate-600 dark:text-slate-400' },
  inviato: { label: 'Inviato', dot: 'bg-amber-400', text: 'text-amber-700 dark:text-amber-400' },
  verificato: { label: 'Verificato', dot: 'bg-blue-400', text: 'text-blue-700 dark:text-blue-400' },
  approvato: { label: 'Approvato', dot: 'bg-emerald-500', text: 'text-emerald-700 dark:text-emerald-400' },
  respinto: { label: 'Respinto', dot: 'bg-red-500', text: 'text-red-700 dark:text-red-400' },
  esportato: { label: 'Esportato', dot: 'bg-slate-500', text: 'text-slate-600 dark:text-slate-400' },
};

export function RapportinoBadge({ stato }: { stato: string }) {
  const cfg = STATI[stato] ?? { label: stato, dot: 'bg-slate-400', text: 'text-slate-600' };
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${cfg.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}
