import { LoginForm } from '@/components/login-form';
import { isDemoMode } from '@/lib/auth';
export default function LoginPage() {
  return <LoginForm demoMode={isDemoMode()} />;
}
