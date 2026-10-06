-- ============================================================================
-- Il modello di trascrizione audio smette di essere un elenco nel codice
-- ============================================================================
--
-- PERCHE'
--
-- Fino a oggi i modelli selezionabili erano scritti in QUATTRO punti che non si
-- parlavano: le schede del pannello super admin, lo schema zod dell'azione che
-- salva, una costante TypeScript, e il CHECK qui sotto. Aggiungere un modello
-- voleva dire ricordarsene quattro volte; dimenticarne uno non dava errore,
-- dava un modello che si poteva scegliere e non salvare, o salvare e non usare.
--
-- Peggio: ogni volta che OpenAI pubblica qualcosa di meglio serviva un DEPLOY
-- per poterlo anche solo provare, e nel frattempo ogni cliente restava fermo
-- alla scelta fatta il giorno dell'installazione.
--
-- E' lo stesso difetto dei limiti di invio media prima del 05/10/2026: una
-- decisione di prodotto congelata nel codice. La cura e' la stessa, e usa la
-- stessa tabella.
--
-- COSA CAMBIA
--
--   1. Nasce la riga `modelli_trascrizione` in `platform_settings`:
--      { "predefinito": "<id>", "ammessi": ["<id>", ...] }
--      `predefinito` e' quello che usa chi non ha scelto niente; `ammessi` e'
--      solo l'elenco che il pannello PROPONE, non un permesso: si puo' sempre
--      scrivere a mano il nome di un modello appena uscito.
--
--   2. Sparisce `tenants_transcribe_model_check`. Il catalogo dei modelli di
--      OpenAI non e' un nostro elenco da mantenere, e un CHECK e' la forma piu'
--      rigida possibile di elenco scritto nel codice: per aggiungere un nome
--      servirebbe una migration. Al suo posto, in applicazione, si controlla
--      solo che il nome abbia una FORMA plausibile (niente spazi, niente
--      virgole) — vedi `@kommessa/api/trascrizione`.
--
--   3. La scelta di Bertaiola viene AZZERATA, non riscritta. Oggi e' inchiodata
--      a `gpt-4o-mini-transcribe`; messa a NULL segue il predefinito di
--      piattaforma, che e' il punto di tutta l'operazione: un domani si cambia
--      una riga e si muovono tutti i clienti insieme.
--
-- EFFETTO REALE SUL COMPORTAMENTO (verificato sui dati del 06/10/2026)
--
--   BER     gpt-4o-mini-transcribe -> (nessuna scelta) -> gpt-transcribe
--   DEMOK   (nessuna scelta)       -> gpt-transcribe
--   FPMIMP  (nessuna scelta)       -> gpt-transcribe   [non detta: kantiere]
--   DEMOC   (nessuna scelta)       -> gpt-transcribe   [non detta: kantiere]
--
-- Bertaiola passa a `gpt-transcribe`, che costa $0,0045/minuto a tariffa fissa
-- invece di ~$0,003/minuto a consumo, ed e' l'unico che accetta un vocabolario:
-- gli passiamo i comuni dell'anagrafica, cosi' «Valeggio sul Mincio» smette di
-- diventare «sul Mincio». I tenant kantiere non trascrivono (la rotta
-- /api/voice/extract risponde 403 a chi ha solo Kantiere): per loro cambia il
-- nome di un modello che non viene mai chiamato.
--
-- ⚠️ `platform_settings` NON e' il posto dei segreti. La riga nuova non viene
-- concessa in lettura a `authenticated`: la policy elenca le chiavi pubbliche
-- una per una, e `modelli_trascrizione` non e' fra quelle. La legge solo il
-- service role. Niente da fare qui, ma e' il motivo per cui qui sotto non c'e'
-- nessuna GRANT: era una tentazione da evitare.
--
-- Idempotente: rieseguibile a vuoto.
-- ============================================================================

begin;

-- ── 1. il predefinito di piattaforma diventa dato ───────────────────────────

insert into public.platform_settings (chiave, valore)
values (
  'modelli_trascrizione',
  jsonb_build_object(
    'predefinito', 'gpt-transcribe',
    -- Suggerimenti per il pannello, non un permesso. Si aggiornano da li',
    -- senza migration e senza deploy.
    'ammessi', jsonb_build_array(
      'gpt-transcribe',
      'gpt-4o-mini-transcribe',
      'gpt-4o-transcribe',
      'whisper-1'
    )
  )
)
on conflict (chiave) do nothing;

-- ── 2. via il vincolo rigido ────────────────────────────────────────────────

alter table public.tenants
  drop constraint if exists tenants_transcribe_model_check;

comment on column public.tenants.transcribe_model is
  'Modello di trascrizione SOLO per questo cliente: un''eccezione, non la norma. '
  'NULL = segue il predefinito di piattaforma (platform_settings, riga '
  '"modelli_trascrizione"). Nessun CHECK di proposito: il catalogo dei modelli '
  'e'' di OpenAI, non nostro; la forma del nome la valida l''applicazione '
  '(@kommessa/api/trascrizione).';

-- ── 3. Bertaiola torna a seguire il predefinito ─────────────────────────────
--
-- Mirato: tocca SOLO la riga che oggi e' inchiodata al modello vecchio. Se
-- qualcuno in futuro sceglie di proposito quel modello per un cliente, una
-- riesecuzione di questa migration non glielo cancella piu', perche' la
-- condizione non combacia piu' con lo stato di partenza che stiamo correggendo.

update public.tenants
   set transcribe_model = null
 where slug = 'BER'
   and transcribe_model = 'gpt-4o-mini-transcribe';

commit;

notify pgrst, 'reload schema';
