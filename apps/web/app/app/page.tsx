import { Dashboard } from '@/components/dashboard';
import { redirect } from 'next/navigation';
import { requireUser, UnauthorizedError } from '@/lib/auth';

export default async function WorkspacePage() {
  try {
    await requireUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) redirect('/login');
    throw error;
  }
  return <Dashboard />;
}
