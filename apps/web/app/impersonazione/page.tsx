import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { casaPerRuolo, telefonoDaUserAgent } from '@kommessa/api/identita';
import { etichettaImpersonazione } from '@kommessa/api/impersonazione';

import { leggiShadow, SHADOW_COOKIE } from '../admin/_lib/shadow';
import { BivioImpersonazione } from './_components/bivio';

/**
 * Il bivio di chi sta impersonando e prova ad andare in console.
 *
 * ## Perché esiste una pagina
 *
 * Mentre si impersona, il JWT è quello della persona del cliente: aprire
 * `/admin` fa scattare il guard, che i non-admin rimbalza dentro al cliente —
 * cioè rimandava indietro proprio chi stava cercando di uscirne.
 *
 * La prima soluzione (07/10) era mandarlo a una rotta che chiudeva
 * l'impersonation e tornava in console. ⚠️⚠️ Ma era una **GET che cambia lo
 * stato**: il tasto «indietro» del browser ripassa dalla pagina del cliente da
 * cui si era partiti, e quindi chiudeva l'impersonation **senza chiedere
 * niente**. Misurato sul registro: 56 impersonation iniziate, 8 chiuse dalla
 * porta. ⭐ Una GET non cambia lo stato: lo cambia un tasto.
 *
 * Qui si dice **cosa stai guardando** e si offrono le due strade. Il ritorno
 * passa da una Server Action, cioè da una POST.
 *
 * ⚠️ Sta fuori dai gusci `/office` e `/mobile` di proposito: dentro
 * prenderebbe i loro cancelli (ruolo, password) e un tecnico impersonato
 * finirebbe rimbalzato prima di vedere la domanda.
 */
export const dynamic = 'force-dynamic';

export default function PaginaImpersonazione() {
  const shadow = leggiShadow(cookies().get(SHADOW_COOKIE)?.value);

  // Nessuna impersonation in corso: questa pagina non ha niente da dire. Non
  // si mostra un vuoto, si va dove si stava andando.
  if (!shadow) redirect('/admin');

  const ruolo = shadow.target_ruolo ?? null;

  return (
    <BivioImpersonazione
      chi={etichettaImpersonazione({
        nome: shadow.target_nome,
        login: shadow.target_email,
        ruolo,
        cliente: shadow.tenant_label,
      })}
      admin={shadow.admin_email}
      // Dove tornare «dentro»: il guscio del mestiere di chi si impersona, non
      // l'ufficio per tutti — un tecnico lì ci rimbalzerebbe.
      dentro={casaPerRuolo(ruolo ?? 'tecnico', { telefono: telefonoDaUserAgent(headers().get('user-agent')) })}
      scadeAt={shadow.scade_at}
    />
  );
}
