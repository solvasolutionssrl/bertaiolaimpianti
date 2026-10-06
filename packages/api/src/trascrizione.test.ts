import { describe, expect, it } from 'vitest';

import {
  IMPOSTAZIONI_TRASCRIZIONE_VUOTE,
  MAX_VOCABOLARIO,
  MODELLO_ESTREMO,
  accettaVocabolario,
  famigliaTrascrizione,
  impostazioniTrascrizioneDaConfig,
  nomeModelloPlausibile,
  preparaVocabolario,
  promptConVocabolario,
  risolviModelloTrascrizione,
  validaImpostazioniTrascrizione,
} from './trascrizione';

describe('famigliaTrascrizione — la grammatica della richiesta', () => {
  it('riconosce i tre gruppi noti', () => {
    expect(famigliaTrascrizione('gpt-transcribe')).toBe('moderna');
    expect(famigliaTrascrizione('gpt-live-transcribe')).toBe('moderna');
    expect(famigliaTrascrizione('gpt-4o-transcribe')).toBe('gpt4o');
    expect(famigliaTrascrizione('gpt-4o-mini-transcribe')).toBe('gpt4o');
    expect(famigliaTrascrizione('whisper-1')).toBe('whisper');
  });

  it('mette i gpt-4o PRIMA dei gpt-: invertire le regole romperebbe tutto', () => {
    // `gpt-4o-transcribe` comincia per `gpt-` ma non e' della famiglia moderna.
    expect(famigliaTrascrizione('gpt-4o-transcribe')).not.toBe('moderna');
  });

  it('indovina la famiglia di modelli che non esistono ancora', () => {
    expect(famigliaTrascrizione('gpt-transcribe-2')).toBe('moderna');
    expect(famigliaTrascrizione('gpt-transcribe-2027-01-01')).toBe('moderna');
    expect(famigliaTrascrizione('gpt-4o-transcribe-mini-2027')).toBe('gpt4o');
    expect(famigliaTrascrizione('whisper-2')).toBe('whisper');
  });

  it('su un nome ignoto sceglie la via che male non fa', () => {
    // `language` e `prompt` li accettano tutti: meglio nessun vocabolario che
    // una richiesta rifiutata per un campo di troppo.
    expect(famigliaTrascrizione('qualcosa-di-nuovo')).toBe('whisper');
    expect(famigliaTrascrizione('')).toBe('whisper');
  });

  it('non si lascia fermare da maiuscole e spazi', () => {
    expect(famigliaTrascrizione('  GPT-Transcribe ')).toBe('moderna');
  });

  it('dice chi sa ricevere il vocabolario', () => {
    expect(accettaVocabolario('gpt-transcribe')).toBe(true);
    expect(accettaVocabolario('gpt-4o-mini-transcribe')).toBe(false);
    expect(accettaVocabolario('whisper-1')).toBe(false);
  });
});

describe('nomeModelloPlausibile', () => {
  it('accetta i nomi veri', () => {
    for (const n of ['gpt-transcribe', 'whisper-1', 'gpt-4o-mini-transcribe']) {
      expect(nomeModelloPlausibile(n)).toBe(true);
    }
  });

  it('ferma il refuso evidente senza fare il censore', () => {
    expect(nomeModelloPlausibile('')).toBe(false);
    expect(nomeModelloPlausibile('   ')).toBe(false);
    expect(nomeModelloPlausibile('due parole')).toBe(false);
    expect(nomeModelloPlausibile('gpt,transcribe')).toBe(false);
    expect(nomeModelloPlausibile('-inizia-male')).toBe(false);
    expect(nomeModelloPlausibile('x'.repeat(81))).toBe(false);
    expect(nomeModelloPlausibile(null)).toBe(false);
    expect(nomeModelloPlausibile(42)).toBe(false);
  });

  it('lascia passare un modello che non conosciamo: non siamo noi a decidere', () => {
    expect(nomeModelloPlausibile('modello-del-futuro-v9')).toBe(true);
  });
});

describe('impostazioniTrascrizioneDaConfig — lettura tollerante', () => {
  it('su niente torna vuoto invece di sollevare', () => {
    for (const sporco of [null, undefined, 'stringa', 42, []]) {
      expect(impostazioniTrascrizioneDaConfig(sporco)).toEqual(
        IMPOSTAZIONI_TRASCRIZIONE_VUOTE,
      );
    }
  });

  it('legge predefinito e proposti', () => {
    expect(
      impostazioniTrascrizioneDaConfig({
        predefinito: 'gpt-transcribe',
        ammessi: ['gpt-transcribe', 'whisper-1'],
      }),
    ).toEqual({ predefinito: 'gpt-transcribe', ammessi: ['gpt-transcribe', 'whisper-1'] });
  });

  it('scarta in silenzio le voci storte, tenendo le buone', () => {
    const o = impostazioniTrascrizioneDaConfig({
      predefinito: 'due parole',
      ammessi: ['gpt-transcribe', '', 'con spazio', 'whisper-1'],
    });
    expect(o.predefinito).toBeNull();
    expect(o.ammessi).toEqual(['gpt-transcribe', 'whisper-1']);
  });

  it('toglie i doppioni dai proposti', () => {
    const o = impostazioniTrascrizioneDaConfig({
      ammessi: ['whisper-1', 'whisper-1', ' whisper-1 '],
    });
    expect(o.ammessi).toEqual(['whisper-1']);
  });
});

describe('validaImpostazioniTrascrizione — scrittura che rifiuta e dice perche', () => {
  it('accetta il caso buono', () => {
    expect(
      validaImpostazioniTrascrizione({
        predefinito: 'gpt-transcribe',
        ammessi: ['gpt-transcribe'],
      }),
    ).toEqual({ ok: true, errori: [] });
  });

  it('accetta il campo lasciato vuoto', () => {
    expect(validaImpostazioniTrascrizione({ predefinito: '' }).ok).toBe(true);
    expect(validaImpostazioniTrascrizione({}).ok).toBe(true);
  });

  it('raccoglie TUTTI gli errori, non si ferma al primo', () => {
    const e = validaImpostazioniTrascrizione({
      predefinito: 'non valido',
      ammessi: ['va bene', 'nemmeno questo'],
    });
    expect(e.ok).toBe(false);
    expect(e.errori).toHaveLength(3);
  });

  it('cita il valore incriminato, cosi si sa quale correggere', () => {
    const e = validaImpostazioniTrascrizione({ ammessi: ['con spazio'] });
    expect(e.errori[0]).toContain('con spazio');
  });
});

describe('risolviModelloTrascrizione — chi vince', () => {
  it('la scelta del cliente batte tutto', () => {
    expect(
      risolviModelloTrascrizione({
        tenant: 'whisper-1',
        globale: 'gpt-transcribe',
        env: 'gpt-4o-transcribe',
      }),
    ).toBe('whisper-1');
  });

  it('senza scelta del cliente vale il predefinito di piattaforma', () => {
    expect(
      risolviModelloTrascrizione({ tenant: null, globale: 'gpt-transcribe' }),
    ).toBe('gpt-transcribe');
  });

  it("poi l'ambiente", () => {
    expect(risolviModelloTrascrizione({ env: 'whisper-1' })).toBe('whisper-1');
  });

  it('e in ultimo la rete di sicurezza', () => {
    expect(risolviModelloTrascrizione({})).toBe(MODELLO_ESTREMO);
  });

  it('un livello sporco scende di un gradino invece di rompere la chiamata', () => {
    expect(
      risolviModelloTrascrizione({ tenant: 'nome con spazi', globale: 'gpt-transcribe' }),
    ).toBe('gpt-transcribe');
    expect(risolviModelloTrascrizione({ tenant: 42, globale: null })).toBe(
      MODELLO_ESTREMO,
    );
  });

  it('non pretende che il modello sia fra i proposti', () => {
    // L'elenco dei proposti e' un suggerimento del pannello, non un permesso:
    // un modello appena uscito deve funzionare subito.
    expect(risolviModelloTrascrizione({ tenant: 'modello-mai-visto-v3' })).toBe(
      'modello-mai-visto-v3',
    );
  });
});

describe('preparaVocabolario', () => {
  it('conserva l’ordine di arrivo, che e l’ordine di importanza', () => {
    expect(preparaVocabolario(['Verona', 'Valeggio sul Mincio'])).toEqual([
      'Verona',
      'Valeggio sul Mincio',
    ]);
  });

  it('toglie i doppioni ignorando maiuscole e accenti, tenendo la prima grafia', () => {
    expect(
      preparaVocabolario(['Valeggio', 'valeggio', 'VALEGGIO', 'Nicolò', 'nicolo']),
    ).toEqual(['Valeggio', 'Nicolò']);
  });

  it('butta le parole troppo corte, che fanno solo rumore', () => {
    expect(preparaVocabolario(['di', 'a', 'Verona'])).toEqual(['Verona']);
  });

  it('butta le stringhe assurdamente lunghe', () => {
    expect(preparaVocabolario(['x'.repeat(41)])).toEqual([]);
  });

  it('compatta gli spazi interni', () => {
    expect(preparaVocabolario(['Valeggio   sul  Mincio'])).toEqual([
      'Valeggio sul Mincio',
    ]);
  });

  it('ignora tutto cio che non e una stringa', () => {
    expect(preparaVocabolario([null, 42, {}, 'Verona'])).toEqual(['Verona']);
  });

  it('taglia la coda al tetto, non la testa', () => {
    const tante = Array.from({ length: 150 }, (_, i) => `comune${i}`);
    const out = preparaVocabolario(tante);
    expect(out).toHaveLength(MAX_VOCABOLARIO);
    expect(out[0]).toBe('comune0');
  });

  it('rispetta un tetto piu basso se glielo si chiede', () => {
    expect(preparaVocabolario(['uno', 'due', 'tre'], 2)).toHaveLength(2);
  });

  it('su niente non produce niente', () => {
    expect(preparaVocabolario([])).toEqual([]);
  });
});

describe('promptConVocabolario', () => {
  it('senza niente non produce nessun prompt', () => {
    expect(promptConVocabolario(undefined, [])).toBeUndefined();
    expect(promptConVocabolario('   ', [])).toBeUndefined();
  });

  it('mette il contesto davanti e le parole dopo', () => {
    const p = promptConVocabolario('Idraulico in provincia di Verona.', ['Valeggio']);
    expect(p).toBe('Idraulico in provincia di Verona. Termini ricorrenti: Valeggio.');
  });

  it('regge il solo vocabolario', () => {
    expect(promptConVocabolario(undefined, ['Verona'])).toBe(
      'Termini ricorrenti: Verona.',
    );
  });

  it('tronca per stare nella finestra di Whisper', () => {
    const lungo = Array.from({ length: 200 }, (_, i) => `comune${i}`);
    expect(promptConVocabolario('x', lungo)!.length).toBeLessThanOrEqual(800);
  });
});
