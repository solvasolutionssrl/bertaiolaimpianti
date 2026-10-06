import { describe, expect, it } from 'vitest';

import {
  BYTE_TEMPORANEA,
  DOMINIO_ALIAS,
  PASSWORD_MAX,
  PASSWORD_MIN,
  USERNAME_MAX,
  USERNAME_MIN,
  aliasLogin,
  componiPasswordTemporanea,
  deveCambiarePassword,
  mostraPromemoriaPassword,
  eAliasLocale,
  RUOLI_VIVI,
  etichettaAccesso,
  etichettaRuolo,
  normalizzaUsername,
  statoPasswordAllaNascita,
  proponiUsername,
  usernameDaAlias,
  validaPassword,
  validaUsername,
} from './identita';

describe('normalizzaUsername', () => {
  it('toglie gli spazi e abbassa le maiuscole', () => {
    expect(normalizzaUsername('  M.Rossi  ')).toBe('m.rossi');
  });

  it('accetta punto, trattino e sottolineato', () => {
    expect(normalizzaUsername('a.b-c_d')).toBe('a.b-c_d');
  });

  it('rifiuta spazi interni, accenti e chiocciole', () => {
    expect(normalizzaUsername('mario rossi')).toBeNull();
    expect(normalizzaUsername('nicolò')).toBeNull();
    expect(normalizzaUsername('m@rossi')).toBeNull();
  });

  it('rifiuta troppo corto e troppo lungo', () => {
    expect(normalizzaUsername('a')).toBeNull();
    expect(normalizzaUsername('ab')).toBe('ab');
    expect(normalizzaUsername('x'.repeat(USERNAME_MAX))).toBe('x'.repeat(USERNAME_MAX));
    expect(normalizzaUsername('x'.repeat(USERNAME_MAX + 1))).toBeNull();
  });

  it('non solleva su valori che non sono stringhe', () => {
    expect(normalizzaUsername(null)).toBeNull();
    expect(normalizzaUsername(undefined)).toBeNull();
    expect(normalizzaUsername(42)).toBeNull();
    expect(normalizzaUsername({})).toBeNull();
  });

  it('è coerente con validaUsername su ogni caso', () => {
    const casi = ['m.rossi', 'a', '', 'Mario Rossi', 'ab', 'x'.repeat(41)];
    for (const c of casi) {
      const n = normalizzaUsername(c);
      const v = validaUsername(c);
      expect(v.ok).toBe(n !== null);
      if (v.ok) expect(v.username).toBe(n);
    }
  });
});

describe('validaUsername', () => {
  it('dice perché, non solo che è sbagliato', () => {
    const corto = validaUsername('a');
    expect(corto.ok).toBe(false);
    if (!corto.ok) expect(corto.motivo).toContain(String(USERNAME_MIN));

    const lungo = validaUsername('x'.repeat(USERNAME_MAX + 1));
    expect(lungo.ok).toBe(false);
    if (!lungo.ok) expect(lungo.motivo).toContain(String(USERNAME_MAX));

    const sporco = validaUsername('mario rossi');
    expect(sporco.ok).toBe(false);
    if (!sporco.ok) expect(sporco.motivo).toMatch(/minuscole/i);

    const vuoto = validaUsername('   ');
    expect(vuoto.ok).toBe(false);
    if (!vuoto.ok) expect(vuoto.motivo).toMatch(/manca/i);
  });
});

describe('proponiUsername', () => {
  it('usa iniziale del nome e cognome, come gli account già in uso', () => {
    expect(proponiUsername('Mario', 'Rossi')).toBe('m.rossi');
  });

  it('toglie gli accenti invece di rifiutare la persona', () => {
    expect(proponiUsername('Nicolò', 'Dall’Aglio')).toBe('n.dallaglio');
  });

  it('con un campo solo usa quello', () => {
    expect(proponiUsername('Giancarlo')).toBe('giancarlo');
    expect(proponiUsername('', 'Bertaiola')).toBe('bertaiola');
  });

  it('torna null quando non resta niente di utilizzabile', () => {
    expect(proponiUsername('', '')).toBeNull();
    expect(proponiUsername('...', '   ')).toBeNull();
    // Una lettera sola non raggiunge il minimo.
    expect(proponiUsername('A')).toBeNull();
  });

  it('non supera mai la lunghezza massima', () => {
    const lungo = proponiUsername('Massimiliano', 'X'.repeat(90));
    expect(lungo).not.toBeNull();
    expect(lungo!.length).toBeLessThanOrEqual(USERNAME_MAX);
  });
});

describe('aliasLogin', () => {
  it('compone minuscolo da entrambe le parti', () => {
    expect(aliasLogin('M.Rossi', 'BER')).toBe(`m.rossi@ber.${DOMINIO_ALIAS}`);
  });

  it('riproduce esattamente gli account già in produzione', () => {
    expect(aliasLogin('mauro', 'FPMIMP')).toBe('mauro@fpmimp.kommessa.local');
  });

  it('tollera spazi ai lati', () => {
    expect(aliasLogin('  luca ', ' demok ')).toBe('luca@demok.kommessa.local');
  });
});

describe('eAliasLocale / usernameDaAlias / etichettaAccesso', () => {
  it('distingue una casella vera da un alias fabbricato', () => {
    expect(eAliasLocale('m.rossi@ber.kommessa.local')).toBe(true);
    expect(eAliasLocale('mario@bertaiolaimpianti.com')).toBe(false);
    expect(eAliasLocale('mario@gmail.com')).toBe(false);
  });

  it('non si fa ingannare da un dominio che somiglia', () => {
    // Qui il punto conta: `.kommessa.local` sì, `kommessa.local` attaccato no.
    expect(eAliasLocale('tizio@fintokommessa.local')).toBe(false);
  });

  it('su valori assenti risponde no, senza sollevare', () => {
    expect(eAliasLocale(null)).toBe(false);
    expect(eAliasLocale(undefined)).toBe(false);
    expect(eAliasLocale('')).toBe(false);
  });

  it('estrae lo username solo dagli alias', () => {
    expect(usernameDaAlias('m.rossi@ber.kommessa.local')).toBe('m.rossi');
    expect(usernameDaAlias('mario@bertaiolaimpianti.com')).toBeNull();
    expect(usernameDaAlias(null)).toBeNull();
  });

  it('mostra lo username per gli alias e l’indirizzo per le caselle vere', () => {
    expect(etichettaAccesso('m.rossi@ber.kommessa.local')).toBe('m.rossi');
    expect(etichettaAccesso('mario@bertaiolaimpianti.com')).toBe('mario@bertaiolaimpianti.com');
    expect(etichettaAccesso(null)).toBe('—');
  });
});

describe('validaPassword', () => {
  it('accetta una password normale', () => {
    expect(validaPassword('Tabero47').ok).toBe(true);
  });

  it('rifiuta troppo corta, dicendo il minimo', () => {
    const r = validaPassword('abc');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain(String(PASSWORD_MIN));
  });

  it('misura la lunghezza in byte, non in caratteri', () => {
    // 71 emoji da 4 byte: pochi "caratteri" per JS, molti byte per bcrypt.
    const emoji = '😀'.repeat(20);
    expect(emoji.length).toBeLessThan(PASSWORD_MAX);
    const r = validaPassword(emoji);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain(String(PASSWORD_MAX));
  });

  it('accetta esattamente il massimo e rifiuta un byte in più', () => {
    expect(validaPassword('a'.repeat(PASSWORD_MAX)).ok).toBe(true);
    expect(validaPassword('a'.repeat(PASSWORD_MAX + 1)).ok).toBe(false);
  });

  it('rifiuta la password uguale al nome utente, anche con maiuscole diverse', () => {
    const r = validaPassword('M.Rossi1', { username: 'm.rossi1' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/nome utente/i);
  });

  it('senza username non applica quel controllo', () => {
    expect(validaPassword('m.rossi1').ok).toBe(true);
    expect(validaPassword('m.rossi1', { username: null }).ok).toBe(true);
  });

  it('su valori assenti dice che manca', () => {
    const r = validaPassword(undefined);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/manca/i);
  });
});

describe('componiPasswordTemporanea', () => {
  it('è deterministica: stessi byte, stessa password', () => {
    const byte = new Uint8Array([0, 0, 1, 1, 2, 2, 3, 4]);
    expect(componiPasswordTemporanea(byte)).toBe(componiPasswordTemporanea(byte));
  });

  it('comincia maiuscola e finisce con due cifre', () => {
    const p = componiPasswordTemporanea(new Uint8Array([5, 3, 7, 1, 2, 4, 9, 6]));
    expect(p[0]).toBe(p[0]!.toUpperCase());
    expect(p.slice(-2)).toMatch(/^[2-9]{2}$/);
  });

  it('non contiene mai caratteri che si confondono a voce o a schermo', () => {
    // Ogni combinazione di byte possibile sul primo carattere di ogni posizione.
    for (let i = 0; i < 256; i += 1) {
      const p = componiPasswordTemporanea(new Uint8Array([i, i, i, i, i, i, i, i]));
      expect(p).not.toMatch(/[lqv01LQV]/);
    }
  });

  it('rispetta il minimo della policy', () => {
    const p = componiPasswordTemporanea(new Uint8Array(BYTE_TEMPORANEA).fill(7));
    expect(p.length).toBeGreaterThanOrEqual(PASSWORD_MIN);
    expect(validaPassword(p).ok).toBe(true);
  });

  it('è alternanza consonante-vocale, quindi pronunciabile', () => {
    const p = componiPasswordTemporanea(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]));
    expect(p.slice(0, 6).toLowerCase()).toMatch(/^([bcdfgmnprstz][aeiou]){3}$/);
  });

  it('solleva se i byte non bastano: meglio fermarsi che inventare', () => {
    expect(() => componiPasswordTemporanea(new Uint8Array(BYTE_TEMPORANEA - 1))).toThrow();
  });

  it('usa i byte in eccesso senza lamentarsi', () => {
    expect(() => componiPasswordTemporanea(new Uint8Array(64).fill(3))).not.toThrow();
  });
});

describe('deveCambiarePassword', () => {
  it('solo un sì esplicito ferma la persona', () => {
    expect(deveCambiarePassword({ mustChangePassword: true })).toBe(true);
    expect(deveCambiarePassword({ mustChangePassword: false })).toBe(false);
    expect(deveCambiarePassword({ mustChangePassword: null })).toBe(false);
    expect(deveCambiarePassword({})).toBe(false);
  });
});

describe('mostraPromemoriaPassword', () => {
  it('solo un sì esplicito mostra il promemoria', () => {
    expect(mostraPromemoriaPassword({ passwordProvvisoria: true })).toBe(true);
    expect(mostraPromemoriaPassword({ passwordProvvisoria: false })).toBe(false);
    expect(mostraPromemoriaPassword({ passwordProvvisoria: null })).toBe(false);
    expect(mostraPromemoriaPassword({})).toBe(false);
  });

  it('è un fatto indipendente dal blocco', () => {
    // Il caso nuovo, quello che con una colonna sola non si poteva scrivere:
    // entra senza muro, ma la password è ancora quella dell'ufficio.
    const entraConPromemoria = { mustChangePassword: false, passwordProvvisoria: true };
    expect(deveCambiarePassword(entraConPromemoria)).toBe(false);
    expect(mostraPromemoriaPassword(entraConPromemoria)).toBe(true);

    // E il vecchio, che resta il predefinito.
    const bloccato = { mustChangePassword: true, passwordProvvisoria: true };
    expect(deveCambiarePassword(bloccato)).toBe(true);
    expect(mostraPromemoriaPassword(bloccato)).toBe(true);
  });
});

describe('etichettaRuolo', () => {
  it('scrive i mestieri in italiano, singolare e plurale', () => {
    expect(etichettaRuolo('admin')).toBe('Amministratore');
    expect(etichettaRuolo('admin', 'plurale')).toBe('Amministratori');
    expect(etichettaRuolo('tecnico')).toBe('Tecnico');
    expect(etichettaRuolo('tecnico', 'plurale')).toBe('Tecnici');
  });

  it('non mostra MAI il valore grezzo di un ruolo che non conosce', () => {
    // Fra gli altri, i due dismessi: `owner` e `capo` non li assume più
    // nessuno, ma una riga vecchia nell'audit può ancora contenerli.
    for (const r of ['owner', 'capo', 'chissa', '', null, 42]) {
      const out = etichettaRuolo(r);
      expect(out).toBe('Altro');
      expect(out).not.toBe(String(r));
    }
    expect(etichettaRuolo('owner', 'plurale')).toBe('Altri');
  });

  it('ogni ruolo vivo ha entrambe le forme', () => {
    for (const r of RUOLI_VIVI) {
      expect(etichettaRuolo(r)).not.toBe('Altro');
      expect(etichettaRuolo(r, 'plurale')).not.toBe('Altri');
    }
  });
});

describe('statoPasswordAllaNascita', () => {
  it('per invito niente è provvisorio: la password la scegle la persona', () => {
    expect(statoPasswordAllaNascita({ perInvito: true })).toEqual({
      must_change_password: false,
      password_provvisoria: false,
    });
    // Anche chiedendo il blocco: non c'è nessuna password nostra da cambiare.
    expect(statoPasswordAllaNascita({ perInvito: true, cambio: 'obbligatorio' })).toEqual({
      must_change_password: false,
      password_provvisoria: false,
    });
  });

  it('senza dire niente, blocca: è il predefinito prudente', () => {
    expect(statoPasswordAllaNascita({ perInvito: false })).toEqual({
      must_change_password: true,
      password_provvisoria: true,
    });
  });

  it('col promemoria entra, ma resta dichiarato provvisorio', () => {
    expect(statoPasswordAllaNascita({ perInvito: false, cambio: 'promemoria' })).toEqual({
      must_change_password: false,
      password_provvisoria: true,
    });
  });

  it('l’invariante regge in tutti i casi: bloccato implica provvisorio', () => {
    for (const perInvito of [true, false]) {
      for (const cambio of ['obbligatorio', 'promemoria', undefined] as const) {
        const r = statoPasswordAllaNascita({ perInvito, ...(cambio ? { cambio } : {}) });
        if (r.must_change_password) expect(r.password_provvisoria).toBe(true);
      }
    }
  });
});
