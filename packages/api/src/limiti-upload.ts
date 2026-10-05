/**
 * I limiti di un invio di media: quanti file per volta e quanto può pesare
 * ognuno.
 *
 * **I numeri sono dato, non codice.** Fino al 05/10/2026 i quattro limiti erano
 * costanti scritte dentro il componente di selezione: per alzare il tetto dei
 * file di un cliente serviva un deploy. Ora i valori stanno nel database su due
 * livelli e si cambiano dal pannello super admin.
 *
 * Tre livelli, dal più forte al più debole:
 *
 * | Livello | Dove | Chi lo cambia |
 * |---|---|---|
 * | tetti tecnici | qui sotto, in codice | nessuno |
 * | default globale | `platform_settings` riga `limiti_upload` | super admin, vale per tutti |
 * | override per tenant | `tenants.upload_config` | super admin, dal pannello del tenant |
 *
 * Una chiave assente **eredita** il livello sopra, non azzera: `{}` su un tenant
 * significa "fai come dice il globale", ed è il motivo per cui l'apply della
 * migration non cambia il comportamento di nessuno.
 *
 * I **tetti** non sono una scelta di prodotto, sono un paracadute: fermano il
 * refuso (un `50000` battuto per sbaglio) e lo zero, niente di più. Sono tenuti
 * molto larghi di proposito, perché la scelta di quanto far caricare è del
 * pannello, non di questo file.
 *
 * Due atteggiamenti diversi, ed è voluto:
 *
 * - in **lettura** (`risolviLimitiUpload`) si taglia in silenzio e non si
 *   solleva mai: un dato storto nel database non deve impedire a un tecnico di
 *   caricare le foto del cantiere;
 * - in **scrittura** (`validaLimitiUpload`) si rifiuta e si dice perché:
 *   tagliare di nascosto il numero che un umano ha appena battuto nel pannello
 *   è il modo migliore per fargli credere di aver salvato altro.
 *
 * Puro e deterministico: nessun accesso al database, nessuna data, nessun env.
 */

/** I quattro limiti di un invio, già risolti. */
export interface LimitiUpload {
  /** Quanti file si possono mettere in un invio. */
  maxFile: number;
  /** Peso massimo di una foto, in MB. */
  maxFotoMb: number;
  /** Peso massimo di un video, in MB. */
  maxVideoMb: number;
  /** Peso massimo di un PDF, in MB. */
  maxDocMb: number;
}

/** Gli stessi limiti con le chiavi facoltative: un livello di override. */
export type LimitiUploadParziali = Partial<LimitiUpload>;

/** Le chiavi ammesse. Tutto il resto, in ingresso, viene ignorato. */
export const CHIAVI_LIMITI = ['maxFile', 'maxFotoMb', 'maxVideoMb', 'maxDocMb'] as const;

export type ChiaveLimite = (typeof CHIAVI_LIMITI)[number];

/**
 * Tetti tecnici: il massimo che la pipeline è verificata reggere. Paracadute,
 * non limite di prodotto — vedi il docblock in testa.
 *
 * ⚠️ `maxVideoMb` ha **due bordi sopra di sé**, e quello che conta è il più
 * basso:
 *
 * | Bordo | Dove | Valore |
 * |---|---|---|
 * | apertura dell'upload | `apps/web/app/api/upload/media/init/route.ts` (`MAX_SIZE_BYTES`, nello schema zod) | **2 GiB** |
 * | sync verso Nextcloud | `apps/web/app/_lib/sync-r2-to-nextcloud.ts` (`SYNC_MAX_BUFFER_BYTES`) | 5 GiB |
 *
 * Il vincolante è il primo: un file oltre i 2 GiB fa rispondere `400 Body non
 * valido` all'init, cioè l'utente vedrebbe un errore tecnico su un file che il
 * pannello gli ha appena detto di poter caricare. 2000 MB = 1,86 GiB, quindi
 * ci sta con margine. Alzando questo tetto, alzare PRIMA quel cap.
 */
export const TETTI_UPLOAD: LimitiUpload = {
  maxFile: 500,
  maxFotoMb: 200,
  maxVideoMb: 2000,
  maxDocMb: 500,
};

/** Sotto questi non ha senso: un invio da zero file non è un invio. */
export const MINIMI_UPLOAD: LimitiUpload = {
  maxFile: 1,
  maxFotoMb: 1,
  maxVideoMb: 1,
  maxDocMb: 1,
};

/**
 * Ultima rete, se il database non risponde o non ha ancora la colonna: sono i
 * valori con cui l'app è andata in produzione, col conteggio file portato a 50
 * il 05/10/2026 (era 30).
 */
export const LIMITI_UPLOAD_FALLBACK: LimitiUpload = {
  maxFile: 50,
  maxFotoMb: 25,
  maxVideoMb: 500,
  maxDocMb: 50,
};

/** Etichette per i messaggi d'errore e per il pannello. */
export const ETICHETTE_LIMITI: Record<ChiaveLimite, { nome: string; unita: string }> = {
  maxFile: { nome: 'File per invio', unita: '' },
  maxFotoMb: { nome: 'Peso massimo foto', unita: 'MB' },
  maxVideoMb: { nome: 'Peso massimo video', unita: 'MB' },
  maxDocMb: { nome: 'Peso massimo PDF', unita: 'MB' },
};

function interoPositivo(v: unknown): number | null {
  // Anche una stringa numerica: in lettura si è tolleranti, e un
  // `{"maxFile": "80"}` scritto da SQL veniva ignorato in silenzio facendo
  // sembrare il campo mai impostato.
  const grezzo = typeof v === 'string' ? Number(v.trim()) : v;
  if (typeof grezzo !== 'number' || !Number.isFinite(grezzo)) return null;
  const n = Math.trunc(grezzo);
  return n > 0 ? n : null;
}

/**
 * Legge un `jsonb` qualunque e tiene solo le chiavi note con un numero sensato.
 * Tollerante per scelta: un valore storto si ignora, non fa fallire la lettura.
 */
export function limitiParzialiDaConfig(raw: unknown): LimitiUploadParziali {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const fonte = raw as Record<string, unknown>;
  const out: LimitiUploadParziali = {};
  for (const k of CHIAVI_LIMITI) {
    const n = interoPositivo(fonte[k]);
    if (n !== null) out[k] = n;
  }
  return out;
}

function taglia(valore: number, chiave: ChiaveLimite): number {
  return Math.min(Math.max(valore, MINIMI_UPLOAD[chiave]), TETTI_UPLOAD[chiave]);
}

/**
 * Fonde i livelli — tenant sopra globale, globale sopra fallback — e taglia ai
 * tetti. Non solleva mai: qualunque spazzatura arrivi, torna quattro numeri
 * utilizzabili.
 */
export function risolviLimitiUpload(globale: unknown, tenant: unknown): LimitiUpload {
  const g = limitiParzialiDaConfig(globale);
  const t = limitiParzialiDaConfig(tenant);
  const out = {} as LimitiUpload;
  for (const k of CHIAVI_LIMITI) {
    out[k] = taglia(t[k] ?? g[k] ?? LIMITI_UPLOAD_FALLBACK[k], k);
  }
  return out;
}

/**
 * Le due soglie di avviso del selettore file, ricavate dai limiti in vigore.
 *
 * Non sono limiti: servono a dire "attenzione" prima di arrivare al muro. Si
 * derivano perché restino sensate quando il pannello cambia i numeri — col
 * default di 50 file l'avviso scatta a 40, col video da 500 MB il "grande" è
 * sopra i 200, cioè i valori che l'app ha sempre mostrato.
 *
 * ⚠️ Il pavimento a 1 non è un dettaglio: `floor(1 * 0.8)` fa **0**, e una
 * soglia a zero significa avvisare "quasi al limite" con zero file selezionati
 * e chiamare "grande" qualunque video. Con il limite al minimo si avvisa
 * all'ultimo passo utile, non prima di cominciare.
 */
const QUOTA_AVVISO_NUMERO = 0.8;
const QUOTA_AVVISO_VIDEO = 0.4;

function soglia(valore: number, quota: number): number {
  if (!Number.isFinite(valore) || valore < 1) return 1;
  return Math.max(1, Math.min(Math.trunc(valore), Math.floor(valore * quota)));
}

/** Da quanti file mostrare "ti stai avvicinando al limite". */
export function sogliaAvvisoNumero(maxFile: number): number {
  return soglia(maxFile, QUOTA_AVVISO_NUMERO);
}

/** Sopra quanti MB un video è "grande" e vale la pena avvisare. */
export function sogliaAvvisoVideoMb(maxVideoMb: number): number {
  return soglia(maxVideoMb, QUOTA_AVVISO_VIDEO);
}

export type EsitoValidazione =
  | { ok: true; valori: Record<string, number | null> }
  | { ok: false; errori: string[] };

/**
 * Valida quello che arriva da un form del super admin.
 *
 * Un campo **vuoto** (stringa vuota, spazi, `null`) vale "eredita il livello
 * sopra" ed esce come `null`, così chi scrive sa che deve rimuovere la chiave.
 * Un numero fuori dai tetti viene **rifiutato** con un messaggio che dice il
 * campo e il bordo: nessun taglio silenzioso. Gli errori si raccolgono tutti,
 * perché correggere un campo alla volta a ogni salvataggio è irritante.
 */
export function validaLimitiUpload(input: Record<string, unknown>): EsitoValidazione {
  const valori: Record<string, number | null> = {};
  const errori: string[] = [];

  for (const k of CHIAVI_LIMITI) {
    if (!(k in input)) continue;
    const grezzo = input[k];
    const { nome, unita } = ETICHETTE_LIMITI[k];
    const suffisso = unita ? ` ${unita}` : '';

    if (
      grezzo === null ||
      grezzo === undefined ||
      (typeof grezzo === 'string' && grezzo.trim() === '')
    ) {
      valori[k] = null;
      continue;
    }

    const n = typeof grezzo === 'string' ? Number(grezzo.trim()) : grezzo;
    if (typeof n !== 'number' || !Number.isFinite(n)) {
      errori.push(`${nome}: "${String(grezzo)}" non è un numero.`);
      continue;
    }
    if (!Number.isInteger(n)) {
      errori.push(`${nome}: serve un numero intero, non ${n}.`);
      continue;
    }
    if (n < MINIMI_UPLOAD[k] || n > TETTI_UPLOAD[k]) {
      errori.push(
        `${nome}: ${n}${suffisso} è fuori dai limiti tecnici (da ${MINIMI_UPLOAD[k]} a ${TETTI_UPLOAD[k]}${suffisso}).`,
      );
      continue;
    }
    valori[k] = n;
  }

  return errori.length > 0 ? { ok: false, errori } : { ok: true, valori };
}

/**
 * Applica a un `jsonb` esistente i valori validati: un numero scrive, un `null`
 * **rimuove** la chiave (torna a ereditare).
 *
 * ⚠️ Si parte dall'oggetto **grezzo**, non dal parziale filtrato. La colonna si
 * chiama `upload_config`, non `limiti_upload`: prima o poi qualcuno ci metterà
 * accanto un'altra chiave, e partendo dal filtrato gliela cancellavamo al primo
 * salvataggio di un limite, senza nessun segnale. Si tocca solo ciò che è stato
 * passato — compresi i valori storti di qualcun altro, che restano come sono.
 */
export function applicaLimitiAConfig(
  precedente: unknown,
  valori: Record<string, number | null>,
): Record<string, unknown> {
  const out: Record<string, unknown> =
    precedente && typeof precedente === 'object' && !Array.isArray(precedente)
      ? { ...(precedente as Record<string, unknown>) }
      : {};
  for (const [k, v] of Object.entries(valori)) {
    if (v === null) delete out[k];
    else out[k] = v;
  }
  return out;
}
