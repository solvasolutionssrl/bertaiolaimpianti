/**
 * Mette in piedi UNA commessa dimostrativa sul tenant vero di Bertaiola.
 *
 * PERCHE' ESISTE: far vedere l'app con l'elenco delle commesse vere davanti
 * vuol dire aprirne una a caso, cioe' il lavoro di un cliente in corso, con
 * dentro il suo nome e il suo telefono. Serviva invece un lavoro finto ma
 * completo — cliente, dettatura del titolare, cose da fare, riunione con il
 * riassunto, foto e un video — che la squadra si trovi assegnato aprendo il
 * telefono, e che a fine dimostrazione sparisca senza lasciare niente.
 *
 * ⚠️ SCRIVE SUL DATABASE DI PRODUZIONE (tenant BER, Bertaiola Impianti) e sul
 * bucket R2 di produzione. In prova non scrive niente: senza `--apply`
 * scarica i media, prepara le miniature e stampa riga per riga cosa farebbe.
 *
 * COSA FA
 *   - Un cliente persona fisica inventato a Valeggio sul Mincio, con nelle
 *     note scritto che e' un dato dimostrativo da eliminare.
 *   - La commessa `BER-DEMO-01`, in corso, con la dettatura del titolare.
 *   - Due cose da fare (una con scadenza, una senza), senza assegnatario.
 *   - Una riunione del 07/10/2026 con trascrizione e riassunto.
 *   - Due foto e un video presi da Wikimedia Commons (licenze libere, elencate
 *     qui sotto), caricati su R2 con la loro miniatura.
 *   - L'assegnazione a TUTTI i tecnici attivi del tenant, piu' l'avviso in app
 *     che ognuno trova sulla campanella.
 *
 * COSA NON FA, DI PROPOSITO
 *   - **Non chiama `genera_codice_commessa`.** Quella funzione brucia il
 *     numero progressivo anche quando poi l'inserimento fallisce, e il
 *     contatore delle commesse vere non deve avere buchi per colpa di una
 *     dimostrazione. Il codice `BER-DEMO-01` e' scelto a mano: sta fuori dallo
 *     schema `BER-26-NNN`, quindi non potra' mai collidere con uno vero.
 *   - **Non crea le cartelle su Nextcloud.** Non servono per far vedere l'app,
 *     e una cartella creata li' non si cancella da qui. I file vivono solo su
 *     R2, e `status='synced'` serve proprio a dire al cron di non andarli a
 *     cercare su Nextcloud (rivendica solo `uploaded|sync_failed|syncing`).
 *   - **Non lascia sha256.** Quel campo, sulle righe vere, vuol dire «byte
 *     verificati contro la copia Nextcloud»: qui quella copia non esiste, e
 *     scriverlo racconterebbe una cosa che non e' successa.
 *   - Non scrive `audit_events` ne' `commessa_versioni`: sono il registro di
 *     cosa hanno fatto le persone, e qui non ha fatto niente nessuno.
 *
 * ⚠️ IL PIENO SCHERMO DI UNA FOTO PASSA DA R2, NON DA NEXTCLOUD
 *   Le gallerie chiedono `/api/media/<id>` quando la riga ha `r2_key`, e
 *   quello firma un indirizzo R2: funziona. La miniatura invece passa sempre
 *   da `/api/photo/<id>?size=thumb`, che senza `r2_thumb_key` ripiegherebbe
 *   sul pieno schermo da Nextcloud — che qui non c'e'. Per questo **ogni**
 *   media di questo script ha la sua miniatura, video compreso: senza, la
 *   galleria del video riceve 404 e mostra il segnaposto.
 *
 * USO
 *   pnpm tsx scripts/demo/crea-commessa-demo.ts            # prova, non scrive
 *   pnpm tsx scripts/demo/crea-commessa-demo.ts --apply    # scrive davvero
 *   … --media=/percorso/cartella   # dove tenere i file scaricati
 *
 * POI
 *   `pnpm tsx scripts/demo/togli-commessa-demo.ts --apply` toglie tutto.
 */
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createClient } from '@supabase/supabase-js';
import { componiAssegnazione } from '../../packages/api/src/avvisi';
import sharp from 'sharp';

import {
  R2StorageProvider,
  buildR2Key,
  getR2ProviderFromTenantConfig,
} from '../../packages/integrations/src/storage/r2';

const QUI = dirname(fileURLToPath(import.meta.url));
const RADICE = resolve(QUI, '../..');
const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1];
const flag = (n: string) => process.argv.includes(`--${n}`);

// ---------------------------------------------------------------------------
// Chi e cosa
// ---------------------------------------------------------------------------

/** Il tenant si risolve per sigla: nessun uuid scritto a mano, mai. */
const SLUG = 'BER';

/**
 * Il codice interno, scelto a mano.
 *
 * ⚠️ Il prefisso `BER-DEMO-` sta fuori dallo schema dei codici veri
 * (`BER-26-NNN`, generati dal contatore): cosi' questa riga non potra' mai
 * collidere con una commessa aperta fra sei mesi, e si riconosce a occhio in
 * mezzo alle altre duecento.
 */
const CODICE = 'BER-DEMO-01';

/** Chi «apre» il lavoro. Si risolve per nome, non per uuid. */
const NOME_RESPONSABILE = 'Mauro Bertaiola';

/** Il titolo del lavoro: diventa anche il nome della cartella, quindi corto. */
const DESCRIZIONE_FINALE = 'Sostituzione caldaia a condensazione';

/** Quello che l'AI aveva proposto prima che il titolare lo accorciasse. */
const DESCRIZIONE_PROPOSTA = 'Sostituzione caldaia e termostato comandabile dal telefono';

const DATA_APERTURA = '2026-10-06';
const DATA_RIUNIONE = '2026-10-07';

/**
 * Il marcatore che rende riconoscibile il cliente finto.
 *
 * Serve a `togli-commessa-demo.ts`: cancellare un'anagrafica cliente e'
 * irreversibile, e si fa solo su una riga che dice di se stessa di essere finta.
 */
const NOTE_CLIENTE =
  'Dato dimostrativo creato il 08/10/2026 per far vedere l’app. ' +
  'Da eliminare subito dopo la dimostrazione con scripts/demo/togli-commessa-demo.ts. ' +
  'Persona inventata, indirizzo e numero non riferibili a nessuno.';

/**
 * Il cliente.
 *
 * ⚠️ Nome **inventato** e numero **non assegnabile** (`045 0000000`): un
 * recapito plausibile su una scheda dimostrativa e' un recapito che prima o
 * poi qualcuno chiama.
 */
const CLIENTE = {
  ragione_sociale: 'Elena Vallerini',
  tipo: 'persona_fisica' as const,
  indirizzo: 'Via Borghetto 12',
  citta: 'Valeggio sul Mincio',
  cap: '37067',
  provincia: 'VR',
  telefoni: ['045 0000000'],
  email: [] as string[],
  note: NOTE_CLIENTE,
};

const INDIRIZZO_CANTIERE = 'Via Borghetto 12, 37067 Valeggio sul Mincio (VR)';

/** La dettatura del titolare al telefono: parlato, non una scheda compilata. */
const NOTE_INIZIALI = [
  'Allora, ha telefonato la signora Vallerini di Valeggio, quella della villetta su via Borghetto.',
  'Dice che la caldaia ogni tanto si blocca e resta senza acqua calda, e comunque è roba di più di vent’anni fa.',
  'Le ho detto che conviene passare a una a condensazione, così recupera anche sul gas.',
  'Quando andiamo a vedere controlliamo lo scarico fumi, che non so se è a norma, e lei vorrebbe anche il termostato che si comanda dal telefono.',
  'Chiede se si riesce a farlo prima che arrivi il freddo.',
].join(' ');

/**
 * Le due cose da fare.
 *
 * ⚠️ Nessuna delle due ha un assegnatario: senza, restano «da fare» della
 * commessa e le vedono tutti i tecnici assegnati — che e' il punto della
 * dimostrazione.
 * ⚠️ `priorita` non scrive mai `media`: e' ancora nell'elenco Postgres ma e'
 * dismessa (era il valore di chi non sceglieva). Si usano urgente/alta/bassa.
 */
const TODO = [
  {
    titolo: 'Ordinare la caldaia a condensazione e il kit scarico fumi',
    descrizione: 'Sentire il fornitore per la disponibilità: serve in cantiere entro la settimana prossima.',
    priorita: 'alta' as const,
    /** Domani a mezzogiorno, ora di Roma. */
    scadenza_at: '2026-10-08T12:00:00+02:00',
    sort_order: 0,
  },
  {
    titolo: 'Portare la vecchia caldaia in discarica',
    descrizione: 'A fine posa, insieme allo smaltimento degli imballi.',
    priorita: 'bassa' as const,
    scadenza_at: null,
    sort_order: 1,
  },
];

/**
 * La riunione.
 *
 * ⚠️ `reportino_modello` e `reportino_generato_at` restano vuoti: il riassunto
 * qui sotto l'ha scritto una persona, non un modello. Riempire quei campi
 * direbbe il contrario, e comunque nessuna schermata li mostra.
 */
const RIUNIONE = {
  titolo: 'Sopralluogo dalla signora Vallerini',
  corpo_libero: [
    'Caldaia attuale a camera stagna, murata in lavanderia, targa illeggibile ma è del 2004.',
    'Scarico fumi a parete, da rifare con il kit coassiale: il passaggio c’è già.',
    'Impianto a radiatori in ghisa, sette elementi, nessuna valvola termostatica.',
    'Contatore gas esterno, allaccio a vista: niente da spostare.',
  ].join('\n'),
  trascrizione: [
    'Allora siamo qui dalla signora, la caldaia è questa in lavanderia.',
    'È una camera stagna, la targa non si legge più ma dai documenti è del 2004, quindi ventidue anni.',
    'Lo scarico va a parete, il foro c’è già e il passaggio è buono, rifacciamo tutto con il coassiale nuovo.',
    'I radiatori sono in ghisa, quelli vecchi pesanti, e non hanno le valvole termostatiche: glielo diciamo che conviene metterle, costa poco adesso che siamo dentro.',
    'Il contatore è fuori sul muro, l’allaccio è a vista, non c’è niente da spostare.',
    'La signora chiede se si riesce entro il mese, le ho detto che dipende da quando arriva la caldaia.',
    'Ultima cosa, vuole il termostato che si comanda dal telefono: le ho fatto vedere quello che montiamo di solito e le va bene.',
  ].join(' '),
  reportino: [
    'Sopralluogo del 7 ottobre, villetta a Valeggio sul Mincio.',
    '',
    '• Caldaia esistente: a camera stagna del 2004, in lavanderia. Da sostituire.',
    '• Scarico fumi: a parete, foro e passaggio già presenti. Si rifà con kit coassiale nuovo.',
    '• Impianto: radiatori in ghisa senza valvole termostatiche. Proposto di montarle durante l’intervento.',
    '• Allaccio gas: contatore esterno a vista, nessuno spostamento necessario.',
    '• Termostato: la cliente vuole quello comandabile dal telefono, modello confermato in loco.',
    '',
    'Tempi: la cliente chiede entro il mese. Il vincolo vero è la consegna della caldaia dal fornitore.',
  ].join('\n'),
};

// ---------------------------------------------------------------------------
// I media — Wikimedia Commons, licenze libere
// ---------------------------------------------------------------------------

interface MediaDemo {
  /** Come si chiama nella cartella di appoggio. */
  locale: string;
  /** Indirizzo diretto del file (senza i parametri di tracciamento). */
  url: string;
  /** Pagina di descrizione: li' sta l'attribuzione per esteso. */
  pagina: string;
  licenza: string;
  autore: string;
  mime: string;
  momento: 'sopralluogo' | 'in_corso' | 'finale';
  /** Quando sarebbe stata scattata (ora di Roma). */
  scattataIso: string;
  /**
   * Solo per il video: il fotogramma da cui ricavare l'anteprima.
   * Wikimedia le genera da se' sotto `/thumb/.../NNNpx--<nomefile>.jpg`, ed e'
   * un fotogramma vero del filmato — meglio di un riquadro inventato.
   */
  poster?: { locale: string; url: string };
  /**
   * Solo per il video: in cosa va convertito prima di salire.
   *
   * ⚠️ Serve, non e' una rifinitura. Wikimedia Commons tiene i filmati in
   * WebM, e su iPhone il WebM si riproduce solo da Safari 17.4 in avanti —
   * cioe' su una parte dei telefoni della squadra si vedrebbe un riquadro
   * nero. L'H.264 in un contenitore mp4 lo legge qualunque telefono in
   * circolazione, ed e' anche cio' che registrano i telefoni stessi: il file
   * finisce identico a quelli veri.
   */
  convertiIn?: { estensione: string; mime: string; secondiMax: number };
}

const MEDIA: MediaDemo[] = [
  {
    locale: 'caldaia-esistente.jpg',
    url: 'https://upload.wikimedia.org/wikipedia/commons/9/90/Calderacondensaci%C3%B3.JPG',
    pagina: 'https://commons.wikimedia.org/wiki/File:Calderacondensaci%C3%B3.JPG',
    licenza: 'CC BY-SA 3.0',
    autore: 'Chixoy (Wikimedia Commons)',
    mime: 'image/jpeg',
    momento: 'sopralluogo',
    scattataIso: '2026-10-07T09:12:00+02:00',
  },
  {
    locale: 'caldaia-nuova-collettore.jpg',
    url: 'https://upload.wikimedia.org/wikipedia/commons/8/86/ModCon_boiler_system.jpg',
    pagina: 'https://commons.wikimedia.org/wiki/File:ModCon_boiler_system.jpg',
    licenza: 'CC BY-SA 3.0',
    autore: 'Audetat (Wikimedia Commons)',
    mime: 'image/jpeg',
    momento: 'in_corso',
    scattataIso: '2026-10-07T11:40:00+02:00',
  },
  {
    locale: 'sostituzione-caldaia.webm',
    url: 'https://upload.wikimedia.org/wikipedia/commons/3/3b/USAG_Okinawa_DPW_replaces_boiler_%281021189%29.webm',
    pagina: 'https://commons.wikimedia.org/wiki/File:USAG_Okinawa_DPW_replaces_boiler_(1021189).webm',
    licenza: 'Pubblico dominio (opera del governo statunitense)',
    autore: 'U.S. Army Garrison Okinawa — Natalie Stanley',
    // Il mime che finisce a database e' quello DOPO la conversione.
    mime: 'video/mp4',
    convertiIn: { estensione: '.mp4', mime: 'video/mp4', secondiMax: 40 },
    momento: 'in_corso',
    scattataIso: '2026-10-07T11:55:00+02:00',
    poster: {
      locale: 'poster-video.jpg',
      url:
        'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3b/' +
        'USAG_Okinawa_DPW_replaces_boiler_%281021189%29.webm/' +
        '960px--USAG_Okinawa_DPW_replaces_boiler_%281021189%29.webm.jpg',
    },
  },
];

/** Wikimedia pretende che chi scarica si presenti. Niente email di nessuno. */
const UA = 'KommessaDemoScript/1.0 (+https://bertaiolaimpianti.vercel.app)';

// ---------------------------------------------------------------------------
// Convenzioni copiate dall'app (e perche' sono copiate)
// ---------------------------------------------------------------------------

/**
 * Le sotto-cartelle per momento, come in `api/upload/media/init/route.ts`.
 * Finiscono in `file_refs.path`, che e' il percorso di destinazione Nextcloud.
 */
const CARTELLA_MOMENTO = {
  sopralluogo: 'Sopralluogo',
  in_corso: 'In corso',
  finale: 'Finali',
} as const;

/** `01_Richieste`: la cartella di stato in cui nasce ogni commessa. */
const CARTELLA_STATO = '01_Richieste';

/**
 * NFD, via gli accenti, via tutto cio' che non e' lettera o cifra, taglio a 40.
 * Copia di `sanitize()` in `_actions/crea-commessa.ts`: li' e' una funzione
 * privata di una server action, non importabile da uno script.
 */
function sanitizza(input: string, max = 40): string {
  return input
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^A-Za-z0-9]+/g, '')
    .slice(0, max);
}

/**
 * La chiave della miniatura, derivata da quella dell'originale.
 *
 * ⚠️ Copia di `deriveThumbKey()` (`apps/web/app/_lib/thumbnails.ts`): quel file
 * importa `server-only` e il client Supabase di servizio, quindi da uno script
 * non si carica. Se li' cambia la forma va cambiata anche qui — sono tre
 * righe, ma sono la stessa regola scritta due volte.
 */
function derivaChiaveThumb(r2Key: string, fileRefId: string): string {
  const shortId = fileRefId.replace(/-/g, '').slice(0, 8);
  const parti = r2Key.split('/');
  if (parti.length < 2) return `${r2Key}.thumb.webp`;
  return `${parti.slice(0, -1).join('/')}/thumbs/${shortId}.webp`;
}

/**
 * Il nome file come lo genera l'app: `AAAAMMGG_hhmmss_xxxxxx.est`.
 * Gli altri 346 file di BER sono fatti cosi'; una foto chiamata
 * «caldaia-esistente.jpg» in mezzo a loro si riconoscerebbe come posticcia.
 */
function nomeFileApp(quando: Date, estensione: string): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const ts =
    `${quando.getFullYear()}${p(quando.getMonth() + 1)}${p(quando.getDate())}` +
    `_${p(quando.getHours())}${p(quando.getMinutes())}${p(quando.getSeconds())}`;
  return `${ts}_${randomUUID().slice(0, 6)}${estensione}`;
}

// ---------------------------------------------------------------------------
// Attrezzi
// ---------------------------------------------------------------------------

function env(): Record<string, string> {
  const raw = readFileSync(resolve(RADICE, 'apps/web/.env.local'), 'utf8');
  const out: Record<string, string> = {};
  for (const riga of raw.split('\n')) {
    if (!riga || riga.startsWith('#') || !riga.includes('=')) continue;
    const i = riga.indexOf('=');
    out[riga.slice(0, i).trim()] = riga
      .slice(i + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
  }
  return out;
}

/** Scarica solo se manca: riscaricare 14 MB a ogni prova non serve a nessuno. */
async function scarica(url: string, dove: string): Promise<Buffer> {
  if (existsSync(dove) && statSync(dove).size > 0) return readFileSync(dove);
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`scaricamento fallito (${res.status}): ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(dove, buf);
  return buf;
}

/**
 * Da WebM a mp4 H.264, tagliato ai primi secondi.
 *
 * ⚠️ `-movflags +faststart` non e' cosmetico: sposta l'indice all'inizio del
 * file, e senza quello un telefono deve scaricare tutto il filmato prima di
 * mostrare il primo fotogramma. Su una rete di cantiere vuol dire un tasto
 * che sembra rotto.
 *
 * `-pix_fmt yuv420p` perche' i profili 4:2:2 o 4:4:4 non li decodifica
 * l'hardware degli iPhone, e si cade su un riquadro nero senza nessun errore.
 *
 * Il taglio a pochi secondi e' una scelta da dimostrazione: un filmato di tre
 * minuti su una scheda di prova nessuno lo guarda fino in fondo, e sono
 * megabyte che attraversano la rete di tutti.
 */
async function inMp4PerTelefono(
  sorgente: string,
  destinazione: string,
  secondiMax: number,
): Promise<Buffer> {
  if (existsSync(destinazione) && statSync(destinazione).size > 0) {
    return readFileSync(destinazione);
  }
  const esito = spawnSync(
    'ffmpeg',
    [
      '-y',
      '-i', sorgente,
      '-t', String(secondiMax),
      '-c:v', 'libx264',
      '-preset', 'medium',
      '-crf', '26',
      '-pix_fmt', 'yuv420p',
      // Altezza pari: l'H.264 non accetta dimensioni dispari e fallirebbe con
      // un messaggio che non dice questo.
      '-vf', "scale='min(1280,iw)':-2",
      '-c:a', 'aac',
      '-b:a', '96k',
      '-movflags', '+faststart',
      destinazione,
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );
  if (esito.status !== 0) {
    const errore = String(esito.stderr ?? '').trim().split('\n').slice(-3).join(' ');
    throw new Error(
      `conversione del video non riuscita (serve ffmpeg nel PATH): ${errore || 'esito ' + esito.status}`,
    );
  }
  return readFileSync(destinazione);
}

/** 400x400 webp: la stessa resa di `generateAndUploadThumb()`. */
async function miniatura(buf: Buffer): Promise<Buffer> {
  return sharp(buf, { failOn: 'none' })
    .rotate() // rispetta l'orientamento EXIF
    .resize(400, 400, { fit: 'cover', position: 'centre' })
    .webp({ quality: 75 })
    .toBuffer();
}

const kb = (n: number) => `${(n / 1024).toFixed(0)} KB`;
const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;

// ---------------------------------------------------------------------------
// Il lavoro
// ---------------------------------------------------------------------------

async function main() {
  const applica = flag('apply');
  const cartellaMedia = resolve(
    (arg('media') ?? join(tmpdir(), 'kommessa-demo-media')).replace(/^~/, process.env.HOME ?? '~'),
  );
  mkdirSync(cartellaMedia, { recursive: true });

  const e = env();
  const url = e['NEXT_PUBLIC_SUPABASE_URL'];
  const key = e['SUPABASE_SERVICE_ROLE_KEY'];
  if (!url || !key) {
    console.error('Mancano NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY in apps/web/.env.local');
    process.exit(1);
  }
  const db = createClient(url, key, { auth: { persistSession: false } });

  console.log(
    applica
      ? '\n*** SCRIVO DAVVERO sul tenant di PRODUZIONE BER ***\n'
      : '\n--- PROVA: non scrivo niente, né sul database né su R2 (aggiungi --apply) ---\n',
  );

  // ----- 1) Il tenant, sempre per sigla ------------------------------------
  const { data: tenantRaw, error: tErr } = await db
    .from('tenants')
    .select('id, slug, nome, r2_config')
    .eq('slug', SLUG)
    .maybeSingle();
  if (tErr || !tenantRaw) {
    console.error(`Nessuno spazio di lavoro con sigla ${SLUG}: ${tErr?.message ?? 'non trovato'}`);
    process.exit(1);
  }
  const tenant = tenantRaw as unknown as {
    id: string;
    slug: string;
    nome: string;
    r2_config: Record<string, unknown> | null;
  };
  console.log(`Spazio di lavoro: ${tenant.nome} (${tenant.slug})`);

  // ----- 2) Il codice è libero? --------------------------------------------
  const { data: gia } = await db
    .from('commesse')
    .select('id')
    .eq('tenant_id', tenant.id)
    .eq('codice_interno', CODICE)
    .maybeSingle();
  if (gia) {
    console.error(
      `\n✗ ${CODICE} esiste già (${(gia as { id: string }).id}).\n` +
        '  Prima toglila: pnpm tsx scripts/demo/togli-commessa-demo.ts --apply\n',
    );
    process.exit(1);
  }

  // ----- 3) Chi apre il lavoro ---------------------------------------------
  const { data: respRaw } = await db
    .from('users')
    .select('id, display_name, role')
    .eq('tenant_id', tenant.id)
    .eq('display_name', NOME_RESPONSABILE)
    .maybeSingle();
  const responsabile = respRaw as { id: string; display_name: string; role: string } | null;
  if (!responsabile) {
    console.error(`\n✗ Nessun utente «${NOME_RESPONSABILE}» su ${SLUG}: senza di lui non so chi apre il lavoro.\n`);
    process.exit(1);
  }
  console.log(`Apre il lavoro: ${responsabile.display_name} (${responsabile.role})`);

  // ----- 4) A chi va assegnata ---------------------------------------------
  // Tutti i tecnici attivi, risolti dalla query: un elenco scritto a mano
  // invecchia il giorno dopo che entra qualcuno di nuovo.
  const { data: tecRaw, error: tecErr } = await db
    .from('users')
    .select('id, display_name')
    .eq('tenant_id', tenant.id)
    .eq('role', 'tecnico')
    .eq('attivo', true)
    .order('display_name');
  if (tecErr) {
    console.error(`Lettura tecnici fallita: ${tecErr.message}`);
    process.exit(1);
  }
  const tecnici = (tecRaw ?? []) as { id: string; display_name: string | null }[];
  if (tecnici.length === 0) {
    console.error('\n✗ Nessun tecnico attivo: la commessa non andrebbe a nessuno.\n');
    process.exit(1);
  }
  console.log(`Tecnici attivi da assegnare: ${tecnici.length}`);
  for (const t of tecnici) console.log(`   · ${t.display_name ?? t.id}`);

  // ----- 5) Il cliente ------------------------------------------------------
  // Si riusa se c'è già: una prova interrotta a metà non deve lasciare due
  // «Elena Vallerini» in anagrafica.
  const { data: cliGia } = await db
    .from('clienti')
    .select('id')
    .eq('tenant_id', tenant.id)
    .eq('ragione_sociale', CLIENTE.ragione_sociale)
    .maybeSingle();

  let clienteId = (cliGia as { id: string } | null)?.id ?? null;
  console.log(
    `\nCliente: ${CLIENTE.ragione_sociale} · ${CLIENTE.indirizzo}, ${CLIENTE.cap} ${CLIENTE.citta} (${CLIENTE.provincia}) · ${CLIENTE.telefoni[0]}` +
      (clienteId ? '  [esiste già, lo riuso]' : '  [da creare]'),
  );

  if (applica && !clienteId) {
    const { data: creato, error: cErr } = await db
      .from('clienti')
      .insert({ tenant_id: tenant.id, ...CLIENTE })
      .select('id')
      .single();
    if (cErr || !creato) {
      console.error(`✗ Cliente non creato: ${cErr?.message ?? 'errore'}`);
      process.exit(1);
    }
    clienteId = (creato as { id: string }).id;
    console.log(`  ✓ creato (${clienteId})`);
  }

  // ----- 6) Nome cartella e percorso ---------------------------------------
  const nomeCartella = [
    CODICE,
    sanitizza(CLIENTE.ragione_sociale) || 'Cliente',
    sanitizza(DESCRIZIONE_FINALE) || 'Commessa',
  ].join('_');
  const cloudFolderPath = `/${CARTELLA_STATO}/${nomeCartella}/`;

  console.log(`\nCommessa: ${CODICE} · ${DESCRIZIONE_FINALE} · stato «in corso»`);
  console.log(`  cartella: ${nomeCartella}`);
  console.log(`  percorso: ${cloudFolderPath}  (solo scritto a database: su Nextcloud NON si crea niente)`);

  let commessaId: string | null = null;
  if (applica) {
    const { data: com, error: comErr } = await db
      .from('commesse')
      .insert({
        tenant_id: tenant.id,
        cliente_id: clienteId!,
        codice_interno: CODICE,
        nome_cartella: nomeCartella,
        cloud_folder_path: cloudFolderPath,
        cliente_indirizzo_cantiere: INDIRIZZO_CANTIERE,
        descrizione_ai_proposta: DESCRIZIONE_PROPOSTA,
        descrizione_ai_finale: DESCRIZIONE_FINALE,
        // «in corso» e non «aperta»: è lo stato che la fa comparire nella
        // sezione più visibile della scrivania, «Commesse in lavorazione».
        stato: 'in_corso',
        responsabile_id: responsabile.id,
        data_apertura: DATA_APERTURA,
        note_iniziali: NOTE_INIZIALI,
        is_critica: false,
      })
      .select('id')
      .single();
    if (comErr || !com) {
      console.error(`✗ Commessa non creata: ${comErr?.message ?? 'errore'}`);
      process.exit(1);
    }
    commessaId = (com as { id: string }).id;
    console.log(`  ✓ creata (${commessaId})`);
  }

  // ----- 7) Le cose da fare -------------------------------------------------
  console.log('\nCose da fare:');
  for (const t of TODO) {
    const quando = t.scadenza_at
      ? new Date(t.scadenza_at).toLocaleString('it-IT', { timeZone: 'Europe/Rome' })
      : 'senza scadenza';
    console.log(`  · [${t.priorita}] ${t.titolo} — ${quando} — non assegnata`);
  }
  if (applica) {
    const { error } = await db.from('commessa_todo').insert(
      TODO.map((t) => ({
        tenant_id: tenant.id,
        commessa_id: commessaId!,
        titolo: t.titolo,
        descrizione: t.descrizione,
        // `stato='aperto'` e `completato_at` vuoto vanno insieme: c'è un
        // vincolo che li tiene appaiati — (stato='completato') = (completato_at non vuoto).
        stato: 'aperto' as const,
        priorita: t.priorita,
        assegnato_a: null,
        scadenza_at: t.scadenza_at,
        sort_order: t.sort_order,
        created_by: responsabile.id,
      })) as never,
    );
    if (error) {
      console.error(`✗ Cose da fare non create: ${error.message}`);
      process.exit(1);
    }
    console.log('  ✓ scritte');
  }

  // ----- 8) La riunione -----------------------------------------------------
  console.log(`\nRiunione del ${DATA_RIUNIONE}: ${RIUNIONE.titolo}`);
  console.log(
    `  trascrizione ${RIUNIONE.trascrizione.length} caratteri · riassunto ${RIUNIONE.reportino.split('\n').length} righe`,
  );
  if (applica) {
    const { error } = await db.from('commessa_riunione' as never).insert({
      tenant_id: tenant.id,
      commessa_id: commessaId!,
      data_riunione: DATA_RIUNIONE,
      titolo: RIUNIONE.titolo,
      corpo_libero: RIUNIONE.corpo_libero,
      trascrizione: RIUNIONE.trascrizione,
      reportino: RIUNIONE.reportino,
      created_by: responsabile.id,
    } as never);
    if (error) {
      console.error(`✗ Riunione non creata: ${error.message}`);
      process.exit(1);
    }
    console.log('  ✓ scritta');
  }

  // ----- 9) I media ---------------------------------------------------------
  console.log(`\nMedia (cartella di appoggio: ${cartellaMedia})`);

  const r2 =
    getR2ProviderFromTenantConfig(tenant.r2_config) ??
    (e['R2_ACCOUNT_ID'] && e['R2_BUCKET'] && e['R2_ACCESS_KEY_ID'] && e['R2_SECRET_ACCESS_KEY']
      ? new R2StorageProvider({
          accountId: e['R2_ACCOUNT_ID']!,
          bucket: e['R2_BUCKET']!,
          accessKeyId: e['R2_ACCESS_KEY_ID']!,
          secretAccessKey: e['R2_SECRET_ACCESS_KEY']!,
          endpoint: e['R2_ENDPOINT'],
        })
      : null);
  if (!r2) {
    console.error('\n✗ R2 non configurato: né su tenants.r2_config né in apps/web/.env.local.\n');
    process.exit(1);
  }
  console.log(
    `  bucket: ${r2.bucket}${tenant.r2_config ? ' (dalla configurazione del tenant)' : ' (da .env.local)'}`,
  );

  for (const m of MEDIA) {
    // ⚠️ L'id si genera QUI, prima della chiave: i primi 8 caratteri dell'id
    // finiscono dentro la chiave R2 e dentro quella della miniatura.
    const fileRefId = randomUUID();
    const scattata = new Date(m.scattataIso);
    const estensione = m.convertiIn?.estensione ?? m.locale.slice(m.locale.lastIndexOf('.'));
    const filename = nomeFileApp(scattata, estensione);

    const scaricato = join(cartellaMedia, m.locale);
    let originale = await scarica(m.url, scaricato);
    if (m.convertiIn) {
      const convertito = scaricato.replace(/\.[^.]+$/, '') + m.convertiIn.estensione;
      const prima = originale.length;
      originale = await inMp4PerTelefono(scaricato, convertito, m.convertiIn.secondiMax);
      console.log(
        `      convertito in ${m.convertiIn.mime}: ${mb(prima)} → ${mb(originale.length)} ` +
          `(primi ${m.convertiIn.secondiMax}s, H.264 per gli iPhone)`,
      );
    }

    // Il fotogramma dell'anteprima: per le foto è la foto stessa, per il video
    // è la miniatura che Wikimedia ricava dal filmato.
    const sorgenteThumb = m.poster
      ? await scarica(m.poster.url, join(cartellaMedia, m.poster.locale))
      : originale;
    const thumb = await miniatura(sorgenteThumb);

    // ⚠️ La chiave che esce ha il codice DUE VOLTE
    // (`.../BER-DEMO-01_BER-DEMO-01_ElenaVallerini_Sostituzionec/...`), perché
    // `buildR2Key` mette il codice davanti e poi il nome cartella, che il
    // codice ce l'ha già dentro. **Non è un errore da aggiustare qui**: è
    // esattamente la forma delle chiavi vere di BER (verificato: ogni riga di
    // `file_refs` ha questa doppia). Una chiave "più pulita" renderebbe questi
    // tre file gli unici diversi da tutti gli altri.
    const r2Key = buildR2Key({
      tenantId: tenant.id,
      // In prova la commessa non esiste: il segnaposto non entra comunque nella
      // chiave, perché con `codiceInterno` valorizzato quello vince.
      commessaId: commessaId ?? '00000000-0000-0000-0000-000000000000',
      fileRefId,
      filename,
      tenantSlug: tenant.slug,
      codiceInterno: CODICE,
      nomeCartella,
      sectionLabel: 'media',
    });
    const thumbKey = derivaChiaveThumb(r2Key, fileRefId);
    const pathNextcloud = [
      cloudFolderPath.replace(/^\/+|\/+$/g, ''),
      'Foto',
      CARTELLA_MOMENTO[m.momento],
      filename,
    ].join('/');

    console.log(`\n  · ${filename}  (${m.momento})`);
    console.log(`      da        ${m.pagina}`);
    console.log(`      licenza   ${m.licenza} — ${m.autore}`);
    console.log(`      originale ${mb(originale.length)}  →  ${r2Key}`);
    console.log(`      anteprima ${kb(thumb.length)}  →  ${thumbKey}`);
    console.log(`      percorso  ${pathNextcloud}`);

    if (!applica) continue;

    await r2.putObject(r2Key, originale, m.mime);
    await r2.putObject(thumbKey, thumb, 'image/webp');

    const { error } = await db.from('file_refs').insert({
      id: fileRefId,
      tenant_id: tenant.id,
      commessa_id: commessaId!,
      // Il campo «Fase» è stato ritirato il 07/10/2026 ed era vuoto su tutti e
      // 346 i file di BER: qui resta vuoto come tutti gli altri.
      voce_id: null,
      momento: m.momento,
      path: pathNextcloud,
      filename,
      mime: m.mime,
      size_bytes: originale.length,
      sha256: null,
      uploaded_by: responsabile.id,
      taken_at: scattata.toISOString(),
      // ⚠️ `synced` è la cosa importante: il cron di sincronizzazione rivendica
      // solo le righe `uploaded|sync_failed|syncing` ferme da un po'. Con
      // `synced` non va a cercare su Nextcloud un file che non c'è.
      status: 'synced',
      r2_key: r2Key,
      r2_thumb_key: thumbKey,
      // Niente aggancio alla riunione: meno righe da pulire domani.
      riunione_id: null,
    } as never);
    if (error) {
      console.error(`      ✗ riga non scritta: ${error.message}`);
      process.exit(1);
    }
    console.log('      ✓ caricato e registrato');
  }

  // ----- 10) Assegnazione + avviso -----------------------------------------
  //
  // ⚠️ Il testo lo compone `componiAssegnazione`, lo stesso modulo che usa
  // `notificaCommessaAssegnata` quando l'ufficio assegna una commessa per
  // davvero. Scriverlo a mano qui vorrebbe dire che l'avviso della
  // dimostrazione **non somiglia** a quelli veri, cioe' far vedere una cosa
  // diversa da quella che si consegna.
  const avviso = componiAssegnazione({
    tipo: 'commessa',
    oggetto: `${CODICE} · ${DESCRIZIONE_FINALE}`,
  });
  console.log(`\nAssegnazione a ${tecnici.length} tecnici, con avviso in app:`);
  console.log(`  «${avviso.titolo}»`);
  console.log(`  «${avviso.corpo}»`);

  if (applica) {
    const { error: aErr } = await db.from('commessa_tecnici').insert(
      tecnici.map((t) => ({
        commessa_id: commessaId!,
        user_id: t.id,
        tenant_id: tenant.id,
        assegnato_da: responsabile.id,
      })) as never,
    );
    if (aErr) {
      console.error(`✗ Assegnazione fallita: ${aErr.message}`);
      process.exit(1);
    }

    // Non si avvisa chi assegna a se stesso: è la stessa regola di
    // `notificaCommessaAssegnata`. Qui non capita (il responsabile non è un
    // tecnico), ma la regola vale lo stesso.
    const destinatari = tecnici.filter((t) => t.id !== responsabile.id);
    const { error: nErr } = await db.from('notifiche').insert(
      destinatari.map((t) => ({
        tenant_id: tenant.id,
        user_id: t.id,
        type: 'commessa_assegnata',
        payload: {
          title: avviso.titolo,
          body: avviso.corpo,
          url: `/mobile/commessa/${commessaId!}`,
          commessa_id: commessaId!,
          actor_user_id: responsabile.id,
        },
      })) as never,
    );
    if (nErr) {
      console.error(`✗ Avvisi non inviati: ${nErr.message}`);
      process.exit(1);
    }
    console.log(`  ✓ ${tecnici.length} assegnazioni, ${destinatari.length} avvisi`);
  }

  // ----- Chiusura -----------------------------------------------------------
  if (applica) {
    console.log(`\n✅ Fatto. La commessa ${CODICE} è in produzione su ${tenant.nome}.`);
    console.log(`   Scrivania: /office/commesse/${commessaId}`);
    console.log('   Per toglierla: pnpm tsx scripts/demo/togli-commessa-demo.ts --apply\n');
  } else {
    console.log('\n--- Fine della prova: non è stato scritto niente. Rilancia con --apply. ---\n');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
