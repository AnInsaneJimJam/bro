'use client';
import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
export function LoginForm({ demoMode = false }: { demoMode?: boolean }) {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const response = await fetch('/api/auth/magic-link', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const data = await response.json();
    setMessage(data.message || data.error);
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
          Sign in with a secure email magic link. Platform passwords are never
          requested or stored.
        </p>
        <form onSubmit={submit}>
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
          <button>
            Send magic link <ArrowRight />
          </button>
        </form>
        {message && <div className="login-message">{message}</div>}
        {demoMode && <a href="/onboarding">Continue with labeled demo data</a>}
      </div>
    </main>
  );
}
