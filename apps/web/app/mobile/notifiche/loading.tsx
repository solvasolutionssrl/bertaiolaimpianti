import { SkelHeader, SkelCardList } from '../_components/skeletons';

/** Skeleton della pagina Notifiche/Attività. */
export default function NotificheLoading() {
  return (
    <div className="flex min-h-[100dvh] flex-col gap-5 p-4 pb-24">
      <SkelHeader />
      <SkelCardList count={6} className="h-[68px]" />
    </div>
  );
}
