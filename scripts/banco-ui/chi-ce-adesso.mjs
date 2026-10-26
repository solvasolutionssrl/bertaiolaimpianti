/**
 * Banco: la card «Chi c'è adesso» del cruscotto Kantiere.
 *
 *   node scripts/banco-ui/chi-ce-adesso.mjs
 *
 * ⚠️⚠️ **Il difetto che misura**: con il contenitore virtuale, chi passa il
 * badge al terminale non ha nessuna riga in `timbrature` finché qualcuno non
 * ripartisce la giornata. La card leggeva solo quella tabella, quindi su un
 * cliente che timbra al terminale diceva «nessuno» mentre trenta persone erano
 * al lavoro (misurato su FPM il 26/10/2026).
 *
 * Semina su DEMOC due presenze finte e si ripulisce alla fine:
 *  - **Marco Rinaldi**: badge alle 08:00 e basta → presenza APERTA, il tempo scorre.
 *  - **Luca Fabbri**: 08:00, poi 13:00 con `passo: pause_start` dichiarato dalla
 *    persona → è a mangiare, NON è andato a casa: resta in elenco, col conto fermo.
 *  - **Andrea Pozzi**: 08:00 e 12:00 con `passo: end` dichiarato → finito, NON compare.
 */
import { execSync } from 'node:child_process';
import { apriChrome, vaiA, accedi, esito, riepilogo, foto, clicVero } from './comune.mjs';
import { valuta, finoA } from '../banco-upload/cdp.mjs';

const APERTO = 'c1d00000-0000-4000-8000-000000000001'; // Marco Rinaldi
const PAUSA = 'c1d00000-0000-4000-8000-000000000002'; // Luca Fabbri
const FINITO = 'c1d00000-0000-4000-8000-000000000003'; // Andrea Pozzi
// ⚠️ La disposizione a card si misura solo con parecchie persone: con tre
// righe anche un elenco verticale sembrerebbe a posto.
const ALTRI = [
  'c1d00000-0000-4000-8000-000000000004',
  'c1d00000-0000-4000-8000-000000000005',
  'c1d00000-0000-4000-8000-000000000006',
  'c1d00000-0000-4000-8000-000000000007',
];
const TUTTI = [APERTO, PAUSA, FINITO, ...ALTRI];
const TENANT = `(select tenant_id from dipendenti where id='${APERTO}')`;
const sql = (q) => execSync(`supabase db query --linked "${q.replace(/"/g, '\\"')}"`, { stdio: 'ignore' });
// ⚠️ Il giorno è quello di Roma, mai `current_date` (che è UTC sul server).
const oggiAlle = (hhmm) => `(((now() at time zone 'Europe/Rome')::date::text || ' ${hhmm}')::timestamp at time zone 'Europe/Rome')`;
const badge = (dip, hhmm, passo = null, origine = null) =>
  sql(
    `insert into timbri_grezzi (tenant_id, sorgente, esterno_id, dipendente_id, badge, ts, orologio, tipo, stato, genere, dispositivo, passo, passo_origine)` +
      ` values (${TENANT}, 'timbro', 'banco-'||gen_random_uuid(), '${dip}', 'BANCO', ${oggiAlle(hhmm)}, 'fisso', null, 'valido', 'badge', 'banco',` +
      ` ${passo ? `'${passo}'` : 'null'}, ${origine ? `'${origine}'` : 'null'})`,
  );
const pulisci = () => {
  const lista = TUTTI.map((d) => `'${d}'`).join(',');
  sql(`delete from timbri_grezzi where dipendente_id in (${lista}) and badge='BANCO'`);
  sql(`delete from rapportini where dipendente_id in (${lista}) and data=(now() at time zone 'Europe/Rome')::date`);
};

pulisci();
badge(APERTO, '08:00');
badge(PAUSA, '08:00');
badge(PAUSA, '13:00', 'pause_start', 'person');
badge(FINITO, '08:00');
badge(FINITO, '12:00', 'end', 'person');
ALTRI.forEach((d, i) => badge(d, `0${7 + (i % 2)}:${i % 2 ? '45' : '10'}`));

const { cdp, chiudi } = await apriChrome({ larghezza: 1440, altezza: 950 });
try {
  await accedi(cdp, 'kantiere');
  await vaiA(cdp, '/office/kantiere');
  await finoA(cdp, `document.body.innerText.includes('Personale presente')`, { cosa: 'card Chi c’è adesso', timeoutMs: 30000 });
  // Il conto si scrive solo dopo il primo tick dell'orologio del browser.
  await finoA(cdp, `/\\d+h \\d\\d m?|\\d+m/.test(document.body.innerText)`, { cosa: 'orologio partito', timeoutMs: 15000 }).catch(() => null);

  const vista = await valuta(
    cdp,
    `(() => {
      const t = (s) => (s || '').replace(/\\s+/g, ' ').trim();
      const card = [...document.querySelectorAll('div')].find((d) => /Personale presente/.test(t(d.textContent)) && d.querySelector('a[href*="rapportini?apri="]'));
      if (!card) return { trovata: false, testo: t(document.body.innerText).slice(0, 400) };
      const righe = [...card.querySelectorAll('a[href*="rapportini?apri="]')].map((a) => ({
        href: a.getAttribute('href'),
        testo: t(a.textContent),
      }));
      return { trovata: true, testo: t(card.textContent), righe };
    })()`,
  );
  await foto(cdp, 'chi-ce-adesso');

  esito(vista.trovata, 'la card esiste e ha righe con un collegamento', vista.trovata ? '' : vista.testo);
  const righe = vista.righe ?? [];
  esito(righe.some((r) => /Marco Rinaldi/.test(r.testo)), 'chi ha solo il badge aperto compare', righe.map((r) => r.testo).join(' | '));
  esito(righe.some((r) => /Luca Fabbri/.test(r.testo)), 'chi è in pausa DICHIARATA resta in elenco');
  esito(!righe.some((r) => /Andrea Pozzi/.test(r.testo)), 'chi ha dichiarato FINE GIORNATA non compare');
  esito(/Presenti . cantiere da indicare/i.test(vista.testo ?? ''), 'il gruppo senza cantiere si chiama per quello che è');
  esito(righe.length >= 6, 'ci sono abbastanza persone per misurare la disposizione', `${righe.length} card`);
  // ⚠️ A card, non in colonna: con trenta persone un elenco verticale non finisce più.
  const griglia = await valuta(
    cdp,
    `(() => {
      const ul = [...document.querySelectorAll('ul')].find((u) => u.querySelector('a[href*="rapportini?apri="]'));
      if (!ul) return { trovata: false };
      const cime = new Set([...ul.querySelectorAll('li')].map((li) => Math.round(li.getBoundingClientRect().top)));
      const righe = cime.size;
      const card = ul.querySelectorAll('li').length;
      const alta = Math.round(ul.querySelector('li')?.getBoundingClientRect().height ?? 0);
      return { trovata: true, righe, card, perRiga: Math.round(card / Math.max(1, righe)), alta };
    })()`,
  );
  esito(griglia.perRiga >= 2, 'le persone stanno su più colonne, non una sotto l\u2019altra', JSON.stringify(griglia));
  esito(griglia.alta > 0 && griglia.alta <= 46, 'ogni card è compatta (≤ 46px)', `${griglia.alta}px`);

  const rigaMarco = righe.find((r) => /Marco Rinaldi/.test(r.testo));
  esito(/\d+h \d\d/.test(rigaMarco?.testo ?? ''), 'accanto al nome si legge da quante ore è al lavoro', rigaMarco?.testo ?? '');
  const rigaLuca = righe.find((r) => /Luca Fabbri/.test(r.testo));
  // ⚠️ Nella card compatta si legge «in pausa» con la forchetta accanto: una
  // sola pausa esiste in questo sistema, e il pranzo lo dice l'icona.
  esito(/in pausa/i.test(rigaLuca?.testo ?? ''), 'e di chi è a mangiare si legge che è in pausa', rigaLuca?.testo ?? '');
  // ⚠️ Il conto di chi è in pausa NON deve essere «adesso meno l'inizio»:
  // alle 13:00 si è fermato a 5 ore, e resta lì tutto il pomeriggio.
  esito(/5h 00/.test(rigaLuca?.testo ?? ''), 'in pausa il conto è fermo (5h 00 dalle 08:00 alle 13:00)', rigaLuca?.testo ?? '');

  // Il clic porta alla giornata di quella persona, già aperta.
  esito(
    (rigaMarco?.href ?? '').includes(`rapportini?apri=${APERTO}`),
    'il collegamento punta alla giornata di quella persona',
    rigaMarco?.href ?? '',
  );
  if (rigaMarco) {
    await clicVero(cdp, `document.querySelector('a[href="${rigaMarco.href}"]')`, { attesaMs: 1200 });
    await finoA(cdp, `location.pathname.includes('/rapportini')`, { cosa: 'arrivo su Presenze e ore', timeoutMs: 30000 });
    await finoA(cdp, `document.querySelector('[data-riga]')`, { cosa: 'righe di oggi', timeoutMs: 30000 }).catch(() => null);
    // ⚠️ La riga GIUSTA, non la prima: le righe di oggi sono ordinate per
    // cognome, quindi `querySelector('[data-riga]')` prendeva Fabbri e il
    // controllo passava su una riga che nessuno aveva chiesto di aprire.
    const aperta = await valuta(
      cdp,
      `(() => {
        const righe = [...document.querySelectorAll('tr[data-riga]')];
        const tr = righe.find((r) => /Rinaldi/.test(r.textContent || ''));
        if (!tr) return { riga: false, quante: righe.length };
        const dopo = tr.nextElementSibling;
        const suaProprio = !!dopo && !dopo.hasAttribute('data-riga');
        return {
          riga: true,
          aperta: suaProprio && dopo.textContent.trim().length > 40,
          testo: (dopo?.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 120),
        };
      })()`,
    );
    await foto(cdp, 'chi-ce-adesso-dropdown');
    esito(aperta.riga && aperta.aperta, 'si atterra con il dettaglio della giornata GIÀ APERTO', aperta.testo ?? '');
  }
} finally {
  pulisci();
  chiudi();
}
riepilogo();
