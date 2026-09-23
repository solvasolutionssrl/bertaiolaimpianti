import { endImpersonation } from '@/app/admin/_actions/tenants';

/**
 * Via di ritorno alla console mentre si sta impersonando un utente di un tenant.
 *
 * Serve perche' durante l'impersonation il JWT e' quello dell'utente tenant:
 * aprire `/admin` faceva scattare il guard che rimbalza i non-admin su
 * `/office`, cioe' rimandava dentro al tenant proprio chi stava cercando di
 * uscirne. L'unica uscita rimasta era il logout.
 *
 * Qui si ripristina la sessione admin e si torna alla console. E' una route e
 * non una pagina perche' il ripristino riscrive i cookie di sessione, cosa che
 * un Server Component non puo' fare.
 *
 * Non serve nessun controllo in piu': `endImpersonation` accetta solo un cookie
 * firmato dal server e non scaduto, e se manca fa uscire e rimanda al login.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  // Finisce sempre con un redirect (alla console, o al login se il cookie non
  // e' piu' valido): sotto questa riga non si arriva.
  await endImpersonation();
  return new Response(null, { status: 302, headers: { Location: '/admin' } });
}
