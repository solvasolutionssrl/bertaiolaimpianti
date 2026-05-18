import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function ImpostazioniIndex() {
  redirect('/office/impostazioni/profilo');
}
