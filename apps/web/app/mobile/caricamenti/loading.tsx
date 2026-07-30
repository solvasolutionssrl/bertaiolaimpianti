import { SkelCardList, SkelHeader } from '../_components/skeletons';

/**
 * Skeleton della pagina Caricamenti. Ogni rotta mobile `force-dynamic` deve
 * averne uno: al tap compare subito qualcosa invece di restare fermi.
 */
export default function Loading() {
  return (
    <div className="flex min-h-[100dvh] flex-col gap-4 p-4">
      <SkelHeader />
      <SkelCardList count={4} />
    </div>
  );
}
