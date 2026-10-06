-- ============================================================================
-- La priorita' scende da quattro gradini a tre
-- ============================================================================
--
-- PERCHE' TRE
--
-- Il conteggio sui dati veri del 06/10/2026, prima di toccare niente:
--
--   urgente    3
--   alta      22
--   media     53   <- il DEFAULT
--   bassa      0   <- mai usata da nessuno, in cinque mesi di produzione
--
-- Quattro gradini di cui uno non si e' mai acceso e uno e' riempito dal
-- default non sono una scala: sono tre gradini con un passaggio di troppo.
-- «media» non e' una scelta, e' cio' che esce quando non si sceglie — e il
-- fatto che «bassa» sia a zero lo dimostra: nessuno e' mai sceso sotto il
-- valore di partenza, perche' non c'era motivo.
--
-- Quindi i 53 «media» diventano «bassa», che e' il nuovo default. Dire «3 -
-- Bassa» su un task che nessuno ha marcato e' la verita'; dire «Media» era un
-- modo elegante di non dire niente. L'ordine relativo nelle liste non cambia:
-- chi era sopra resta sopra.
--
-- Il nome a schermo porta il numero — «1 - Urgente», «2 - Alta», «3 - Bassa» —
-- cosi' non serve ricordare se «alta» viene prima o dopo. Prima la stessa
-- colonna si presentava in NOVE modi diversi: nella pagina Task era
-- «Bassa/Media/Alta», nel modulo della richiesta al telefono diventava «Quando
-- capita / Normale / Presto», nei ticket era testo colorato con un'altra
-- tavolozza, e nella scheda del ticket compariva il valore grezzo del database
-- in minuscolo. Ora c'e' un vocabolario solo, in `@kommessa/api/priorita`.
--
-- ⚠️ PERCHE' «media» RESTA NEL TIPO POSTGRES
--
-- Togliere un valore da un `enum` significa ricreare il tipo. Quel tipo e'
-- usato da una chiave primaria (`sla_policy`), da un trigger di SLA e da due
-- default. Il guadagno sarebbe estetico, il rischio no. Il valore resta
-- accettato dal database e **non viene piu' scritto** dall'applicazione; chi
-- legge passa da `normalizzaPriorita`, che lo traduce in «bassa». Una riga
-- scritta a mano domani non rompe niente: si legge come «3 - Bassa».
--
-- Le righe `sla_policy` con priorita' «media» restano dove sono: sono
-- configurazione di un livello che non verra' piu' assegnato, quindi inerte.
-- Cancellarle vorrebbe dire toccare una chiave primaria per niente.
--
-- Idempotente: la seconda esecuzione non trova piu' nessun «media» e gira a
-- vuoto.
-- ============================================================================

begin;

-- ── 1. i task: 53 righe che dicevano «non so» ora dicono «normale» ──────────

update public.commessa_todo
   set priorita = 'bassa'
 where priorita = 'media';

alter table public.commessa_todo
  alter column priorita set default 'bassa';

comment on column public.commessa_todo.priorita is
  'Priorita'' su TRE livelli: urgente (1), alta (2), bassa (3, predefinito). '
  'Il tipo accetta ancora ''media'' per ragioni storiche ma l''applicazione non '
  'lo scrive piu'': chi legge passa da normalizzaPriorita (@kommessa/api/priorita), '
  'che lo traduce in ''bassa''. Vedi migration 20261006100000.';

-- ── 2. i ticket: stessa scala, stesso vocabolario ───────────────────────────
--
-- Oggi la tabella e' VUOTA (0 righe), quindi l'update non tocca niente: serve
-- a non lasciare in giro un percorso che domani ricreerebbe il quarto gradino.

update public.tickets
   set priorita = 'bassa'
 where priorita = 'media';

alter table public.tickets
  alter column priorita set default 'bassa';

comment on column public.tickets.priorita is
  'Priorita'' su TRE livelli, stessa scala dei task: urgente (1), alta (2), '
  'bassa (3, predefinito). ''media'' resta accettato dal tipo ma non si scrive '
  'piu''. Le righe sla_policy per ''media'' restano inerti.';

commit;

notify pgrst, 'reload schema';
