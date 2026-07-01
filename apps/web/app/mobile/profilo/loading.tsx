import { SkelHeader, SkelCardList } from '../_components/skeletons';

/** Skeleton della pagina Profilo. */
export default function ProfiloLoading() {
  return (
    <div className="flex min-h-[100dvh] flex-col gap-5 p-4 pb-24">
      <SkelHeader />
      <SkelCardList count={4} className="h-[56px]" />
    </div>
  );
}
