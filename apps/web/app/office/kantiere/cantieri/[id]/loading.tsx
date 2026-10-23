import { ScheletroCard } from '../../../_components/scheletri';

// La scheda cantiere e' `force-dynamic` e fino al 24/10/2026 non aveva uno
// scheletro: al clic dall'elenco non succedeva niente finche' il server non
// aveva finito (la regola del 07/10 sulle pagine dell'area Kantiere).
export default function Attesa() {
  return <ScheletroCard />;
}
