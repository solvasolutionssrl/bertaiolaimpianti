import { Skeleton } from '@kommessa/ui';
import { SkelHeader } from '../_components/skeletons';

/**
 * Scheletro di «Dettato vocale».
 *
 * Senza, questa pagina e' `force-dynamic` e al tocco restava BIANCA finche' la
 * query non tornava: sembrava che il tocco non fosse stato registrato, e la
 * gente tocca di nuovo. Lo scheletro compare subito e ha la forma di cio' che
 * arrivera', cosi' il passaggio non e' uno scatto.
 */
export default function Caricamento() {
  return (
    <div className="flex flex-col gap-4 p-4">
      <SkelHeader />
      <div className="flex flex-col items-center gap-4 py-10">
        <Skeleton className="h-32 w-32 rounded-full" />
        <Skeleton className="h-3 w-44 rounded-full" />
      </div>
    </div>
  );
}
