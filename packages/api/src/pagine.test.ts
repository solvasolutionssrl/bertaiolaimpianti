import { describe, it, expect } from 'vitest';

import { leggiTutto, leggiPerGruppi, leggiPerId, type EsitoPagina } from './pagine';

/** Una tabella finta che, come PostgREST, non restituisce più di `tetto` righe. */
function tabella(n: number, tetto = 1000) {
  const righe = Array.from({ length: n }, (_, i) => ({ id: i }));
  const richieste: [number, number][] = [];
  const pagina = async (da: number, a: number): Promise<EsitoPagina<{ id: number }>> => {
    richieste.push([da, a]);
    return { data: righe.slice(da, Math.min(a + 1, da + tetto)), error: null };
  };
  return { pagina, richieste };
}

describe('leggiTutto', () => {
  it('tabella vuota: una richiesta, nessuna riga', async () => {
    const t = tabella(0);
    expect(await leggiTutto(t.pagina)).toEqual([]);
    expect(t.richieste).toEqual([[0, 999]]);
  });

  it('meno di una pagina: una richiesta sola', async () => {
    const t = tabella(999);
    expect((await leggiTutto(t.pagina)).length).toBe(999);
    expect(t.richieste).toHaveLength(1);
  });

  it('esattamente mille righe: serve la pagina vuota per sapere che è finita', async () => {
    const t = tabella(1000);
    expect((await leggiTutto(t.pagina)).length).toBe(1000);
    expect(t.richieste).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
  });

  it('oltre il tetto legge tutto, in ordine e senza doppioni', async () => {
    const t = tabella(2500);
    const righe = await leggiTutto(t.pagina);
    expect(righe.length).toBe(2500);
    expect(righe[0]).toEqual({ id: 0 });
    expect(righe[2499]).toEqual({ id: 2499 });
    expect(new Set(righe.map((r) => r.id)).size).toBe(2500);
    expect(t.richieste).toHaveLength(3);
  });

  it('un errore interrompe la lettura con il contesto', async () => {
    const pagina = async () => ({ data: null, error: { message: 'timeout' } });
    await expect(leggiTutto(pagina, { contesto: 'export presenze' })).rejects.toThrow(
      'export presenze: timeout',
    );
  });

  it('un errore a metà non restituisce le righe già lette', async () => {
    let chiamate = 0;
    const pagina = async (da: number) => {
      chiamate++;
      if (da > 0) return { data: null, error: { message: 'rete' } };
      return { data: Array.from({ length: 1000 }, (_, i) => i), error: null };
    };
    await expect(leggiTutto(pagina)).rejects.toThrow('rete');
    expect(chiamate).toBe(2);
  });

  it('si ferma oltre il massimo invece di girare all’infinito', async () => {
    const t = tabella(5000);
    await expect(leggiTutto(t.pagina, { massimoRighe: 2000, contesto: 'qr' })).rejects.toThrow(
      'qr: più di 2000 righe',
    );
  });

  it('rifiuta righe per pagina non valide', async () => {
    const t = tabella(10);
    await expect(leggiTutto(t.pagina, { perPagina: 0 })).rejects.toThrow('non valide');
  });
});

describe('leggiPerGruppi', () => {
  it('nessun id: nessuna richiesta', async () => {
    let chiamate = 0;
    const out = await leggiPerGruppi([], async () => {
      chiamate++;
      return [1];
    });
    expect(out).toEqual([]);
    expect(chiamate).toBe(0);
  });

  it('spezza in gruppi, toglie i doppioni e unisce in ordine', async () => {
    const gruppi: string[][] = [];
    const id = ['a', 'b', 'a', 'c', 'd', 'e'];
    const out = await leggiPerGruppi(
      id,
      async (g) => {
        gruppi.push(g);
        return g.map((x) => x.toUpperCase());
      },
      2,
    );
    expect(gruppi).toEqual([
      ['a', 'b'],
      ['c', 'd'],
      ['e'],
    ]);
    expect(out).toEqual(['A', 'B', 'C', 'D', 'E']);
  });

  it('propaga l’errore di un gruppo', async () => {
    await expect(
      leggiPerGruppi(['x', 'y'], async () => {
        throw new Error('gruppo fallito');
      }, 1),
    ).rejects.toThrow('gruppo fallito');
  });
});

describe('leggiPerId', () => {
  it('ogni gruppo di id è letto a pagine, anche oltre il tetto', async () => {
    // 3 id, ognuno con 1500 righe: servono due pagine per gruppo.
    const righePerId = 1500;
    const richieste: [string[], number, number][] = [];
    const out = await leggiPerId(
      ['a', 'b', 'c'],
      async (gruppo, da, a) => {
        richieste.push([gruppo, da, a]);
        const tutte = gruppo.flatMap((g) => Array.from({ length: righePerId }, (_, i) => `${g}${i}`));
        return { data: tutte.slice(da, Math.min(a + 1, da + 1000)), error: null };
      },
      { perGruppo: 2 },
    );
    expect(out.length).toBe(4500);
    expect(new Set(out).size).toBe(4500);
    expect(richieste.map(([g, da]) => `${g.join('')}@${da}`)).toEqual(['ab@0', 'ab@1000', 'ab@2000', 'ab@3000', 'c@0', 'c@1000']);
  });

  it('con zero id non chiede niente e un errore porta il contesto', async () => {
    expect(await leggiPerId([], async () => ({ data: [1], error: null }))).toEqual([]);
    await expect(
      leggiPerId(['x'], async () => ({ data: null, error: { message: 'giù' } }), { contesto: 'righe' }),
    ).rejects.toThrow('righe: giù');
  });
});

