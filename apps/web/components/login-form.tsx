'use client';
import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
export function LoginForm({ demoMode = false }: { demoMode?: boolean }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function passwordAuth(action: 'sign_in' | 'sign_up') {
    setBusy(true);
    const response = await fetch('/api/auth/password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, email, password }),
      }),
      data = await response.json();
    setBusy(false);
    if (response.ok && data.authenticated) location.href = data.next;
    else setMessage(data.message || data.error);
  }
  async function magicLink() {
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/auth/magic-link', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await response.json();
      setMessage(
        data.message || data.error || 'Unable to send the magic link.'
      );
    } catch {
      setMessage(
        'Unable to send the magic link. Check your connection and try again.'
      );
    } finally {
      setBusy(false);
    }
  }
  async function googleAuth() {
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/auth/config', { cache: 'no-store' });
      const config = (await response.json()) as {
        url?: string;
        anonKey?: string;
        error?: string;
      };
      if (!response.ok || !config.url || !config.anonKey)
        throw new Error(config.error || 'Supabase is not configured.');
      const { error } = await createSupabaseBrowserClient({
        url: config.url,
        anonKey: config.anonKey,
      }).auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/api/auth/callback?next=/onboarding`,
          queryParams: { prompt: 'select_account' },
        },
      });
      if (error) throw error;
    } catch (error) {
      setBusy(false);
      setMessage(
        error instanceof Error
          ? error.message
          : 'Google sign-in is not configured yet.'
      );
    }
  }
  return (
    <main className="login">
      <div className="login-card">
        <div className="onboarding-brand">
          Bro<span>.</span>
        </div>
        <h1>
          Your content workflow,
          <br />
          in one conversation.
        </h1>
        <p>
          Sign in with Google, email and password, or a secure magic link.
          Social-platform passwords are never requested or stored.
        </p>
        {!demoMode && (
          <>
            <button
              className="google-login"
              type="button"
              disabled={busy}
              data-busy={busy}
              onClick={googleAuth}
            >
              <span className="google-mark" aria-hidden="true">
                G
              </span>
              Continue with Google <ArrowRight />
            </button>
            <div
              className="auth-choice-divider"
              role="separator"
              aria-label="Or use email authentication"
            >
              <span>OR</span>
            </div>
          </>
        )}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void passwordAuth('sign_in');
          }}
        >
          <label>
            Email address
            <input
              type="email"
              name="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </label>
          <label>
            Password
            <input
              type="password"
              name="password"
              required
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              placeholder="At least 8 characters"
            />
          </label>
          <div className="password-auth-actions">
            <button disabled={busy} data-busy={busy}>
              Sign in <ArrowRight />
            </button>
            <button
              className="secondary-login"
              type="button"
              disabled={busy}
              data-busy={busy}
              onClick={() => passwordAuth('sign_up')}
            >
              Create account
            </button>
          </div>
          <div
            className="auth-choice-divider"
            role="separator"
            aria-label="Or use a passwordless magic link"
          >
            <span>OR</span>
          </div>
          <button
            className="secondary-login"
            type="button"
            disabled={busy || !email}
            data-busy={busy}
            onClick={magicLink}
          >
            Email me a magic link
          </button>
        </form>
        {message && (
          <div className="login-message" role="status" aria-live="polite">
            {message}
          </div>
        )}
        {demoMode && <a href="/onboarding">Continue with labeled demo data</a>}
      </div>
    </main>
  );
}
