import { describe, expect, it } from 'vitest';

import {
  MAX_TENTATIVI,
  esitoTentativoFallito,
  jobDaAvviare,
  prontoPerPartire,
  prossimoRisveglioMs,
  type JobPolicy,
} from './upload-queue-policy';

const ORA = 1_700_000_000_000;

function job(
  id: string,
  status: string,
  nextAttemptAt: number | null = null,
): JobPolicy {
  return { id, status, nextAttemptAt };
}

describe('prontoPerPartire — REPRO del bug "backoff ignorato"', () => {
  it('NON avvia un job in attesa di ritentare', () => {
    // Questo è il caso che il vecchio filtro sbagliava: guardava solo lo
    // status 'queued' e faceva ripartire il retry all'istante.
    expect(prontoPerPartire(job('a', 'queued', ORA + 8_000), ORA)).toBe(false);
  });

  it('avvia quando il momento è arrivato', () => {
    expect(prontoPerPartire(job('a', 'queued', ORA - 1), ORA)).toBe(true);
    expect(prontoPerPartire(job('a', 'queued', ORA), ORA)).toBe(true);
  });

  it('un job mai fallito (nextAttemptAt null) parte subito', () => {
    expect(prontoPerPartire(job('a', 'queued', null), ORA)).toBe(true);
  });

  it('ignora gli stati non in coda', () => {
    for (const s of ['init', 'uploading', 'finalizing', 'done', 'failed', 'canceled']) {
      expect(prontoPerPartire(job('a', s), ORA)).toBe(false);
    }
  });
});

describe('jobDaAvviare', () => {
  it('riempie solo gli slot liberi contando i job attivi', () => {
    const jobs = [
      job('att1', 'uploading'),
      job('att2', 'init'),
      job('q1', 'queued'),
      job('q2', 'queued'),
      job('q3', 'queued'),
    ];
    expect(
      jobDaAvviare({ jobs, ora: ORA, maxConcorrenti: 3, inEsecuzione: new Set() }),
    ).toEqual(['q1']);
  });

  it('non avvia nulla se il pool è pieno', () => {
    const jobs = [
      job('a', 'uploading'),
      job('b', 'uploading'),
      job('c', 'finalizing'),
      job('q', 'queued'),
    ];
    expect(
      jobDaAvviare({ jobs, ora: ORA, maxConcorrenti: 3, inEsecuzione: new Set() }),
    ).toEqual([]);
  });

  it('non ri-dispatcha un job già in esecuzione', () => {
    const jobs = [job('q1', 'queued'), job('q2', 'queued')];
    expect(
      jobDaAvviare({
        jobs,
        ora: ORA,
        maxConcorrenti: 3,
        inEsecuzione: new Set(['q1']),
      }),
    ).toEqual(['q2']);
  });

  it('salta i job in attesa di backoff e prende quelli pronti', () => {
    const jobs = [
      job('inAttesa', 'queued', ORA + 30_000),
      job('pronto', 'queued', ORA - 10),
    ];
    expect(
      jobDaAvviare({ jobs, ora: ORA, maxConcorrenti: 3, inEsecuzione: new Set() }),
    ).toEqual(['pronto']);
  });
});

describe('prossimoRisveglioMs', () => {
  it('ritorna null se non c\'è nulla in attesa', () => {
    expect(prossimoRisveglioMs([job('a', 'queued')], ORA)).toBeNull();
    expect(prossimoRisveglioMs([job('a', 'uploading')], ORA)).toBeNull();
  });

  it('prende il primo retry in scadenza, con un filo di margine', () => {
    const jobs = [
      job('a', 'queued', ORA + 30_000),
      job('b', 'queued', ORA + 8_000),
    ];
    expect(prossimoRisveglioMs(jobs, ORA)).toBe(8_010);
  });

  it('non scende sotto i 50ms', () => {
    expect(prossimoRisveglioMs([job('a', 'queued', ORA + 1)], ORA)).toBe(50);
  });
});

describe('esitoTentativoFallito', () => {
  it('annullamento utente: nessun ritentativo', () => {
    expect(
      esitoTentativoFallito({ tentativiFatti: 0, annullato: true, ora: ORA }),
    ).toEqual({ status: 'canceled', attempt: 1, nextAttemptAt: null });
  });

  it('ritenta con ritardo crescente', () => {
    const r1 = esitoTentativoFallito({ tentativiFatti: 0, annullato: false, ora: ORA });
    const r2 = esitoTentativoFallito({ tentativiFatti: 1, annullato: false, ora: ORA });
    const r3 = esitoTentativoFallito({ tentativiFatti: 2, annullato: false, ora: ORA });
    expect(r1).toEqual({ status: 'queued', attempt: 1, nextAttemptAt: ORA + 2_000 });
    expect(r2).toEqual({ status: 'queued', attempt: 2, nextAttemptAt: ORA + 8_000 });
    expect(r3).toEqual({ status: 'queued', attempt: 3, nextAttemptAt: ORA + 30_000 });
  });

  it('si arrende all\'ultimo tentativo', () => {
    const r = esitoTentativoFallito({
      tentativiFatti: MAX_TENTATIVI - 1,
      annullato: false,
      ora: ORA,
    });
    expect(r).toEqual({ status: 'failed', attempt: MAX_TENTATIVI, nextAttemptAt: null });
  });

  it('un ciclo completo consuma esattamente MAX_TENTATIVI tentativi', () => {
    let attempt = 0;
    let giri = 0;
    for (;;) {
      const e = esitoTentativoFallito({
        tentativiFatti: attempt,
        annullato: false,
        ora: ORA,
      });
      giri += 1;
      attempt = e.attempt;
      if (e.status === 'failed') break;
      if (giri > 20) throw new Error('loop infinito nella policy di retry');
    }
    expect(giri).toBe(MAX_TENTATIVI);
  });
});
