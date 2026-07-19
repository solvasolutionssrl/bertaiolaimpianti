'use client';

import * as React from 'react';
import { ChevronDown, FileDown, Loader2, Users } from 'lucide-react';
import { Button } from '@kommessa/ui';
import { NOMI_GIORNO_BREVI, settimanaISO, slugPianificazione } from '@kommessa/api/pianificazione';
import type { BloccoView, AssenzaView } from '../_lib/query';
import type { DipRow, CantRow, GruppoLite } from './pianificazione-client';
import {
  esportaPianificazionePDF,
  type RigaPdf,
  type VocePdf,
  type GiornoPdf,
} from '../_lib/export-pdf';

const SENZA_GRUPPO = '__senza__';

function nomeDip(d: DipRow): string {
  return `${d.cognome} ${d.nome}`.trim();
}

function fasciaMarker(b: BloccoView): string {
  if (b.fascia === 'giornata') return 'giornata';
  if (b.fascia === 'mattina') return 'mattina';
  if (b.fascia === 'pomeriggio') return 'pomeriggio';
  return `${b.oraInizio}-${b.oraFine}`;
}

function fmtGiornoLungo(iso: string, conAnno = false): string {
  const [Y, M, D] = iso.split('-').map(Number);
  return new Date(Date.UTC(Y!, M! - 1, D!)).toLocaleDateString('it-IT', {
    day: 'numeric',
    month: 'long',
    ...(conAnno ? { year: 'numeric' } : {}),
    timeZone: 'Europe/Rome',
  });
}

export function ExportMenu({
  lunediISO,
  giorni,
  dipendenti,
  cantieri,
  blocchi,
  assenze,
  gruppi,
  dipGruppo,
  gruppoSel,
  vista,
  tenantNome,
  logoUrl,
  brandColor,
}: {
  lunediISO: string;
  giorni: string[];
  dipendenti: DipRow[];
  cantieri: CantRow[];
  blocchi: BloccoView[];
  assenze: AssenzaView[];
  gruppi: GruppoLite[];
  dipGruppo: Record<string, string>;
  gruppoSel: string[];
  vista: 'piano' | 'ferie';
  tenantNome: string;
  logoUrl: string | null;
  brandColor: string | null;
}) {
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // Mappe di supporto (una volta).
  const commessaMap = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const c of cantieri) if (c.codiceCommessa) m.set(c.id, c.codiceCommessa);
    return m;
  }, [cantieri]);

  const perCella = React.useMemo(() => {
    const m = new Map<string, BloccoView[]>();
    for (const b of blocchi)
      for (const d of b.membri) {
        const k = `${d}|${b.data}`;
        (m.get(k) ?? m.set(k, []).get(k)!).push(b);
      }
    return m;
  }, [blocchi]);

  const assPerCella = React.useMemo(() => {
    const m = new Map<string, AssenzaView[]>();
    for (const a of assenze) {
      const k = `${a.dipendenteId}|${a.data}`;
      (m.get(k) ?? m.set(k, []).get(k)!).push(a);
    }
    return m;
  }, [assenze]);

  const settimana = React.useMemo(() => settimanaISO(lunediISO), [lunediISO]);
  const anno = settimana.anno;
  const suffix = vista === 'ferie' ? 'ferie' : 'pianificazione';
  const titoloDoc = vista === 'ferie' ? 'Assenze · Ferie e permessi' : 'Pianificazione settimanale';
  const rangeLabel = `${fmtGiornoLungo(giorni[0]!)} · ${fmtGiornoLungo(giorni[6]!, true)}`;

  function voceDaBlocco(b: BloccoView): VocePdf {
    if (b.tipo === 'cantiere') {
      const cod = b.cantiereId ? commessaMap.get(b.cantiereId) ?? null : null;
      return {
        testo: b.cantiereNome ?? 'Cantiere',
        sub: [cod, fasciaMarker(b)].filter(Boolean).join(' · '),
        tipo: 'cantiere',
        bozza: b.stato === 'bozza',
      };
    }
    return {
      testo: b.titolo ?? (b.tipo === 'formazione' ? 'Formazione' : 'Evento'),
      sub: fasciaMarker(b),
      tipo: b.tipo,
      bozza: b.stato === 'bozza',
    };
  }

  function voceDaAssenza(a: AssenzaView): VocePdf {
    return {
      testo: a.tipoLabel,
      sub: a.tuttoIlGiorno
        ? 'tutto il giorno'
        : [a.oraInizio, a.oraFine].filter(Boolean).join('-') || undefined,
      tipo: 'assenza',
    };
  }

  /** Voci di una cella (blocchi + assenze in vista piano; solo assenze in ferie). */
  function celleGiorno(dipId: string, data: string): VocePdf[] {
    const ass = (assPerCella.get(`${dipId}|${data}`) ?? []).map(voceDaAssenza);
    if (vista === 'ferie') return ass;
    const blk = (perCella.get(`${dipId}|${data}`) ?? []).map(voceDaBlocco);
    return [...blk, ...ass];
  }

  /** Costruisce righe + giorni da mostrare per un sottoinsieme di dipendenti. */
  function costruisci(dips: DipRow[]): { giorni: GiornoPdf[]; righe: RigaPdf[] } {
    const conContenuto = new Set<number>();
    for (const d of dips)
      giorni.forEach((g, i) => {
        if (celleGiorno(d.id, g).length) conContenuto.add(i);
      });

    let idx: number[];
    if (vista === 'ferie') {
      idx = giorni.map((_, i) => i).filter((i) => conContenuto.has(i));
      if (idx.length === 0) idx = [0, 1, 2, 3, 4];
    } else {
      const base = new Set<number>([0, 1, 2, 3, 4]); // Lun–Ven sempre
      for (const i of conContenuto) base.add(i);
      idx = Array.from(base).sort((a, b) => a - b);
    }

    const giorniPdf: GiornoPdf[] = idx.map((i) => ({
      nome: NOMI_GIORNO_BREVI[i]!,
      giorno: giorni[i]!.slice(8),
      weekend: i >= 5,
    }));

    let righeDips = dips;
    if (vista === 'ferie') {
      // solo chi ha almeno un'assenza nella settimana
      righeDips = dips.filter((d) => giorni.some((g) => (assPerCella.get(`${d.id}|${g}`) ?? []).length));
    }

    const righe: RigaPdf[] = righeDips.map((d) => ({
      nome: nomeDip(d),
      mansione: d.mansione,
      celle: idx.map((i) => celleGiorno(d.id, giorni[i]!)),
    }));
    return { giorni: giorniPdf, righe };
  }

  async function esporta(dips: DipRow[], categoriaLabel: string, catSlug: string) {
    const { giorni: giorniPdf, righe } = costruisci(dips);
    await esportaPianificazionePDF({
      tenantNome,
      logoUrl,
      brandColor,
      titolo: titoloDoc,
      categoriaLabel,
      settimana: settimana.settimana,
      anno,
      rangeLabel,
      giorni: giorniPdf,
      righe,
      filename: `sett_${String(settimana.settimana).padStart(2, '0')}_${anno}_${catSlug}_${suffix}`,
    });
  }

  /** Dipendenti di un gruppo (o senza gruppo). */
  function dipsDelGruppo(gruppoId: string): DipRow[] {
    if (gruppoId === SENZA_GRUPPO) return dipendenti.filter((d) => !dipGruppo[d.id]);
    return dipendenti.filter((d) => dipGruppo[d.id] === gruppoId);
  }

  const gap = () => new Promise((r) => setTimeout(r, 250));

  async function run(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setOpen(false);
    try {
      await fn();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Export PDF fallito', e);
    } finally {
      setBusy(false);
    }
  }

  const esportaTutti = () => run(() => esporta(dipendenti, 'Tutti i dipendenti', 'completa'));

  const esportaPerCategoria = () =>
    run(async () => {
      const buckets = [...gruppi];
      const senza = dipendenti.filter((d) => !dipGruppo[d.id]);
      let primo = true;
      for (const g of buckets) {
        const dips = dipsDelGruppo(g.id);
        if (dips.length === 0) continue;
        if (!primo) await gap();
        primo = false;
        await esporta(dips, g.nome, slugPianificazione(g.nome));
      }
      if (senza.length > 0) {
        if (!primo) await gap();
        await esporta(senza, 'Senza gruppo', 'senza_gruppo');
      }
    });

  const esportaGruppo = (g: GruppoLite) =>
    run(() => esporta(dipsDelGruppo(g.id), g.nome, slugPianificazione(g.nome)));

  const esportaFiltrati = () =>
    run(async () => {
      const sel = gruppi.filter((g) => gruppoSel.includes(g.id));
      let primo = true;
      for (const g of sel) {
        const dips = dipsDelGruppo(g.id);
        if (!primo) await gap();
        primo = false;
        await esporta(dips, g.nome, slugPianificazione(g.nome));
      }
    });

  const gruppiFiltratiLabel =
    gruppoSel.length === 1
      ? gruppi.find((g) => g.id === gruppoSel[0])?.nome ?? 'gruppo'
      : `${gruppoSel.length} gruppi filtrati`;

  return (
    <div ref={ref} className="relative">
      <Button type="button" variant="outline" onClick={() => setOpen((o) => !o)} disabled={busy}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
        Esporta PDF
        <ChevronDown className="h-3.5 w-3.5 opacity-70" />
      </Button>
      {open ? (
        <div className="absolute right-0 z-40 mt-1 w-72 overflow-hidden rounded-lg border border-border bg-white py-1 shadow-lg">
          {gruppoSel.length > 0 ? (
            <button
              type="button"
              onClick={esportaFiltrati}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-primary hover:bg-primary/5"
            >
              <Users className="h-4 w-4 shrink-0" />
              Esporta {gruppiFiltratiLabel}
            </button>
          ) : null}
          <button
            type="button"
            onClick={esportaTutti}
            className="flex w-full flex-col px-3 py-2 text-left hover:bg-muted/50"
          >
            <span className="text-sm font-medium">Esporta tutti</span>
            <span className="text-[11px] text-muted-foreground">Un unico PDF con tutti i dipendenti</span>
          </button>
          {gruppi.length > 0 ? (
            <button
              type="button"
              onClick={esportaPerCategoria}
              className="flex w-full flex-col px-3 py-2 text-left hover:bg-muted/50"
            >
              <span className="text-sm font-medium">Esporta per categoria</span>
              <span className="text-[11px] text-muted-foreground">Un PDF per ogni gruppo lavoro</span>
            </button>
          ) : null}
          {gruppi.length > 0 ? (
            <>
              <div className="my-1 border-t border-border" />
              <p className="px-3 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Singolo gruppo
              </p>
              <div className="max-h-52 overflow-y-auto">
                {gruppi.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => esportaGruppo(g)}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted/50"
                  >
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: g.colore ?? '#94a3b8' }}
                    />
                    <span className="min-w-0 flex-1 truncate">{g.nome}</span>
                  </button>
                ))}
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
