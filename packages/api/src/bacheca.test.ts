import { describe, expect, it } from 'vitest';

import {
  BACHECA_BLOCCO_MINUTI,
  BACHECA_GIORNI_SESSIONE,
  BACHECA_MAX_TENTATIVI,
  BACHECA_PASSWORD_MIN,
  componiBacheca,
  coseOrfane,
  dopoIngressoRiuscito,
  dopoTentativoSbagliato,
  eInRitardo,
  ordinaCoseDaFare,
  scadenzaSessione,
  statoBlocco,
  totaleBacheca,
  urlBacheca,
  validaPasswordBacheca,
  type CosaDaFare,
  type Persona,
} from './bacheca';

const ADESSO = new Date('2026-10-07T10:00:00Z');

function cosa(p: Partial<CosaDaFare> & { id: string }): CosaDaFare {
  return {
    titolo: p.id,
    priorita: 'bassa',
    scadenzaAt: null,
    assegnatoA: null,
    codiceLavoro: null,
    ...p,
  };
}

describe('statoBlocco', () => {
  it('libera quando non c’è nessun blocco', () => {
    const r = statoBlocco({ tentativi: 0, bloccataFinoA: null }, ADESSO);
    expect(r.bloccata).toBe(false);
    if (!r.bloccata) expect(r.tentativiRimasti).toBe(BACHECA_MAX_TENTATIVI);
  });

  it('conta quanti tentativi restano', () => {
    const r = statoBlocco({ tentativi: 3, bloccataFinoA: null }, ADESSO);
    if (!r.bloccata) expect(r.tentativiRimasti).toBe(BACHECA_MAX_TENTATIVI - 3);
  });

  it('bloccata finché la data non è passata, e dice per quanto', () => {
    const fra5min = new Date(ADESSO.getTime() + 5 * 60_000);
    const r = statoBlocco({ tentativi: 0, bloccataFinoA: fra5min }, ADESSO);
    expect(r.bloccata).toBe(true);
    if (r.bloccata) expect(r.secondiRimasti).toBe(300);
  });

  it('un blocco scaduto non blocca più', () => {
    const ieri = new Date(ADESSO.getTime() - 86_400_000);
    expect(statoBlocco({ tentativi: 0, bloccataFinoA: ieri }, ADESSO).bloccata).toBe(false);
  });

  it('non solleva su dati storti, e lascia provare', () => {
    for (const v of ['non-una-data', '', NaN as unknown as number]) {
      const r = statoBlocco({ tentativi: v as number, bloccataFinoA: 'bah' }, ADESSO);
      expect(r.bloccata).toBe(false);
    }
  });

  it('accetta la data come stringa ISO (come arriva dal database)', () => {
    const fra1min = new Date(ADESSO.getTime() + 60_000).toISOString();
    expect(statoBlocco({ tentativi: 0, bloccataFinoA: fra1min }, ADESSO).bloccata).toBe(true);
  });
});

describe('dopoTentativoSbagliato', () => {
  it('incrementa finché non si arriva al massimo', () => {
    const r = dopoTentativoSbagliato({ tentativi: 2, bloccataFinoA: null }, ADESSO);
    expect(r.tentativi).toBe(3);
    expect(r.bloccataFinoA).toBeNull();
  });

  it('al massimo blocca e azzera: il blocco non si cumula', () => {
    const r = dopoTentativoSbagliato(
      { tentativi: BACHECA_MAX_TENTATIVI - 1, bloccataFinoA: null },
      ADESSO,
    );
    expect(r.tentativi).toBe(0);
    expect(r.bloccataFinoA).not.toBeNull();
    expect(r.bloccataFinoA!.getTime() - ADESSO.getTime()).toBe(BACHECA_BLOCCO_MINUTI * 60_000);
  });

  it('un tentativo a porta già chiusa non allunga la pena', () => {
    const fino = new Date(ADESSO.getTime() + 60_000);
    const r = dopoTentativoSbagliato({ tentativi: 4, bloccataFinoA: fino }, ADESSO);
    expect(r.tentativi).toBe(4);
    expect(r.bloccataFinoA!.getTime()).toBe(fino.getTime());
  });

  it('dieci tentativi di fila portano esattamente a un blocco', () => {
    let stato: { tentativi: number; bloccataFinoA: Date | null } = {
      tentativi: 0,
      bloccataFinoA: null,
    };
    for (let i = 0; i < BACHECA_MAX_TENTATIVI; i += 1) {
      expect(statoBlocco(stato, ADESSO).bloccata).toBe(false);
      stato = dopoTentativoSbagliato(stato, ADESSO);
    }
    expect(statoBlocco(stato, ADESSO).bloccata).toBe(true);
  });

  it('dopo un ingresso riuscito si riparte da zero', () => {
    const r = dopoIngressoRiuscito();
    expect(r.tentativi).toBe(0);
    expect(r.bloccataFinoA).toBeNull();
    expect(statoBlocco(r, ADESSO).bloccata).toBe(false);
  });
});

describe('validaPasswordBacheca', () => {
  it('accetta una password normale', () => {
    expect(validaPasswordBacheca('ufficio2026').ok).toBe(true);
  });

  it('rifiuta vuota, corta e assurdamente lunga', () => {
    expect(validaPasswordBacheca('').ok).toBe(false);
    expect(validaPasswordBacheca('   ').ok).toBe(false);
    expect(validaPasswordBacheca('a'.repeat(BACHECA_PASSWORD_MIN - 1)).ok).toBe(false);
    expect(validaPasswordBacheca('a'.repeat(BACHECA_PASSWORD_MIN)).ok).toBe(true);
    expect(validaPasswordBacheca('a'.repeat(201)).ok).toBe(false);
  });

  it('dice il minimo nel messaggio', () => {
    const r = validaPasswordBacheca('abc');
    if (!r.ok) expect(r.motivo).toContain(String(BACHECA_PASSWORD_MIN));
  });
});

describe('urlBacheca e scadenzaSessione', () => {
  it('compone l’indirizzo senza doppie barre', () => {
    expect(urlBacheca('https://x.it/', 'abc')).toBe('https://x.it/tv/abc');
    expect(urlBacheca('https://x.it', 'abc')).toBe('https://x.it/tv/abc');
  });

  it('la sessione dura i giorni dichiarati', () => {
    const s = scadenzaSessione(ADESSO);
    expect(s.getTime() - ADESSO.getTime()).toBe(BACHECA_GIORNI_SESSIONE * 86_400_000);
  });
});

describe('eInRitardo', () => {
  it('solo una data passata è un ritardo', () => {
    expect(eInRitardo(new Date(ADESSO.getTime() - 1000).toISOString(), ADESSO)).toBe(true);
    expect(eInRitardo(new Date(ADESSO.getTime() + 1000).toISOString(), ADESSO)).toBe(false);
  });

  it('senza data non c’è ritardo, e un dato storto non è un ritardo', () => {
    expect(eInRitardo(null, ADESSO)).toBe(false);
    expect(eInRitardo('domani', ADESSO)).toBe(false);
  });
});

describe('ordinaCoseDaFare', () => {
  it('prima i ritardi, poi l’urgenza, poi la data, poi il titolo', () => {
    const ieri = new Date(ADESSO.getTime() - 86_400_000).toISOString();
    const domani = new Date(ADESSO.getTime() + 86_400_000).toISOString();
    const cose = [
      cosa({ id: 'z-bassa-senza-data' }),
      cosa({ id: 'urgente-domani', priorita: 'urgente', scadenzaAt: domani }),
      cosa({ id: 'bassa-in-ritardo', scadenzaAt: ieri }),
      cosa({ id: 'a-bassa-senza-data' }),
      cosa({ id: 'alta-domani', priorita: 'alta', scadenzaAt: domani }),
    ];
    expect(ordinaCoseDaFare(cose, ADESSO).map((c) => c.id)).toEqual([
      'bassa-in-ritardo',
      'urgente-domani',
      'alta-domani',
      'a-bassa-senza-data',
      'z-bassa-senza-data',
    ]);
  });

  it('chi ha un termine viene prima di chi non ne ha', () => {
    const fra1h = new Date(ADESSO.getTime() + 3_600_000).toISOString();
    const out = ordinaCoseDaFare(
      [cosa({ id: 'senza' }), cosa({ id: 'con', scadenzaAt: fra1h })],
      ADESSO,
    );
    expect(out[0]!.id).toBe('con');
  });

  it('è stabile: due ordinamenti dello stesso insieme danno lo stesso elenco', () => {
    const cose = ['c', 'a', 'b'].map((id) => cosa({ id }));
    const a = ordinaCoseDaFare(cose, ADESSO).map((c) => c.id);
    const b = ordinaCoseDaFare([...cose].reverse(), ADESSO).map((c) => c.id);
    expect(a).toEqual(b);
  });

  it('non modifica l’elenco che riceve', () => {
    const cose = [cosa({ id: 'b' }), cosa({ id: 'a' })];
    ordinaCoseDaFare(cose, ADESSO);
    expect(cose.map((c) => c.id)).toEqual(['b', 'a']);
  });

  it('una priorità sconosciuta va in fondo, non in mezzo', () => {
    const out = ordinaCoseDaFare(
      [cosa({ id: 'ignota', priorita: 'chissa' }), cosa({ id: 'bassa' })],
      ADESSO,
    );
    expect(out.map((c) => c.id)).toEqual(['bassa', 'ignota']);
  });
});

describe('componiBacheca', () => {
  const persone: Persona[] = [
    { userId: 'u1', nome: 'Anna' },
    { userId: 'u2', nome: 'Bruno' },
    { userId: 'u3', nome: 'Carla' },
  ];

  it('mostra tutte le persone, anche quelle senza niente', () => {
    const b = componiBacheca(persone, [cosa({ id: 'x', assegnatoA: 'u1' })], ADESSO);
    expect(b).toHaveLength(3);
    expect(b.find((c) => c.persona.userId === 'u3')!.cose).toHaveLength(0);
  });

  it('chi ha di più viene prima; a parità, in ordine di nome', () => {
    const b = componiBacheca(
      persone,
      [
        cosa({ id: '1', assegnatoA: 'u2' }),
        cosa({ id: '2', assegnatoA: 'u2' }),
        cosa({ id: '3', assegnatoA: 'u3' }),
      ],
      ADESSO,
    );
    expect(b.map((c) => c.persona.nome)).toEqual(['Bruno', 'Carla', 'Anna']);
  });

  it('le cose di nessuno non finiscono in nessuna casella', () => {
    const b = componiBacheca(persone, [cosa({ id: 'libera', assegnatoA: null })], ADESSO);
    expect(b.every((c) => c.cose.length === 0)).toBe(true);
  });

  it('conta i ritardi per persona', () => {
    const ieri = new Date(ADESSO.getTime() - 86_400_000).toISOString();
    const b = componiBacheca(
      persone,
      [
        cosa({ id: 'tardi', assegnatoA: 'u1', scadenzaAt: ieri }),
        cosa({ id: 'ok', assegnatoA: 'u1' }),
      ],
      ADESSO,
    );
    expect(b.find((c) => c.persona.userId === 'u1')!.inRitardo).toBe(1);
  });

  it('una cosa assegnata a un account chiuso non compare, ma si ritrova', () => {
    const cose = [cosa({ id: 'persa', assegnatoA: 'fantasma' })];
    const b = componiBacheca(persone, cose, ADESSO);
    expect(b.every((c) => c.cose.length === 0)).toBe(true);
    expect(coseOrfane(persone, cose).map((c) => c.id)).toEqual(['persa']);
  });

  it('senza persone non solleva e non inventa caselle', () => {
    expect(componiBacheca([], [cosa({ id: 'x', assegnatoA: 'u1' })], ADESSO)).toEqual([]);
  });
});

describe('coseOrfane', () => {
  it('ignora le cose di nessuno: quelle non sono orfane, sono libere', () => {
    expect(coseOrfane([{ userId: 'u1', nome: 'A' }], [cosa({ id: 'x', assegnatoA: null })])).toEqual(
      [],
    );
  });
});

describe('totaleBacheca', () => {
  it('somma cose, ritardi e persone occupate', () => {
    const ieri = new Date(ADESSO.getTime() - 86_400_000).toISOString();
    const b = componiBacheca(
      [
        { userId: 'u1', nome: 'A' },
        { userId: 'u2', nome: 'B' },
        { userId: 'u3', nome: 'C' },
      ],
      [
        cosa({ id: '1', assegnatoA: 'u1', scadenzaAt: ieri }),
        cosa({ id: '2', assegnatoA: 'u1' }),
        cosa({ id: '3', assegnatoA: 'u2' }),
      ],
      ADESSO,
    );
    expect(totaleBacheca(b)).toEqual({ cose: 3, inRitardo: 1, personeOccupate: 2 });
  });

  it('su una bacheca vuota è tutto zero', () => {
    expect(totaleBacheca([])).toEqual({ cose: 0, inRitardo: 0, personeOccupate: 0 });
  });
});
