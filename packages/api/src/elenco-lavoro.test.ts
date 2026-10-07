import { describe, expect, it } from 'vitest';

import {
  componiElenco,
  contaPerFiltro,
  ordinaElenco,
  raggruppaElenco,
  vocePassaFiltro,
  voceCorrisponde,
  type VoceElenco,
} from './elenco-lavoro';

const v = (p: Partial<VoceElenco> & { id: string }): VoceElenco => ({
  tipo: 'commessa',
  titolo: p.id,
  ...p,
});

describe('vocePassaFiltro', () => {
  it('«Da fare» tiene dentro anche le richieste al telefono', () => {
    const todo = v({ id: 't', tipo: 'todo' });
    const rich = v({ id: 'r', tipo: 'richiesta' });
    const comm = v({ id: 'c', tipo: 'commessa' });

    expect(vocePassaFiltro(todo, 'da_fare')).toBe(true);
    expect(vocePassaFiltro(rich, 'da_fare')).toBe(true);
    expect(vocePassaFiltro(comm, 'da_fare')).toBe(false);

    expect(vocePassaFiltro(comm, 'commesse')).toBe(true);
    expect(vocePassaFiltro(rich, 'commesse')).toBe(false);

    for (const x of [todo, rich, comm]) expect(vocePassaFiltro(x, 'tutto')).toBe(true);
  });
});

describe('ordinaElenco · urgenza', () => {
  it('chi ha una scadenza viene prima di chi non ne ha', () => {
    const out = ordinaElenco(
      [v({ id: 'senza' }), v({ id: 'con', scadenza: '2027-01-01T00:00:00Z' })],
      'urgenza',
    );
    expect(out.map((x) => x.id)).toEqual(['con', 'senza']);
  });

  it('fra le scadenze, la più vicina prima — e le passate finiscono in cima', () => {
    const out = ordinaElenco(
      [
        v({ id: 'fra_un_mese', scadenza: '2026-11-07T08:00:00Z' }),
        v({ id: 'scaduta', scadenza: '2026-09-01T08:00:00Z' }),
        v({ id: 'domani', scadenza: '2026-10-08T08:00:00Z' }),
      ],
      'urgenza',
    );
    // Nessun ramo speciale per lo scaduto: una data passata è un numero più
    // piccolo, e sale da sé.
    expect(out.map((x) => x.id)).toEqual(['scaduta', 'domani', 'fra_un_mese']);
  });

  it('senza scadenza vale l’ordine in cui è stato affidato, dall’ultimo', () => {
    const out = ordinaElenco(
      [
        v({ id: 'vecchia', affidataIl: '2026-05-01T10:00:00Z' }),
        v({ id: 'stamattina', affidataIl: '2026-10-07T07:30:00Z' }),
        v({ id: 'ieri', affidataIl: '2026-10-06T16:00:00Z' }),
      ],
      'urgenza',
    );
    expect(out.map((x) => x.id)).toEqual(['stamattina', 'ieri', 'vecchia']);
  });

  it('chi non ha nemmeno la data di affidamento scende in fondo', () => {
    // Senza il ramo apposito un valore assente si comporterebbe come uno zero,
    // cioè come la data più lontana nel passato… che nell'ordine decrescente
    // finisce in CIMA. L'opposto di quel che serve.
    const out = ordinaElenco(
      [v({ id: 'ignota' }), v({ id: 'nota', affidataIl: '2026-01-01T00:00:00Z' })],
      'urgenza',
    );
    expect(out.map((x) => x.id)).toEqual(['nota', 'ignota']);
  });

  it('mescola i due mondi: una scadenza vicina batte una commessa appena affidata', () => {
    const out = ordinaElenco(
      [
        v({ id: 'commessa_nuova', tipo: 'commessa', affidataIl: '2026-10-07T07:00:00Z' }),
        v({ id: 'todo_dopodomani', tipo: 'todo', scadenza: '2026-10-09T08:00:00Z' }),
      ],
      'urgenza',
    );
    expect(out.map((x) => x.id)).toEqual(['todo_dopodomani', 'commessa_nuova']);
  });

  it('una data illeggibile vale come assente, non manda tutto all’aria', () => {
    const out = ordinaElenco(
      [v({ id: 'rotta', scadenza: 'domani mattina' }), v({ id: 'buona', scadenza: '2026-10-08T08:00:00Z' })],
      'urgenza',
    );
    expect(out.map((x) => x.id)).toEqual(['buona', 'rotta']);
  });

  it('non tocca l’array di partenza', () => {
    const dentro = [v({ id: 'b' }), v({ id: 'a' })];
    const copia = [...dentro];
    ordinaElenco(dentro, 'alfabetico');
    expect(dentro).toEqual(copia);
  });

  it('a parità assoluta l’ordine è stabile fra due chiamate', () => {
    const voci = [v({ id: 'z2', titolo: 'Uguale' }), v({ id: 'z1', titolo: 'Uguale' })];
    const a = ordinaElenco(voci, 'urgenza').map((x) => x.id);
    const b = ordinaElenco([...voci].reverse(), 'urgenza').map((x) => x.id);
    expect(a).toEqual(b);
  });
});

describe('ordinaElenco · alfabetico', () => {
  it('ignora accenti e maiuscole, come se li leggesse una persona', () => {
    const out = ordinaElenco(
      [v({ id: '3', titolo: 'Zanetti' }), v({ id: '1', titolo: 'àbaco' }), v({ id: '2', titolo: 'Bianchi' })],
      'alfabetico',
    );
    expect(out.map((x) => x.titolo)).toEqual(['àbaco', 'Bianchi', 'Zanetti']);
  });
});

describe('voceCorrisponde', () => {
  it('ogni parola deve comparire, anche in campi diversi', () => {
    const c = v({
      id: 'x',
      titolo: 'Sostituzione caldaia',
      cerca: 'Zanetti Paolo · Via Mantova 48 Valeggio sul Mincio · BER-DEMO-01',
    });
    expect(voceCorrisponde(c, 'zanetti valeggio')).toBe(true);
    expect(voceCorrisponde(c, 'caldaia mantova')).toBe(true);
    expect(voceCorrisponde(c, 'zanetti verona')).toBe(false);
  });

  it('gli accenti non impediscono di trovare', () => {
    const c = v({ id: 'x', titolo: 'Impianto', cerca: 'Nicolò Pachera' });
    expect(voceCorrisponde(c, 'nicolo')).toBe(true);
    expect(voceCorrisponde(c, 'Nicolò')).toBe(true);
  });

  it('una ricerca vuota tiene tutto', () => {
    const c = v({ id: 'x' });
    expect(voceCorrisponde(c, '')).toBe(true);
    expect(voceCorrisponde(c, '   ')).toBe(true);
  });
});

describe('contaPerFiltro', () => {
  it('conta dopo la ricerca, non prima', () => {
    const voci = [
      v({ id: '1', tipo: 'commessa', titolo: 'Caldaia Zanetti' }),
      v({ id: '2', tipo: 'commessa', titolo: 'Bagno Rossi' }),
      v({ id: '3', tipo: 'todo', titolo: 'Ordinare la caldaia' }),
    ];
    expect(contaPerFiltro(voci)).toEqual({ tutto: 3, commesse: 2, da_fare: 1 });
    // Con la ricerca attiva i numeri devono seguire ciò che si vede.
    expect(contaPerFiltro(voci, 'caldaia')).toEqual({ tutto: 2, commesse: 1, da_fare: 1 });
  });
});

describe('componiElenco', () => {
  it('filtra, cerca e ordina in un passaggio', () => {
    const voci = [
      v({ id: 'c1', tipo: 'commessa', titolo: 'Caldaia Zanetti', affidataIl: '2026-10-01T08:00:00Z' }),
      v({ id: 'c2', tipo: 'commessa', titolo: 'Caldaia Rossi', affidataIl: '2026-10-05T08:00:00Z' }),
      v({ id: 't1', tipo: 'todo', titolo: 'Caldaia: ordinare il kit', scadenza: '2026-10-08T08:00:00Z' }),
      v({ id: 't2', tipo: 'todo', titolo: 'Altro' }),
    ];
    expect(componiElenco(voci, { query: 'caldaia' }).map((x) => x.id)).toEqual(['t1', 'c2', 'c1']);
    expect(componiElenco(voci, { filtro: 'commesse' }).map((x) => x.id)).toEqual(['c2', 'c1']);
    expect(componiElenco(voci, { filtro: 'da_fare', ordine: 'alfabetico' }).map((x) => x.id)).toEqual([
      't2',
      't1',
    ]);
  });

  it('senza opzioni non butta via niente', () => {
    const voci = [v({ id: 'a' }), v({ id: 'b', tipo: 'todo' })];
    expect(componiElenco(voci)).toHaveLength(2);
  });
});

describe('raggruppaElenco', () => {
  it('mette ogni cosa da fare sotto il suo lavoro', () => {
    const voci = [
      v({ id: 'c1', tipo: 'commessa', titolo: 'Rossi', gruppo: 'c1', affidataIl: '2026-10-01T08:00:00Z' }),
      v({ id: 'c2', tipo: 'commessa', titolo: 'Bianchi', gruppo: 'c2', affidataIl: '2026-10-02T08:00:00Z' }),
      v({ id: 't1', tipo: 'todo', titolo: 'Portare la pompa', gruppo: 'c1' }),
      v({ id: 't2', tipo: 'todo', titolo: 'Misurare lo scarico', gruppo: 'c2' }),
      v({ id: 't3', tipo: 'todo', titolo: 'Foto del quadro', gruppo: 'c1' }),
    ];
    const g = raggruppaElenco(voci);
    // Due commesse + nessuna voce sciolta.
    expect(g).toHaveLength(2);
    const c1 = g.find((x) => x.chiave === 'c1')!;
    expect(c1.capofila?.id).toBe('c1');
    expect(c1.dentro.map((x) => x.id).sort()).toEqual(['t1', 't3']);
    const c2 = g.find((x) => x.chiave === 'c2')!;
    expect(c2.dentro.map((x) => x.id)).toEqual(['t2']);
  });

  it('⭐ l ordine dei gruppi segue la voce piu urgente che contengono', () => {
    const voci = [
      // c1 e' stata affidata DOPO c2, quindi nell'elenco piatto starebbe prima.
      v({ id: 'c1', tipo: 'commessa', titolo: 'Rossi', gruppo: 'c1', affidataIl: '2026-10-05T08:00:00Z' }),
      v({ id: 'c2', tipo: 'commessa', titolo: 'Bianchi', gruppo: 'c2', affidataIl: '2026-10-01T08:00:00Z' }),
      // ...ma su c2 c'e' una cosa da fare con una scadenza: il blocco sale.
      v({ id: 't2', tipo: 'todo', titolo: 'Urgente', gruppo: 'c2', scadenza: '2026-10-09T08:00:00Z' }),
    ];
    expect(raggruppaElenco(voci).map((x) => x.chiave)).toEqual(['c2', 'c1']);
  });

  it('le scadenze passate tirano il blocco in cima, senza rami a parte', () => {
    const voci = [
      v({ id: 'c1', tipo: 'commessa', titolo: 'Rossi', gruppo: 'c1', affidataIl: '2026-10-06T08:00:00Z' }),
      v({ id: 'c2', tipo: 'commessa', titolo: 'Bianchi', gruppo: 'c2', affidataIl: '2026-10-05T08:00:00Z' }),
      v({ id: 't2', tipo: 'todo', titolo: 'Dimenticata', gruppo: 'c2', scadenza: '2026-09-01T08:00:00Z' }),
    ];
    expect(raggruppaElenco(voci)[0]!.chiave).toBe('c2');
  });

  it('⚠️ le richieste al telefono finiscono in un gruppo senza chiave, in fondo', () => {
    const voci = [
      v({ id: 'r1', tipo: 'richiesta', titolo: 'Cambio caldaia', gruppo: null }),
      v({ id: 'c1', tipo: 'commessa', titolo: 'Rossi', gruppo: 'c1', affidataIl: '2026-10-01T08:00:00Z' }),
    ];
    const g = raggruppaElenco(voci);
    expect(g.map((x) => x.chiave)).toEqual(['c1', null]);
    expect(g[1]!.capofila).toBeNull();
    expect(g[1]!.dentro.map((x) => x.id)).toEqual(['r1']);
  });

  it('⚠️ un gruppo senza capofila resta: e il caso della ricerca', () => {
    // La ricerca ha trovato la cosa da fare ma non la commessa: la commessa
    // non e' fra le voci. La riga va mostrata comunque.
    const voci = [v({ id: 't1', tipo: 'todo', titolo: 'Portare la pompa', gruppo: 'c9' })];
    const g = raggruppaElenco(voci);
    expect(g).toHaveLength(1);
    expect(g[0]!.chiave).toBe('c9');
    expect(g[0]!.capofila).toBeNull();
    expect(g[0]!.dentro.map((x) => x.id)).toEqual(['t1']);
  });

  it('in ordine alfabetico i gruppi seguono lo stesso comparatore', () => {
    const voci = [
      v({ id: 'c1', tipo: 'commessa', titolo: 'Zanetti', gruppo: 'c1' }),
      v({ id: 'c2', tipo: 'commessa', titolo: 'Abbiati', gruppo: 'c2' }),
    ];
    expect(raggruppaElenco(voci, 'alfabetico').map((x) => x.chiave)).toEqual(['c2', 'c1']);
  });

  it('la capofila si riconosce dal tipo, non dalla posizione', () => {
    // In ordine alfabetico «Aggiungere…» precede «Rossi»: se si prendesse la
    // prima riga del gruppo, la capofila sarebbe una cosa da fare.
    const voci = [
      v({ id: 'c1', tipo: 'commessa', titolo: 'Rossi', gruppo: 'c1' }),
      v({ id: 't1', tipo: 'todo', titolo: 'Aggiungere la valvola', gruppo: 'c1' }),
    ];
    const g = raggruppaElenco(voci, 'alfabetico');
    expect(g[0]!.capofila?.id).toBe('c1');
    expect(g[0]!.dentro.map((x) => x.id)).toEqual(['t1']);
  });

  it('niente voci, niente gruppi', () => {
    expect(raggruppaElenco([])).toEqual([]);
  });

  it('una commessa senza niente dentro resta un gruppo, vuoto', () => {
    const g = raggruppaElenco([v({ id: 'c1', tipo: 'commessa', titolo: 'Rossi', gruppo: 'c1' })]);
    expect(g).toHaveLength(1);
    expect(g[0]!.dentro).toEqual([]);
  });

  it('non tocca l array di partenza', () => {
    const voci = [
      v({ id: 'c2', tipo: 'commessa', titolo: 'B', gruppo: 'c2' }),
      v({ id: 'c1', tipo: 'commessa', titolo: 'A', gruppo: 'c1' }),
    ];
    const copia = [...voci];
    raggruppaElenco(voci, 'alfabetico');
    expect(voci).toEqual(copia);
  });
});
