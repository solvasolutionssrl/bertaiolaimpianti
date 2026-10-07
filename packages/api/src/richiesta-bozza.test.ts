import { describe, it, expect } from 'vitest';

import { payloadBozzaDaRichiesta, DESCRIZIONE_MAX } from './richiesta-bozza';

const base = {
  id: 'todo-1',
  titolo: 'Cambio caldaia',
  descrizione: null,
  contatto: null,
  clienteId: null,
  clienteTesto: null,
  clienteLabel: null,
};

describe('payloadBozzaDaRichiesta', () => {
  it('cliente in anagrafica: si collega per id', () => {
    const p = payloadBozzaDaRichiesta({
      ...base,
      clienteId: 'cli-9',
      clienteLabel: 'Rossi Elena',
    });
    expect(p.clienteId).toBe('cli-9');
    expect(p.clienteNew).toBeUndefined();
    expect(p._clienteLabel).toBe('Rossi Elena');
  });

  it('cliente non in anagrafica: passa come nuovo, col nome detto al telefono', () => {
    const p = payloadBozzaDaRichiesta({ ...base, clienteTesto: 'Signora Elena' });
    expect(p.clienteId).toBeUndefined();
    expect(p.clienteNew?.ragione_sociale).toBe('Signora Elena');
  });

  it('il contatto diventa telefono o email secondo cosa e', () => {
    const tel = payloadBozzaDaRichiesta({
      ...base,
      clienteTesto: 'Elena',
      contatto: '347 123 4567',
    });
    expect(tel.clienteNew?.telefoni).toEqual(['347 123 4567']);
    expect(tel.clienteNew?.email).toBeUndefined();

    const mail = payloadBozzaDaRichiesta({
      ...base,
      clienteTesto: 'Elena',
      contatto: 'elena@example.com',
    });
    expect(mail.clienteNew?.email).toEqual(['elena@example.com']);
    expect(mail.clienteNew?.telefoni).toBeUndefined();
  });

  it('il contatto NON si perde quando il cliente e gia in anagrafica', () => {
    // Niente clienteNew in cui metterlo: deve restare nelle note, altrimenti
    // il numero per richiamare sparisce nel passaggio.
    const p = payloadBozzaDaRichiesta({
      ...base,
      clienteId: 'cli-9',
      contatto: '347 123 4567',
    });
    expect(p.noteIniziali).toContain('347 123 4567');
  });

  it('un titolo corto diventa la descrizione della commessa', () => {
    const p = payloadBozzaDaRichiesta({ ...base, titolo: 'Cambio caldaia' });
    expect(p.descrizioneFinale).toBe('Cambio caldaia');
  });

  it('un titolo troppo lungo NON viene troncato: lo chiedera il form', () => {
    // Troncare a meta parola produrrebbe un nome cartella senza senso, e il
    // nome cartella su Nextcloud non si puo' piu' cambiare.
    const lungo = 'a'.repeat(DESCRIZIONE_MAX + 5);
    const p = payloadBozzaDaRichiesta({ ...base, titolo: lungo });
    expect(p.descrizioneFinale).toBeUndefined();
    expect(p.noteIniziali).toContain(lungo);
  });

  it('tutto quello che si e scritto al telefono finisce nelle note', () => {
    const p = payloadBozzaDaRichiesta({
      ...base,
      titolo: 'Cambio caldaia',
      descrizione: 'Viessmann, ha 12 anni, perde acqua',
      contatto: '347 123 4567',
    });
    expect(p.noteIniziali).toContain('Cambio caldaia');
    expect(p.noteIniziali).toContain('Viessmann');
    expect(p.noteIniziali).toContain('347 123 4567');
  });

  it('porta sempre con se da quale richiesta viene', () => {
    expect(payloadBozzaDaRichiesta(base)._richiestaTodoId).toBe('todo-1');
  });

  it('una richiesta senza cliente resta valida: lo chiedera il form', () => {
    const p = payloadBozzaDaRichiesta(base);
    expect(p.clienteId).toBeUndefined();
    expect(p.clienteNew).toBeUndefined();
  });

  it('non inventa un cliente da spazi bianchi', () => {
    const p = payloadBozzaDaRichiesta({ ...base, clienteTesto: '   ' });
    expect(p.clienteNew).toBeUndefined();
  });
});

describe('indirizzo: dove bisogna andare', () => {
  it('se la richiesta lo dice, finisce in «Indirizzo cantiere»', () => {
    const out = payloadBozzaDaRichiesta({
      id: 'r1',
      titolo: 'Cambio caldaia',
      descrizione: null,
      contatto: null,
      clienteId: null,
      clienteTesto: 'Elena Rossi',
      indirizzo: 'Via Roma 12, Valeggio sul Mincio',
    });
    expect(out.indirizzoCantiere).toBe('Via Roma 12, Valeggio sul Mincio');
  });

  it('⚠️ vuoto NON diventa una stringa vuota: il campo resta assente', () => {
    // Vuoto vuol dire «quello del cliente»: scriverci dentro una stringa
    // vuota farebbe comparire un indirizzo cantiere che azzera il ripiego.
    for (const v of [null, undefined, '', '   ']) {
      const out = payloadBozzaDaRichiesta({
        id: 'r1',
        titolo: 'x',
        descrizione: null,
        contatto: null,
        clienteId: null,
        clienteTesto: null,
        indirizzo: v,
      });
      expect(out.indirizzoCantiere).toBeUndefined();
    }
  });

  it('non tocca il resto del payload', () => {
    const out = payloadBozzaDaRichiesta({
      id: 'r1',
      titolo: 'Cambio caldaia',
      descrizione: null,
      contatto: '3401234567',
      clienteId: null,
      clienteTesto: 'Elena Rossi',
      indirizzo: 'Via Roma 12',
    });
    expect(out.clienteNew?.telefoni).toEqual(['3401234567']);
    expect(out._richiestaTodoId).toBe('r1');
  });
});
