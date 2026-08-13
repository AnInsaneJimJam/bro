import { Onboarding } from '@/components/onboarding';
import { isDemoMode } from '@/lib/auth';
export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string }>;
}) {
  const { step } = await searchParams;
  return (
    <Onboarding
      initialStep={step === 'connections' ? 2 : 1}
      demoMode={isDemoMode()}
    />
  );
}
