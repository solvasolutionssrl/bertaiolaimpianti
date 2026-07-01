import { SkelHeader, SkelKpiRow, SkelCardList } from '../../_components/skeletons';

/**
 * Skeleton del Cruscotto (landing di admin/ufficio): intestazione + riga KPI +
 * lista presenze del giorno. Compare istantaneo al tap, mentre carica i dati live.
 */
export default function CruscottoLoading() {
  return (
    <div className="flex min-h-[100dvh] flex-col gap-5 p-4 pb-24">
      <SkelHeader />
      <SkelKpiRow />
      <SkelCardList count={5} className="h-[64px]" />
    </div>
  );
}
