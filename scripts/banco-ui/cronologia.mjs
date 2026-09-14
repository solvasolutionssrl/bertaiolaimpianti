/**
 * Banco: cronologia della giornata (ufficio) e riga di correzione (tecnico).
 *
 * Richiede la giornata di prova sul tenant demo DEMOC (nota
 * «PROVA BANCO CRONOLOGIA»): timbrature QR e app, viaggio di andata alla guida,
 * pausa portata a 60 minuti dall'ufficio dopo l'approvazione.
 *
 *   node scripts/banco-ui/cronologia.mjs
 */

import { apriChrome, vaiA, accedi, esito, riepilogo, foto } from './comune.mjs';
import { valuta } from '../banco-upload/cdp.mjs';

const attendi = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Ufficio ─────────────────────────────────────────────────────────────────
{
  const { cdp, chiudi } = await apriChrome({ larghezza: 1440, altezza: 900 });
  try {
    await accedi(cdp, 'kantiere');
    await vaiA(cdp, '/office/kantiere/rapportini');

    const riga = await valuta(
      cdp,
      `(() => {
        const t = (s) => (s || '').replace(/\\s+/g, ' ').trim();
        const chip = [...document.querySelectorAll('button[title]')]
          .find((b) => /Modificata dopo l.approvazione/.test(t(b.textContent)));
        const tr = chip && chip.closest('tr');
        return { chip: !!chip, persona: tr ? t(tr.children[1]?.textContent).slice(0, 60) : null };
      })()`,
    );
    esito(riga.chip, 'nell’elenco la giornata porta «Modificata dopo l’approvazione»', riga.persona ?? '');

    const aperto = await valuta(
      cdp,
      `(() => {
        const t = (s) => (s || '').replace(/\\s+/g, ' ').trim();
        const chip = [...document.querySelectorAll('button[title]')]
          .find((b) => /Modificata dopo l.approvazione/.test(t(b.textContent)));
        const tr = chip && chip.closest('tr');
        const b = tr && tr.querySelector('button[aria-label="Cronologia della giornata"]');
        if (!b) return false;
        b.click();
        return true;
      })()`,
    );
    esito(aperto, 'il tasto cronologia c’è sulla riga');
    await attendi(2500);

    const p = await valuta(
      cdp,
      `(() => {
        const t = (s) => (s || '').replace(/\\s+/g, ' ').trim();
        const d = document.querySelector('[role="dialog"]');
        if (!d) return null;
        const r = d.getBoundingClientRect();
        const titoli = [...d.querySelectorAll('ol li p.font-medium')].map((x) => t(x.textContent));
        return {
          titolo: t(d.querySelector('h2')?.textContent),
          titoli,
          testo: t(d.textContent),
          aDestra: Math.round(r.right) >= window.innerWidth - 1 && r.left > 0,
          cantiereRipetuto: [...d.querySelectorAll('ol li')].filter((li) => /Cantiere Gruppo Aurora/.test(li.textContent || '')).length,
          altezzaPiena: Math.round(r.height) >= window.innerHeight - 2,
          larghezza: Math.round(r.width),
          evidenziate: d.querySelectorAll('.bg-amber-50\\\\/70').length,
        };
      })()`,
    );

    esito(!!p, 'si apre il pannello');
    if (p) {
      esito(p.titolo === 'Cronologia della giornata', 'titolo del pannello', p.titolo);
      esito(p.aDestra && p.altezzaPiena, 'pannello laterale a destra, a tutta altezza', `largo ${p.larghezza}`);
      const attesi = ['Viaggio di andata', 'Inizio turno', 'Inizio pausa', 'Fine pausa', 'Fine turno', 'Pausa aggiunta dall’ufficio'];
      const inOrdine = attesi.every((a, i) => p.titoli.indexOf(a) >= 0 && (i === 0 || p.titoli.indexOf(a) > p.titoli.indexOf(attesi[i - 1])));
      esito(inOrdine, 'la giornata si legge in ordine', p.titoli.join(' → '));
      esito(/Cartello QR/.test(p.testo) && /Dall’app/.test(p.testo), 'dice come: cartello QR e app');
      esito(/Lavoro 8:00 → 7:30/.test(p.testo), 'la modifica dice prima → dopo', (p.testo.match(/Lavoro [0-9:]+ → [0-9:]+/) || [''])[0]);
      esito(/di Ufficio · Nordest Cantieri/.test(p.testo), 'dice chi ha modificato');
      esito(/42 km · 0:40 · alla guida/.test(p.testo), 'il viaggio dice km, tempo e chi guidava');
      esito(p.evidenziate >= 1, 'la modifica dopo l’approvazione è evidenziata', `${p.evidenziate} evidenziate`);
      esito(!/dedotta/.test(p.testo), 'le modalità scritte non risultano «dedotte»');
      esito(p.cantiereRipetuto <= 1, 'con un cantiere solo non lo ripete sotto ogni evento', `${p.cantiereRipetuto} ripetizioni`);
    }
    await foto(cdp, 'cronologia-ufficio');
  } finally {
    await chiudi();
  }
}

// ── Tecnico ─────────────────────────────────────────────────────────────────
{
  const { cdp, chiudi } = await apriChrome({ mobile: true });
  try {
    await accedi(cdp, 'tecnico');
    await vaiA(cdp, '/mobile/kantiere/ore');
    await attendi(1500);
    const m = await valuta(
      cdp,
      `(() => {
        const t = (s) => (s || '').replace(/\\s+/g, ' ').trim();
        const righe = [...document.querySelectorAll('p')].filter((x) => /Corretta dall.ufficio il/.test(t(x.textContent)));
        return { quante: righe.length, testo: righe[0] ? t(righe[0].textContent) : '' };
      })()`,
    );
    esito(m.quante === 1, 'sul telefono una sola riga «Corretta dall’ufficio»', m.testo);
    esito(/ore 8:00 → 7:30/.test(m.testo), 'la riga dice cosa è cambiato, senza tagliarlo', m.testo);
    await foto(cdp, 'cronologia-tecnico');
  } finally {
    await chiudi();
  }
}

riepilogo();
