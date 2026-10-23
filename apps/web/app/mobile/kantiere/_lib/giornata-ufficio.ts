import 'server-only';

import { createServerSupabase } from '@kommessa/api/server';
import { modalitaLavoroDi } from '@/app/_lib/dipendenti-modalita';
import { giornateTimbroPersona } from '@/app/_lib/timbro/giornate';
import type { PickerCantiere } from '../_components/cantiere-picker';
import type { PresenzaSedeVista } from '../_components/presenza-sede';
import { elencoCantieriPicker } from './cantieri-picker-data';
import { mioTurnoAttivo, type TurnoAttivoMio } from './turno-attivo';
import { caricaTurnoAzioniContesto, type TurnoAzioniContesto } from './turno-azioni-contesto';

/**
 * La giornata di chi sta in ufficio e timbra anche lui, pronta per la card
 * `HomeUfficio`: turno aperto, presenza in sede, giornata da ripartire,
 * cantieri per il foglio «Inizia giornata».
 *
 * Nasce il 23/10/2026 perché per un utente ufficio «Inizia giornata» stava
 * solo nella tab Cantieri, che non e' la sua tab: ora la stessa card sta in
 * cima al Cruscotto e alla tab Ore. Per i tecnici non cambia niente: la
 * card resta dov'era, e questa lettura torna `null`.
 *
 * `null` quando non c'e' niente da mostrare: ruolo tecnico, nessuna scheda
 * dipendente, oppure una scheda in modalita' «esterno» (chi sta in cantiere
 * ha gia' la sua card del turno e «Inizia turno» nella tab Cantieri).
 */
export interface GiornataUfficio {
  nome: string | null;
  turno: TurnoAttivoMio | null;
  azioni: TurnoAzioniContesto | null;
  cantieri: PickerCantiere[];
  presenza: PresenzaSedeVista | null;
  /** Una giornata timbrata (oggi o prima) con le ore ancora da ripartire. */
  daRipartire: { giorno: string; oggi: boolean; dalTerminale: boolean } | null;
}

export async function caricaGiornataUfficio(ctx: {
  tenantId: string;
  userId: string;
  role: string;
}): Promise<GiornataUfficio | null> {
  if (ctx.role !== 'admin' && ctx.role !== 'office') return null;
  const supabase = createServerSupabase();
  const { data: meRaw } = await supabase
    .from('dipendenti' as never)
    .select('id, nome')
    .eq('tenant_id', ctx.tenantId)
    .eq('user_id', ctx.userId)
    .maybeSingle();
  const me = meRaw as { id: string; nome: string | null } | null;
  if (!me) return null;
  if ((await modalitaLavoroDi(supabase, ctx.tenantId, me.id)) !== 'ufficio') return null;

  const [turno, cantieri, registro] = await Promise.all([
    mioTurnoAttivo(),
    elencoCantieriPicker(ctx.tenantId),
    giornateTimbroPersona(supabase, ctx.tenantId, me.id),
  ]);
  const azioni = turno ? await caricaTurnoAzioniContesto(ctx.tenantId, ctx.userId, turno.cantiereId) : null;

  // Stessa lettura della tab Cantieri: la presenza in sede di oggi (aperta,
  // o chiusa e da ripartire) e la giornata piu' vecchia ancora da sistemare.
  const { oggi, daFare } = registro;
  let daRipartire: GiornataUfficio['daRipartire'] = null;
  if (daFare) {
    const oggiRome = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome' }).format(new Date());
    daRipartire = { giorno: daFare.giorno, oggi: daFare.giorno === oggiRome, dalTerminale: daFare.sorgenti.includes('timbro') };
  }
  let presenza: PresenzaSedeVista | null = null;
  if (oggi && !turno && (oggi.stato === 'presenza_aperta' || oggi.stato === 'da_ripartire')) {
    const primo = oggi.timbri.find((t) => !t.scartato)?.ts ?? null;
    const ultimoInt = oggi.presenza?.intervalli[oggi.presenza.intervalli.length - 1] ?? null;
    presenza = {
      inizioIso: primo,
      fineIso: !oggi.presenza?.aperta && ultimoInt ? new Date(ultimoInt.fineMs).toISOString() : null,
      aperta: !!oggi.presenza?.aperta,
      nettoMin: oggi.scatola?.nettoMin ?? oggi.presenza?.minutiNetti ?? 0,
      dalTerminale: oggi.sorgenti.includes('timbro'),
    };
  }

  return { nome: me.nome, turno, azioni, cantieri, presenza, daRipartire };
}
