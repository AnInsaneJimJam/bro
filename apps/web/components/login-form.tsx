'use client';
import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
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
    const response = await fetch('/api/auth/magic-link', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const data = await response.json();
    setMessage(data.message || data.error);
    setBusy(false);
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
          Sign in to Bro with email and password, or request a secure magic
          link. Social-platform passwords are never requested or stored.
        </p>
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
              required
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              placeholder="At least 8 characters"
            />
          </label>
          <div className="password-auth-actions">
            <button disabled={busy}>
              Sign in <ArrowRight />
            </button>
            <button
              className="secondary-login"
              type="button"
              disabled={busy}
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
            onClick={magicLink}
          >
            Email me a magic link
          </button>
        </form>
        {message && <div className="login-message">{message}</div>}
        {demoMode && <a href="/onboarding">Continue with labeled demo data</a>}
      </div>
    </main>
  );
}
