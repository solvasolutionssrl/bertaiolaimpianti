import { describe, expect, it } from 'vitest';

import {
  GIORNI_VALIDITA,
  etichettaStatoLink,
  giorniRimasti,
  linkApribile,
  mediaVisibilePubblicamente,
  scadenzaDa,
  statoLink,
  urlLinkPubblico,
} from './link-pubblico';

const ADESSO = new Date('2026-10-06T12:00:00Z');
const fra = (giorni: number) =>
  new Date(ADESSO.getTime() + giorni * 24 * 3600 * 1000).toISOString();

describe('statoLink', () => {
  it('e attivo finche non e scaduto ne spento', () => {
    expect(statoLink({ expiresAt: fra(10), revokedAt: null }, ADESSO)).toBe('attivo');
  });

  it('e scaduto quando il tempo e passato', () => {
    expect(statoLink({ expiresAt: fra(-1), revokedAt: null }, ADESSO)).toBe('scaduto');
  });

  it('scade all’istante esatto, non un attimo dopo', () => {
    expect(
      statoLink({ expiresAt: ADESSO.toISOString(), revokedAt: null }, ADESSO),
    ).toBe('scaduto');
  });

  it('un link spento resta spento anche dopo la scadenza', () => {
    // «L'ho chiuso io» e' l'informazione utile; «e' passato il tempo» e' ovvia.
    expect(
      statoLink({ expiresAt: fra(-5), revokedAt: fra(-6) }, ADESSO),
    ).toBe('revocato');
  });

  it('spento batte attivo', () => {
    expect(
      statoLink({ expiresAt: fra(10), revokedAt: fra(-1) }, ADESSO),
    ).toBe('revocato');
  });
});

describe('linkApribile — l’unica domanda che conta lato server', () => {
  it('apre solo il link attivo', () => {
    expect(linkApribile({ expiresAt: fra(1), revokedAt: null }, ADESSO)).toBe(true);
    expect(linkApribile({ expiresAt: fra(-1), revokedAt: null }, ADESSO)).toBe(false);
    expect(linkApribile({ expiresAt: fra(1), revokedAt: fra(0) }, ADESSO)).toBe(false);
  });
});

describe('scadenzaDa', () => {
  it('mette trenta giorni di default', () => {
    expect(scadenzaDa(ADESSO).toISOString()).toBe(fra(GIORNI_VALIDITA));
  });

  it('accetta una durata diversa', () => {
    expect(scadenzaDa(ADESSO, 7).toISOString()).toBe(fra(7));
  });

  it('produce un link che nasce apribile', () => {
    const expiresAt = scadenzaDa(ADESSO).toISOString();
    expect(linkApribile({ expiresAt, revokedAt: null }, ADESSO)).toBe(true);
  });
});

describe('giorniRimasti', () => {
  it('conta i giorni interi che mancano', () => {
    expect(giorniRimasti({ expiresAt: fra(10) }, ADESSO)).toBe(10);
  });

  it('arrotonda per eccesso: mezza giornata e ancora un giorno', () => {
    expect(giorniRimasti({ expiresAt: fra(0.5) }, ADESSO)).toBe(1);
  });

  it('non torna mai un numero negativo', () => {
    expect(giorniRimasti({ expiresAt: fra(-30) }, ADESSO)).toBe(0);
  });

  it('a scadenza esatta dice zero', () => {
    expect(giorniRimasti({ expiresAt: ADESSO.toISOString() }, ADESSO)).toBe(0);
  });
});

describe('etichettaStatoLink', () => {
  it('copre i tre stati', () => {
    expect(etichettaStatoLink('attivo')).toBe('Attivo');
    expect(etichettaStatoLink('scaduto')).toBe('Scaduto');
    expect(etichettaStatoLink('revocato')).toBe('Spento');
  });
});

describe('urlLinkPubblico', () => {
  it('compone un indirizzo corto', () => {
    expect(urlLinkPubblico('https://app.kommessa.it', 'abc')).toBe(
      'https://app.kommessa.it/c/abc',
    );
  });

  it('non raddoppia la barra se l’origine ne ha gia una', () => {
    expect(urlLinkPubblico('https://app.kommessa.it/', 'abc')).toBe(
      'https://app.kommessa.it/c/abc',
    );
  });
});

describe('mediaVisibilePubblicamente', () => {
  it('lascia passare foto e video', () => {
    expect(mediaVisibilePubblicamente('image/jpeg')).toBe(true);
    expect(mediaVisibilePubblicamente('video/mp4')).toBe(true);
  });

  it('NON lascia passare documenti e preventivi', () => {
    // Un link mandato a un cliente non deve diventare una finestra
    // sull'archivio di lavoro.
    expect(mediaVisibilePubblicamente('application/pdf')).toBe(false);
    expect(
      mediaVisibilePubblicamente(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ),
    ).toBe(false);
  });

  it('su un tipo assente dice di no', () => {
    expect(mediaVisibilePubblicamente(null)).toBe(false);
    expect(mediaVisibilePubblicamente(undefined)).toBe(false);
    expect(mediaVisibilePubblicamente('')).toBe(false);
  });
});
