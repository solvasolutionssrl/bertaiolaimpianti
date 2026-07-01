import { SkelHeader, SkelSearch, SkelCardList } from '../_components/skeletons';

/**
 * Skeleton generico per le rotte Kantiere (cantieri, ore, spese, scansiona,
 * gestione-squadra, dettaglio cantiere). Le rotte con layout molto diverso
 * (es. cruscotto) hanno il proprio loading.tsx. Compare istantaneo al tap tab.
 */
export default function KantiereLoading() {
  return (
    <div className="flex min-h-[100dvh] flex-col gap-5 p-4 pb-24">
      <SkelHeader />
      <SkelSearch />
      <SkelCardList count={6} />
    </div>
  );
}
