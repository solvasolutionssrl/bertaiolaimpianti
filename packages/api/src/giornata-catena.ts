/**
 * La giornata di una persona come UNA catena cronologica: i passaggi del
 * registro (badge, app, PC), le tratte di viaggio, i segmenti di lavoro e le
 * pause, in un solo ordine.
 *
 * Perche' serve: fino al 26/10/2026 il dettaglio espanso stampava tre blocchi
 * impilati (passaggi, timbrature, viaggio) e, dentro il secondo, le pause in
 * una lista DOPO tutti i segmenti: una pausa delle 12:30 compariva sotto un
 * segmento che cominciava alle 13:00.
 *
 * ⚠️ Il fatto che decide tutto: **una tratta non porta un orario**. In tabella
 * ha direzione, sede, cantiere, km, minuti e autista, non un `ts`. La sua
 * posizione nel tempo va DERIVATA dai confini dei segmenti, ed e' la ragione
 * per cui prima i viaggi finivano in fondo in un blocco a parte.
 *
 * ⚠️ Una tratta che non si riesce ad ancorare **non si butta**: finisce in coda
 * con `ancorato: false`, e chi disegna lo dice. Perdere un viaggio vuol dire
 * perdere dei chilometri che qualcuno deve farsi rimborsare.
 */
import { appaiaTimbrature } from './kantiere-ore';

export interface TimbraturaCatena {
  tipo: string;
  ts: string;
  pausa?: boolean | null;
  commessaTitolo?: string | null;
  origine?: string | null;
  createdAt?: string | null;
  creatoNome?: string | null;
  autoChiusa?: boolean | null;
}

export interface ViaggioCatena {
  id: string;
  direzione: 'andata' | 'ritorno';
  sede: string;
  cantiere: string;
  km: number;
  minuti: number;
  autista: boolean;
  /** Valorizzato sui trasferimenti cantiere → cantiere. */
  daCantiere?: string | null;
}

export interface PassaggioCatena {
  id: string;
  ts: string;
  tipo: 'ingresso' | 'uscita' | null;
  scartato?: boolean | null;
  /** Da quale bocca viene il passaggio: serve a chi disegna, non all'ordine. */
  genere?: 'badge' | 'manuale' | 'api' | null;
  dispositivo?: string | null;
}

export interface MetaOrigine {
  origine?: string | null;
  createdAt?: string | null;
  creatoNome?: string | null;
}

export type EventoCatena =
  | { kind: 'passaggio'; ts: string; passaggio: PassaggioCatena }
  | {
      kind: 'viaggio';
      ts: string;
      viaggio: ViaggioCatena;
      da: string;
      a: string;
      /** false = non si e' potuta collocare nel tempo: va mostrata, in coda. */
      ancorato: boolean;
    }
  | {
      kind: 'lavoro';
      ts: string;
      fine: string | null;
      minuti: number | null;
      luogo: string | null;
      meta: MetaOrigine;
    }
  | { kind: 'pausa'; ts: string; fine: string | null; minuti: number | null; auto: boolean; meta: MetaOrigine };

/** Intervalli di pausa pranzo: da un'uscita marcata pausa alla ripresa dopo. */
export function pausePranzo(
  timbrature: readonly TimbraturaCatena[],
): { inizio: string; fine: string | null; auto: boolean }[] {
  const ordinate = [...timbrature]
    .filter((t) => t.tipo === 'ingresso' || t.tipo === 'uscita')
    .sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
  const out: { inizio: string; fine: string | null; auto: boolean }[] = [];
  let inizio: string | null = null;
  for (const t of ordinate) {
    if (t.tipo === 'uscita' && t.pausa) inizio = t.ts;
    else if (t.tipo === 'ingresso' && inizio) {
      out.push({ inizio, fine: t.ts, auto: !!t.autoChiusa });
      inizio = null;
    }
  }
  if (inizio) out.push({ inizio, fine: null, auto: false });
  return out;
}

/** Da dove a dove va una tratta, con il nome giusto agli estremi. */
export function estremiViaggio(v: ViaggioCatena): { da: string; a: string } {
  const cantiere = v.cantiere || 'cantiere';
  if (v.daCantiere) return { da: v.daCantiere, a: cantiere };
  return v.direzione === 'andata' ? { da: v.sede, a: cantiere } : { da: cantiere, a: v.sede };
}

function normalizza(s: string | null | undefined): string {
  return (s ?? '').trim().toLowerCase();
}

/**
 * Il luogo di un segmento e' scritto «Cantiere › Fase»: una tratta nomina il
 * CANTIERE, quindi il confronto guarda la radice e non pretende l'uguaglianza.
 */
function combacia(luogo: string | null | undefined, nome: string | null | undefined): boolean {
  const l = normalizza(luogo);
  const n = normalizza(nome);
  if (!l || !n) return false;
  return l === n || l.startsWith(n) || l.includes(n);
}

const MS = 60_000;

/**
 * Mette in fila tutta la giornata. Le tratte si ancorano cosi':
 * - **andata**: finisce sul primo ingresso, quindi comincia `minuti` prima;
 * - **ritorno**: parte dall'ultima uscita;
 * - **trasferimento**: sta nel buco fra il segmento che lascia `daCantiere` e
 *   quello che arriva su `cantiere`.
 */
export function componiCatenaGiornata(input: {
  timbrature?: readonly TimbraturaCatena[];
  viaggi?: readonly ViaggioCatena[];
  passaggi?: readonly PassaggioCatena[];
}): { eventi: EventoCatena[]; coda: EventoCatena[] } {
  const timbrature = input.timbrature ?? [];
  const viaggi = input.viaggi ?? [];
  const passaggi = input.passaggi ?? [];

  const riepilogo = appaiaTimbrature(
    timbrature
      .filter((t) => t.tipo === 'ingresso' || t.tipo === 'uscita')
      .map((t) => ({ tipo: t.tipo as 'ingresso' | 'uscita', ts: t.ts, pausa: t.pausa ?? false })),
  );
  const coppie = riepilogo.coppie;

  const meta = new Map<string, MetaOrigine>();
  const luoghi = new Map<string, string>();
  for (const t of timbrature) {
    meta.set(t.ts, { origine: t.origine, createdAt: t.createdAt, creatoNome: t.creatoNome });
    if (t.commessaTitolo) luoghi.set(t.ts, t.commessaTitolo);
  }

  const eventi: EventoCatena[] = [];
  const coda: EventoCatena[] = [];

  for (const p of passaggi) {
    if (!p.ts) continue;
    eventi.push({ kind: 'passaggio', ts: p.ts, passaggio: p });
  }

  for (const c of coppie) {
    eventi.push({
      kind: 'lavoro',
      ts: c.ingresso,
      fine: c.uscita ?? null,
      minuti: c.minuti ?? null,
      luogo: luoghi.get(c.ingresso) ?? null,
      meta: meta.get(c.ingresso) ?? {},
    });
  }

  for (const p of pausePranzo(timbrature)) {
    const minuti = p.fine ? Math.round((Date.parse(p.fine) - Date.parse(p.inizio)) / MS) : null;
    eventi.push({
      kind: 'pausa',
      ts: p.inizio,
      fine: p.fine,
      minuti,
      auto: p.auto,
      meta: meta.get(p.inizio) ?? {},
    });
  }

  const primoIngresso = coppie[0]?.ingresso ?? null;
  const uscite = coppie.map((c) => c.uscita).filter((u): u is string => !!u);
  const ultimaUscita = uscite.length > 0 ? uscite[uscite.length - 1]! : null;

  for (const v of viaggi) {
    const { da, a } = estremiViaggio(v);
    const minuti = Number.isFinite(v.minuti) ? Math.max(0, v.minuti) : 0;
    let ts: string | null = null;

    if (v.daCantiere) {
      // Il buco fra il segmento che lascia A e quello che arriva su B.
      for (let i = 0; i < coppie.length - 1; i += 1) {
        const qui = luoghi.get(coppie[i]!.ingresso);
        const dopo = luoghi.get(coppie[i + 1]!.ingresso);
        if (coppie[i]!.uscita && combacia(qui, v.daCantiere) && combacia(dopo, v.cantiere)) {
          ts = coppie[i]!.uscita!;
          break;
        }
      }
      if (!ts) {
        // Ripiego: appena prima dell'arrivo sul cantiere di destinazione.
        const arrivo = coppie.find((c) => combacia(luoghi.get(c.ingresso), v.cantiere));
        if (arrivo) ts = new Date(Date.parse(arrivo.ingresso) - Math.max(minuti, 1) * MS).toISOString();
      }
    } else if (v.direzione === 'andata') {
      if (primoIngresso) ts = new Date(Date.parse(primoIngresso) - Math.max(minuti, 1) * MS).toISOString();
    } else if (ultimaUscita) {
      ts = ultimaUscita;
    }

    const evento: EventoCatena = { kind: 'viaggio', ts: ts ?? '', viaggio: v, da, a, ancorato: ts != null };
    if (ts) eventi.push(evento);
    else coda.push(evento);
  }

  const rango = (e: EventoCatena): number => {
    if (e.kind === 'passaggio') return e.passaggio.tipo === 'uscita' ? 5 : 0;
    if (e.kind === 'viaggio') return e.viaggio.daCantiere ? 2 : e.viaggio.direzione === 'andata' ? 1 : 4;
    if (e.kind === 'lavoro') return 2;
    return 3;
  };

  eventi.sort((x, y) => {
    const d = Date.parse(x.ts) - Date.parse(y.ts);
    if (d !== 0) return d;
    return rango(x) - rango(y);
  });

  return { eventi, coda };
}
