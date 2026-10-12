import { describe, expect, it } from 'vitest';

import {
  contaImpersonabili,
  etichettaImpersonazione,
  motivoNonImpersonabile,
  nomeLeggibile,
  opzioniImpersonazione,
  type PersonaImpersonabile,
} from './impersonazione';

function persona(p: Partial<PersonaImpersonabile> = {}): PersonaImpersonabile {
  return {
    id: 'u1',
    nome: 'Mario Rossi',
    login: 'mario.rossi@ber.kommessa.local',
    ruolo: 'tecnico',
    attivo: true,
    ...p,
  };
}

describe('nomeLeggibile', () => {
  it('usa il nome quando c’è', () => {
    expect(nomeLeggibile({ nome: 'Erica Zantedeschi', login: 'ez@x.it' })).toBe(
      'Erica Zantedeschi',
    );
  });

  it('ripiega sul nome utente senza il dominio', () => {
    expect(nomeLeggibile({ nome: null, login: 'bpiazza@ber.kommessa.local' })).toBe('bpiazza');
    expect(nomeLeggibile({ nome: '   ', login: 'bpiazza@ber.kommessa.local' })).toBe('bpiazza');
  });

  it('non torna mai vuoto', () => {
    expect(nomeLeggibile({ nome: null, login: null })).toBe('Senza nome');
  });
});

describe('motivoNonImpersonabile', () => {
  it('una persona attiva di un ruolo vivo si impersona', () => {
    expect(motivoNonImpersonabile(persona())).toBeNull();
    expect(motivoNonImpersonabile(persona({ ruolo: 'office' }))).toBeNull();
    expect(motivoNonImpersonabile(persona({ ruolo: 'admin' }))).toBeNull();
  });

  it('un account spento no', () => {
    expect(motivoNonImpersonabile(persona({ attivo: false }))).toBe('Account disattivato');
  });

  it('un super admin no: sarebbe un’ombra dentro un’ombra', () => {
    expect(motivoNonImpersonabile(persona({ piattaforma: true }))).toBe(
      'È un super admin: non si impersona',
    );
  });

  it('se stessi no', () => {
    expect(motivoNonImpersonabile(persona({ id: 'io' }), 'io')).toBe('Sei già tu');
    expect(motivoNonImpersonabile(persona({ id: 'altro' }), 'io')).toBeNull();
  });

  it('il ruolo cliente no: il portale è spento per tutti', () => {
    expect(motivoNonImpersonabile(persona({ ruolo: 'cliente' }))).toBe(
      'Il portale clienti è spento',
    );
  });

  it('i ruoli dismessi no, anche se ricomparissero in tabella', () => {
    // `owner` e `capo` restano nell'enum Postgres: non si cancellano senza
    // riscrivere decine di policy. Nessun account li ha, ma se ne tornasse uno
    // non ha una casa dove atterrare.
    expect(motivoNonImpersonabile(persona({ ruolo: 'owner' }))).toBe('Ruolo non più in uso');
    expect(motivoNonImpersonabile(persona({ ruolo: 'capo' }))).toBe('Ruolo non più in uso');
  });

  it('spento batte tutto il resto: il motivo è uno, il primo vero', () => {
    const m = motivoNonImpersonabile(persona({ attivo: false, ruolo: 'cliente' }));
    expect(m).toBe('Account disattivato');
  });
});

describe('opzioniImpersonazione', () => {
  const squadra: PersonaImpersonabile[] = [
    persona({ id: 't2', nome: 'Thomas Cordioli', ruolo: 'tecnico' }),
    persona({ id: 'a1', nome: 'Mauro Bertaiola', ruolo: 'admin' }),
    persona({ id: 't1', nome: 'Christian Bergamin', ruolo: 'tecnico' }),
    persona({ id: 'o1', nome: 'Erica Zantedeschi', ruolo: 'office' }),
    persona({ id: 'x1', nome: 'Vecchio Tecnico', ruolo: 'tecnico', attivo: false }),
  ];

  it('ordina per mestiere (dal più ampio) e poi per nome', () => {
    const o = opzioniImpersonazione(squadra);
    expect(o.map((x) => x.valore)).toEqual(['a1', 'o1', 't1', 't2', 'x1']);
  });

  it('raggruppa col plurale del vocabolario dei mestieri', () => {
    const gruppi = [...new Set(opzioniImpersonazione(squadra).map((o) => o.gruppo))];
    expect(gruppi).toEqual(['Amministratori', 'Ufficio', 'Tecnici']);
  });

  it('non scrive mai il valore grezzo del ruolo nell’etichetta visibile', () => {
    for (const o of opzioniImpersonazione(squadra)) {
      expect(o.dettaglio).not.toMatch(/\b(tecnico|office|admin)\b/);
    }
  });

  it('chi non si può impersonare resta nell’elenco, spento e col motivo', () => {
    const spento = opzioniImpersonazione(squadra).find((o) => o.valore === 'x1');
    expect(spento?.disabilitata).toBe(true);
    expect(spento?.dettaglio).toContain('Account disattivato');
    // Gli altri non sono disabilitati: la prova non passa perché è disabilitato tutto.
    expect(opzioniImpersonazione(squadra).filter((o) => o.disabilitata).length).toBe(1);
  });

  it('il nome utente si può cercare anche se non è nell’etichetta', () => {
    const o = opzioniImpersonazione([
      persona({ id: 'o1', nome: 'Barbara Piazza', login: 'bpiazza@ber.kommessa.local' }),
    ])[0]!;
    expect(o.etichetta).toBe('Barbara Piazza');
    expect(o.cerca).toContain('bpiazza@ber.kommessa.local');
  });

  it('conta solo chi si può davvero impersonare', () => {
    expect(contaImpersonabili(squadra)).toBe(4);
    expect(contaImpersonabili(squadra, 'a1')).toBe(3);
    expect(contaImpersonabili([])).toBe(0);
  });

  it('regge un elenco vuoto', () => {
    expect(opzioniImpersonazione([])).toEqual([]);
  });
});

describe('etichettaImpersonazione', () => {
  it('dice chi, con quale mestiere, di chi', () => {
    expect(
      etichettaImpersonazione({
        nome: 'Erica Zantedeschi',
        ruolo: 'office',
        cliente: 'Bertaiola Impianti',
      }),
    ).toBe('Erica Zantedeschi · ufficio · Bertaiola Impianti');
  });

  it('il mestiere c’è anche per un tecnico di un cliente del mondo presenze', () => {
    expect(
      etichettaImpersonazione({ nome: 'Andrei Gonta', ruolo: 'tecnico', cliente: 'FPM Impianti' }),
    ).toBe('Andrei Gonta · tecnico · FPM Impianti');
  });

  it('senza ruolo e senza cliente resta il nome, non una frase mozza', () => {
    expect(etichettaImpersonazione({ nome: 'Mauro Bertaiola' })).toBe('Mauro Bertaiola');
    expect(etichettaImpersonazione({ nome: 'Mauro Bertaiola', ruolo: null, cliente: null })).toBe(
      'Mauro Bertaiola',
    );
  });

  it('un ruolo che non conosciamo non finisce a schermo come valore grezzo', () => {
    const f = etichettaImpersonazione({ nome: 'X', ruolo: 'capo', cliente: 'Y' });
    expect(f).toBe('X · altro · Y');
    expect(f).not.toContain('capo');
  });

  it('ripiega sul nome utente invece di lasciare un buco davanti al ruolo', () => {
    expect(
      etichettaImpersonazione({ nome: null, login: 'dfratton@ber.kommessa.local', ruolo: 'office' }),
    ).toBe('dfratton · ufficio');
  });
});
