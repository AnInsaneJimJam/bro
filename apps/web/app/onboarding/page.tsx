import { Onboarding } from '@/components/onboarding';
import { redirect } from 'next/navigation';
import { isDemoMode, requireUser, UnauthorizedError } from '@/lib/auth';
export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string }>;
}) {
  try {
    await requireUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) redirect('/login');
    throw error;
  }
  const { step } = await searchParams;
  return (
    <Onboarding
      initialStep={step === 'connections' ? 2 : 1}
      demoMode={isDemoMode()}
    />
  );
}
