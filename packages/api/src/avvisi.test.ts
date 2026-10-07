import { describe, expect, it } from 'vitest';

import {
  AVVISI,
  avvisiPerRuolo,
  avvisoAmmesso,
  componiAssegnazione,
  etichettaAvviso,
  pushAttiva,
} from './avvisi';

describe('il catalogo', () => {
  it('ogni voce ha etichetta, spiegazione e almeno un mestiere', () => {
    for (const a of AVVISI) {
      expect(a.etichetta.length).toBeGreaterThan(3);
      // ⚠️ Senza il «quando», chi legge il pannello non sa cosa sta spegnendo.
      expect(a.quando.length).toBeGreaterThan(10);
      expect(a.ruoli.length).toBeGreaterThan(0);
    }
  });

  it('nessun codice ripetuto', () => {
    const codici = AVVISI.map((a) => a.codice);
    expect(new Set(codici).size).toBe(codici.length);
  });

  it('non mostra mai il codice grezzo a schermo', () => {
    expect(etichettaAvviso('commessa_assegnata')).toBe('Commesse affidate a me');
    expect(etichettaAvviso('cosa_mai_vista')).toBe('Avviso');
    expect(etichettaAvviso('')).toBe('Avviso');
  });
});

describe('chi riceve cosa', () => {
  it('il tecnico riceve lavori, cose da fare, settimana ed esiti — non le approvazioni', () => {
    const suoi = avvisiPerRuolo('tecnico').map((a) => a.codice);
    expect(suoi).toContain('commessa_assegnata');
    expect(suoi).toContain('todo_assegnato');
    expect(suoi).toContain('pianificazione_pubblicata');
    expect(suoi).toContain('permesso_esito');
    // Un avviso per una cosa che non puoi fare è un telefono che squilla.
    expect(suoi).not.toContain('permesso_richiesto');
  });

  it('l’ufficio riceve anche le richieste da approvare', () => {
    expect(avvisiPerRuolo('office').map((a) => a.codice)).toContain('permesso_richiesto');
    expect(avvisiPerRuolo('admin').map((a) => a.codice)).toContain('permesso_richiesto');
  });

  it('un mestiere che non conosciamo non riceve niente', () => {
    // Il ruolo `cliente` esiste nell'enum ma il portale è chiuso dal 16/09:
    // non deve ricevere avvisi dello staff per il solo fatto di esistere.
    expect(avvisiPerRuolo('cliente')).toEqual([]);
    expect(avvisiPerRuolo('')).toEqual([]);
    expect(avvisoAmmesso('commessa_assegnata', 'cliente')).toBe(false);
  });

  it('un codice che non esiste non è ammesso a nessuno', () => {
    expect(avvisoAmmesso('ticket_assigned', 'tecnico')).toBe(false);
    expect(avvisoAmmesso('commessa_assigned', 'tecnico')).toBe(false);
  });
});

describe('pushAttiva', () => {
  it('senza una scelta vale il predefinito del mestiere', () => {
    expect(pushAttiva('commessa_assegnata', 'tecnico')).toBe(true);
    expect(pushAttiva('commessa_assegnata', 'tecnico', null)).toBe(true);
    expect(pushAttiva('commessa_assegnata', 'tecnico', undefined)).toBe(true);
  });

  it('la scelta della persona vince sul predefinito', () => {
    expect(pushAttiva('commessa_assegnata', 'tecnico', false)).toBe(false);
    expect(pushAttiva('todo_assegnato', 'tecnico', false)).toBe(false);
  });

  it('⭐ ma non può riaprire una porta chiusa dal mestiere', () => {
    // Una riga in tabella scritta quando la persona era in ufficio non deve
    // far arrivare a un tecnico le richieste da approvare.
    expect(pushAttiva('permesso_richiesto', 'tecnico', true)).toBe(false);
    expect(pushAttiva('permesso_richiesto', 'office', true)).toBe(true);
  });

  it('un codice sconosciuto non parte, qualunque cosa dica la tabella', () => {
    expect(pushAttiva('dico_mancante', 'tecnico', true)).toBe(false);
  });
});

describe('componiAssegnazione', () => {
  it('dice cosa è successo nel titolo e di cosa si tratta nel corpo', () => {
    const c = componiAssegnazione({ tipo: 'commessa', oggetto: 'Zanetti Paolo — Caldaia' });
    expect(c.titolo).toBe('Ti è stato affidato un lavoro');
    expect(c.corpo).toContain('Zanetti Paolo');
  });

  it('⭐ il corpo dice cosa, per chi e dove', () => {
    const r = componiAssegnazione({
      tipo: 'richiesta',
      oggetto: 'Cambio caldaia',
      cliente: 'Rossi Mario',
      dove: 'Via Roma 12, Valeggio sul Mincio',
    });
    expect(r.corpo).toBe('Cambio caldaia · Rossi Mario · Via Roma 12, Valeggio sul Mincio');
  });

  it('⚠️ niente «Apri per…»: quello spazio è indirizzo che non si legge', () => {
    const r = componiAssegnazione({
      tipo: 'richiesta',
      oggetto: 'Cambio caldaia',
      cliente: 'Rossi Mario',
    });
    expect(r.corpo).not.toContain('Apri per');
  });

  it('quello che non si sa non lascia separatori a vuoto', () => {
    const r = componiAssegnazione({
      tipo: 'richiesta',
      oggetto: 'Cambio caldaia',
      cliente: '   ',
      dove: null,
    });
    expect(r.corpo).toBe('Cambio caldaia');
  });

  it('su una cosa da fare il codice della commessa viene prima del cliente', () => {
    // Chi lavora su piu' commesse si orienta col codice: e' la prima cosa che
    // cerca, e sulla schermata bloccata ci stanno poche parole.
    const t = componiAssegnazione({
      tipo: 'todo',
      oggetto: 'Portare la pompa',
      codiceCommessa: 'BER-26-209',
      cliente: 'Bianchi Anna',
      dove: 'Via Verdi 4',
    });
    expect(t.corpo).toBe('Portare la pompa · BER-26-209 · Bianchi Anna · Via Verdi 4');
  });

  it('la cosa da fare porta con sé il codice della commessa', () => {
    const t = componiAssegnazione({
      tipo: 'todo',
      oggetto: 'Ordinare il kit di raccordi',
      codiceCommessa: 'BER-26-012',
    });
    expect(t.titolo).toContain('cosa da fare');
    expect(t.corpo).toContain('Ordinare il kit');
    expect(t.corpo).toContain('BER-26-012');
  });

  it('la richiesta si riconosce dal titolo', () => {
    const r = componiAssegnazione({ tipo: 'richiesta', oggetto: 'Caldaia in blocco, signora Elena' });
    expect(r.titolo).toContain('richiesta');
    expect(r.corpo).toContain('Caldaia in blocco');
  });

  it('senza oggetto non lascia una riga vuota', () => {
    for (const tipo of ['commessa', 'todo', 'richiesta'] as const) {
      const a = componiAssegnazione({ tipo, oggetto: '   ' });
      expect(a.titolo.length).toBeGreaterThan(5);
      expect(a.corpo.length).toBeGreaterThan(5);
      expect(a.corpo.startsWith(' ·')).toBe(false);
      expect(a.corpo).not.toContain('·  ·');
    }
  });

  it('il titolo sta sotto i quaranta caratteri, dove iOS taglia', () => {
    for (const tipo of ['commessa', 'todo', 'richiesta'] as const) {
      const a = componiAssegnazione({ tipo, oggetto: 'X'.repeat(200) });
      expect(a.titolo.length).toBeLessThanOrEqual(40);
    }
  });
});
