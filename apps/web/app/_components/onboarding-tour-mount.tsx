'use client';

import { useState, useTransition } from 'react';

import { OnboardingTour, type TourStep } from './onboarding-tour';
import { completaOnboarding, skipOnboarding } from '../_actions/onboarding';

/**
 * Wrapper Client Component che monta `<OnboardingTour>` collegandolo
 * alle Server Actions `completaOnboarding` / `skipOnboarding`.
 *
 * Logica:
 *  - dopo il primo click su "Termina" o "Salta tour" smonta subito il
 *    componente (UX: non lasciamo il tooltip a fare da freno mentre
 *    aspettiamo la round-trip Server Action);
 *  - lancia la Server Action in background dentro `useTransition`;
 *  - una volta risolta, `revalidatePath` (lato Server Action) fa sì che
 *    il prossimo navigation non rimostri più il tour.
 *
 * Usato dai layout server (`/office/layout.tsx`, `/mobile/layout.tsx`)
 * passandoci l'array di step appropriato.
 */
interface OnboardingTourMountProps {
  steps: TourStep[];
}

export function OnboardingTourMount({ steps }: OnboardingTourMountProps) {
  const [done, setDone] = useState(false);
  const [, startTransition] = useTransition();

  if (done) return null;

  return (
    <OnboardingTour
      steps={steps}
      onComplete={() => {
        setDone(true);
        startTransition(() => {
          void completaOnboarding();
        });
      }}
      onSkip={() => {
        setDone(true);
        startTransition(() => {
          void skipOnboarding();
        });
      }}
    />
  );
}

export default OnboardingTourMount;
