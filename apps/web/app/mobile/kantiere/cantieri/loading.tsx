import { SkelHeader, SkelSearch, SkelCardList } from '../../_components/skeletons';

/**
 * Scheletro di «Cantieri».
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
      <SkelSearch />
      <SkelCardList count={5} />
    </div>
  );
}
