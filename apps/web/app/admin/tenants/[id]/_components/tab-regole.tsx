'use client';

import * as React from 'react';
import Link from 'next/link';
import { Building2, Lock, Settings2, ShieldCheck, Smartphone, UserCog } from 'lucide-react';
import { Badge, Card, CardContent, cn } from '@kommessa/ui';

import type { ImpostazioniKantiere } from '@/app/_lib/kantiere-config';

/**
 * Tab **Regole**: il censimento di tutte le regolette del mondo presenze per
 * questo cliente, in un posto solo, con scritto DOVE ognuna si cambia.
 *
 * Nasce dal censimento del 22/10/2026: in quattro mesi le regole si erano
 * sparse fra `tenant_modules.config` (ufficio), `tenants.features` (super
 * admin), la scheda del dipendente (ufficio), e un pugno di costanti nel
 * codice che nessuno cambia senza un deploy. Qui non si cambia niente: si
 * guarda, e si capisce chi ha la chiave. Una regola che qui compare come
 * «nel codice» e' una regola che un domani puo' diventare un'impostazione —
 * ma solo quando una riga di codice la legge (vedi CLAUDE.md, «pannello che
 * promette e non fa niente»).
 */

type Chiave = 'ufficio' | 'super_admin' | 'dipendente' | 'codice';

interface Regola {
  nome: string;
  valore: string;
  chiave: Chiave;
  /** Dove si cambia, a parole. */
  dove: string;
  /** Una riga che dice cosa fa. */
  cosa?: string;
}

interface Gruppo {
  titolo: string;
  icona: React.ComponentType<{ className?: string }>;
  regole: Regola[];
}

export interface DatiTabRegole {
  tenantId: string;
  tenantNome: string;
  kantiereAttivo: boolean;
  impostazioni: ImpostazioniKantiere;
  appMode: 'kommessa' | 'kantiere' | 'full';
  codiceAzienda: string | null;
  moduli: { kantiere: boolean; dipendenti: boolean; integrazione: boolean; personalizzazioni: boolean };
  dipendentiConfig: { pianificazione: boolean; ferie: boolean };
  features: Record<string, boolean | undefined>;
  timbro: { stato: string; dal: string | null };
  /** Quante persone per modalita' di lavoro. */
  persone: { totale: number; ufficio: number; esterno: number; aTurni: number; conCosto: number; capiSquadra: number };
}

const CHIAVE_META: Record<Chiave, { etichetta: string; classi: string; Icona: React.ComponentType<{ className?: string }> }> = {
  ufficio: { etichetta: 'Ufficio', classi: 'border-emerald-300 bg-emerald-50 text-emerald-800', Icona: Building2 },
  super_admin: { etichetta: 'Super admin', classi: 'border-primary/40 bg-primary/5 text-primary', Icona: ShieldCheck },
  dipendente: { etichetta: 'Scheda persona', classi: 'border-sky-300 bg-sky-50 text-sky-800', Icona: UserCog },
  codice: { etichetta: 'Nel codice', classi: 'border-border bg-muted text-muted-foreground', Icona: Lock },
};

const hm = (min: number) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;
const siNo = (b: boolean) => (b ? 'Sì' : 'No');
const ore = (h: number) => `${String(h).replace('.', ',')} h`;

export function TabRegole({ dati }: { dati: DatiTabRegole }) {
  const imp = dati.impostazioni;
  const f = dati.features;
  const feat = (k: string, def: boolean) => (f[k] === undefined ? `${siNo(def)} (predefinito)` : siNo(!!f[k]));
  const urlImpostazioni = 'Ufficio → Impostazioni → Kantiere';

  const gruppi: Gruppo[] = [
    {
      titolo: 'Che cosa è acceso',
      icona: Settings2,
      regole: [
        { nome: 'Esperienza app', valore: dati.appMode, chiave: 'super_admin', dove: 'Tab Moduli', cosa: 'kommessa = commesse · kantiere = presenze · full = tutte e due' },
        { nome: 'Codice azienda (login)', valore: dati.codiceAzienda ?? '—', chiave: 'super_admin', dove: 'Tab Moduli' },
        { nome: 'Modulo Kantiere', valore: siNo(dati.moduli.kantiere), chiave: 'super_admin', dove: 'Tab Moduli' },
        { nome: 'Modulo Dipendenti', valore: siNo(dati.moduli.dipendenti), chiave: 'super_admin', dove: 'Tab Moduli', cosa: `pianificazione ${siNo(dati.dipendentiConfig.pianificazione)} · ferie e permessi ${siNo(dati.dipendentiConfig.ferie)}` },
        { nome: 'Modulo Integrazione (/api/v1)', valore: siNo(dati.moduli.integrazione), chiave: 'super_admin', dove: 'Tab Integrazione' },
        { nome: 'Personalizzazioni', valore: siNo(dati.moduli.personalizzazioni), chiave: 'super_admin', dove: 'Tab Moduli' },
        { nome: 'Timbratrice Timbro', valore: dati.timbro.stato + (dati.timbro.dal ? ` dal ${dati.timbro.dal}` : ''), chiave: 'super_admin', dove: 'Tab Timbro' },
        { nome: 'Turno in cantiere (mondo commesse)', valore: feat('turno_tecnici', false), chiave: 'super_admin', dove: 'Tab Funzioni, o l’ufficio in Impostazioni → Funzioni' },
        { nome: 'Password a scadenza', valore: feat('scadenza_password', false), chiave: 'super_admin', dove: 'Tab Funzioni', cosa: '10 dicembre, marzo, giugno, settembre' },
        { nome: 'Kontabilità (spese di cantiere)', valore: siNo(imp.kontabilitaAttiva), chiave: 'ufficio', dove: `${urlImpostazioni} → Kontabilità` },
      ],
    },
    {
      titolo: 'Come si timbra',
      icona: Smartphone,
      regole: [
        { nome: 'Avvio turno su ogni cantiere', valore: siNo(imp.avvioTurnoLibero), chiave: 'ufficio', dove: `${urlImpostazioni} → Turni`, cosa: 'No = il tecnico vede solo i cantieri con un cartello QR attivo' },
        { nome: 'Ripartizione ore alla chiusura', valore: siNo(imp.splitFineTurnoAttivo), chiave: 'ufficio', dove: `${urlImpostazioni} → Turni` },
        { nome: 'Registra giornata senza timbrature', valore: siNo(imp.registraGiornataAttivo), chiave: 'ufficio', dove: `${urlImpostazioni} → Turni` },
        { nome: 'Tolleranza sulla ripartizione', valore: `${imp.tolleranzaChiusuraMin} min`, chiave: 'ufficio', dove: `${urlImpostazioni} → Turni` },
        { nome: 'Passo dei tasti + e −', valore: `${imp.passoMinutiStepper} min`, chiave: 'ufficio', dove: `${urlImpostazioni} → Turni` },
        { nome: 'Modalità di lavoro (ufficio / esterno)', valore: `${dati.persone.ufficio} in ufficio · ${dati.persone.esterno} esterni`, chiave: 'dipendente', dove: 'Ufficio → Personale → Dipendenti', cosa: 'In ufficio: giornata in un tocco, viaggio dichiarato invece che chiesto' },
        { nome: 'Capo squadra (timbra per la squadra, apre lavori)', valore: `${dati.persone.capiSquadra} ${dati.persone.capiSquadra === 1 ? 'persona' : 'persone'}`, chiave: 'super_admin', dove: 'Tab Utenti → poteri' },
        { nome: 'Fine turno in pausa', valore: 'Vietata', chiave: 'codice', dove: 'AZIONI_AMMESSE in kantiere-timbra.ts', cosa: 'Prima si riprende, poi si chiude' },
        { nome: 'Doppio tocco sullo stesso tasto', valore: '25 s', chiave: 'codice', dove: 'eventoRecenteUguale in kantiere-timbra.ts' },
        { nome: 'Due timbri del terminale sono lo stesso gesto se distano meno di', valore: '2 min', chiave: 'codice', dove: 'FINESTRA_DOPPIONE_MIN in timbri-sequenza.ts' },
        { nome: 'Un tecnico può ripartire da solo una giornata timbrata fino a', valore: '31 giorni indietro', chiave: 'codice', dove: 'GIORNI_RIPARTIZIONE_TECNICO in kantiere-timbra.ts' },
        { nome: 'Finestra di auto-modifica della giornata dal tecnico', valore: 'oggi + 3 giorni', chiave: 'codice', dove: 'FINESTRA_MODIFICA_GIORNI in kantiere-rapportino.ts' },
      ],
    },
    {
      titolo: 'Ore, pause e viaggio',
      icona: Settings2,
      regole: [
        { nome: 'Orario ordinario giornaliero', valore: hm(imp.orarioOrdinarioMin), chiave: 'ufficio', dove: `${urlImpostazioni} → Orario e ore`, cosa: 'Ordinarie = lavoro + viaggio fino all’orario; oltre: straordinario e viaggio eccedente' },
        { nome: 'Quote con il viaggio nell’orario dal', valore: imp.quoteOreDal ?? 'da sempre', chiave: 'codice', dove: 'tenant_modules.config.quote_ore_dal (solo via SQL)' },
        { nome: 'Arrotondamento tempo di viaggio', valore: `${imp.arrotondamentoViaggioMin} min`, chiave: 'ufficio', dove: `${urlImpostazioni} → Orario e ore` },
        { nome: 'Arrotondamento ore di lavoro', valore: imp.arrotondamentoOreMin === 0 ? 'al minuto' : `${imp.arrotondamentoOreMin} min`, chiave: 'ufficio', dove: `${urlImpostazioni} → Orario e ore` },
        { nome: 'Arrotondamento delle timbrature nei calcoli', valore: imp.arrotondamentoTimbriMin === 0 ? 'al minuto' : `${imp.arrotondamentoTimbriMin} min al più vicino, dal ${imp.arrotondamentoTimbriDal ?? 'sempre'}`, chiave: 'ufficio', dove: `${urlImpostazioni} → Orario e ore`, cosa: 'Vale per badge, QR e app; il dato nel database resta esatto; la data di partenza la scrive il salvataggio.' },
        { nome: 'Promemoria pausa pranzo oltre', valore: ore(imp.sogliaPausaPranzoOre), chiave: 'ufficio', dove: `${urlImpostazioni} → Pause` },
        { nome: 'Chiusura automatica della pausa dopo', valore: ore(imp.sogliaAutoSpegnimentoPausaOre), chiave: 'ufficio', dove: `${urlImpostazioni} → Pause` },
        { nome: 'Pause rapide proposte', valore: '30 · 45 · 60 min, oppure libera a passi di 5 (5–240)', chiave: 'codice', dove: 'kantiere-pausa.ts' },
        { nome: 'Km solo a chi guida', valore: siNo(imp.kmSoloAutista), chiave: 'ufficio', dove: `${urlImpostazioni} → Viaggi` },
        { nome: 'Stime di viaggio', valore: imp.routingProvider === 'google' ? 'Google (traffico reale)' : 'Free (OSRM / ORS, senza traffico)', chiave: 'super_admin', dove: 'Tab Viaggio' },
        { nome: 'Trasferimenti fra cantieri', valore: 'Sempre viaggio', chiave: 'codice', dove: 'dal 15/09/2026, toggle tolto' },
        { nome: 'Sedi proposte per un cantiere', valore: 'Predefinita + associate', chiave: 'codice', dove: 'sedeAmmessaPerCantiere', cosa: 'L’abitazione privata è stata ritirata il 26/10/2026 (CCNL): si conta come se si partisse sempre dalla sede.' },
        { nome: 'Scelta della fase obbligatoria', valore: siNo(imp.faseObbligatoria), chiave: 'ufficio', dove: `${urlImpostazioni} → Turni`, cosa: 'Con le fasi presenti sul cantiere la riga di ore ne indica una; le righe già scritte senza fase restano valide. Il gestionale non blocca: senza fase scrive sul cantiere intero.' },
        { nome: 'Sottocantieri (fasi) di un cantiere', valore: 'Facoltativi; il cantiere intero resta scegibile', chiave: 'ufficio', dove: 'Ufficio → Cantieri → scheda cantiere → Sottocantieri, oppure dal gestionale (POST /letture, entità sottocantiere)', cosa: 'Le ore vanno alla fase se scelta; il viaggio resta per cantiere; pausa, ripresa e fine ereditano la fase dell’ingresso' },
        { nome: 'Indirizzo proposto ai cantieri nuovi', valore: imp.sedePartenzaDefault || '—', chiave: 'ufficio', dove: `${urlImpostazioni} → Viaggi` },
      ],
    },
    {
      titolo: 'Approvazione, costi e avvisi',
      icona: ShieldCheck,
      regole: [
        { nome: 'Approvazione automatica delle giornate', valore: siNo(imp.autoApprovaRapportini), chiave: 'ufficio', dove: `${urlImpostazioni} → Approvazione` },
        { nome: 'Soglia di verifica', valore: ore(imp.anomaliaTurnoOreMax), chiave: 'ufficio', dove: `${urlImpostazioni} → Approvazione`, cosa: 'Oltre, la giornata resta «da verificare»' },
        { nome: 'Controlli della pagina Anomalie', valore: Object.entries(imp.anomalie).filter(([, v]) => v).length + ' su 7 attivi', chiave: 'ufficio', dove: `${urlImpostazioni} → Anomalie` },
        { nome: 'Promemoria «inserisci le ore»', valore: imp.promemoriaOre.attivo ? `${imp.promemoriaOre.sera} e ${imp.promemoriaOre.mattina}` : 'spento', chiave: 'ufficio', dove: `${urlImpostazioni} → Approvazione`, cosa: 'Solo con la timbratrice attiva' },
        { nome: 'Lavoratori a turni (maggiorazioni CCNL)', valore: `${dati.persone.aTurni} su ${dati.persone.totale}`, chiave: 'dipendente', dove: 'Ufficio → Personale → Dipendenti' },
        { nome: 'Costo orario impostato', valore: `${dati.persone.conCosto} su ${dati.persone.totale}`, chiave: 'dipendente', dove: 'Ufficio → Personale → Dipendenti, o Tariffe' },
        { nome: 'Fuso orario delle giornate', valore: 'Europe/Rome', chiave: 'codice', dove: 'rome-time.ts' },
      ],
    },
  ];

  return (
    <div className="space-y-5">
      {!dati.kantiereAttivo ? (
        <Card className="border-amber-500/40">
          <CardContent className="py-4 text-sm text-amber-800">
            Il modulo Kantiere è spento: le regole qui sotto sono quelle salvate, ma oggi non governano niente.
          </CardContent>
        </Card>
      ) : null}
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>Chi ha la chiave:</span>
        {(Object.keys(CHIAVE_META) as Chiave[]).map((k) => {
          const m = CHIAVE_META[k];
          return (
            <span key={k} className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold', m.classi)}>
              <m.Icona className="h-3 w-3" aria-hidden="true" />
              {m.etichetta}
            </span>
          );
        })}
        <Link href={`/admin/tenants/${dati.tenantId}?tab=routing`} className="ml-auto text-primary hover:underline">
          Config grezza →
        </Link>
      </div>
      {gruppi.map((g) => (
        <Card key={g.titolo}>
          <CardContent className="py-4">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <g.icona className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              {g.titolo}
            </h2>
            <table className="w-full text-xs">
              <thead className="text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="py-1 pr-3 font-medium">Regola</th>
                  <th className="py-1 pr-3 font-medium">Valore</th>
                  <th className="py-1 pr-3 font-medium">Chi la cambia</th>
                  <th className="py-1 font-medium">Dove</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {g.regole.map((r) => {
                  const m = CHIAVE_META[r.chiave];
                  return (
                    <tr key={r.nome} className="align-top">
                      <td className="py-1.5 pr-3">
                        <span className="font-medium text-foreground">{r.nome}</span>
                        {r.cosa ? <span className="block text-[11px] text-muted-foreground">{r.cosa}</span> : null}
                      </td>
                      <td className="py-1.5 pr-3 font-mono tabular-nums text-foreground">{r.valore}</td>
                      <td className="py-1.5 pr-3">
                        <Badge variant="outline" className={cn('gap-1 text-[10px] font-semibold', m.classi)}>
                          <m.Icona className="h-3 w-3" aria-hidden="true" />
                          {m.etichetta}
                        </Badge>
                      </td>
                      <td className="py-1.5 text-muted-foreground">{r.dove}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
