import { redirect } from 'next/navigation';

/**
 * L'anagrafica del personale si e' spostata in **Personale → Dipendenti**.
 *
 * Perche': viveva sotto `/office/kantiere/`, il cui guscio rimbalza chiunque
 * non abbia il modulo presenze. Il modulo «Dipendenti» invece e' una cosa a
 * se', accendibile anche a un cliente che non timbra — e per quel cliente la
 * voce di menu portava a un rimbalzo su `/office`. Una voce di menu che non
 * apre niente.
 *
 * Questo indirizzo resta come rimando: e' nei preferiti di chi lo usa da mesi,
 * e compare in parecchi collegamenti sparsi.
 */
export default function DipendentiKantiereRimando() {
  redirect('/office/personale/dipendenti');
}
