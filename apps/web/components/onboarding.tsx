'use client';
import { useEffect, useState } from 'react';
import {
  ArrowRight,
  Check,
  ChevronLeft,
  Globe2,
  Instagram,
  Youtube,
} from 'lucide-react';
const countries = [
  { code: 'IN', name: 'India', zone: 'Asia/Kolkata' },
  { code: 'US', name: 'United States', zone: 'America/New_York' },
  { code: 'GB', name: 'United Kingdom', zone: 'Europe/London' },
  { code: 'CA', name: 'Canada', zone: 'America/Toronto' },
  { code: 'AU', name: 'Australia', zone: 'Australia/Sydney' },
];
export function Onboarding({
  initialStep = 1,
  demoMode = false,
}: {
  initialStep?: number;
  demoMode?: boolean;
}) {
  const [step, setStep] = useState(initialStep);
  const [name, setName] = useState('Creator');
  const [country, setCountry] = useState(countries[0]!);
  const [niche, setNiche] = useState('');
  const [proposalId, setProposalId] = useState('');
  const [subNiches, setSubNiches] = useState<string[]>([]);
  const [confidence, setConfidence] = useState<number | null>(null);
  const [evidence, setEvidence] = useState<
    Array<{
      platform?: string;
      provider?: string;
      excerpt?: string;
      why?: string;
    }>
  >([]);
  const [connections, setConnections] = useState<
    Array<{ provider: string; accountName?: string; status?: string }>
  >([]);
  const [saved, setSaved] = useState(false);
  const [connectionMessage, setConnectionMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!demoMode) void refreshConnections();
  }, [demoMode]);

  async function requestJson(url: string, init?: RequestInit) {
    const response = await fetch(url, init);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Request failed');
    return data;
  }

  async function refreshConnections() {
    try {
      const data = await requestJson('/api/connections');
      setConnections(data);
    } catch (requestError) {
      if (initialStep > 1)
        setError(
          requestError instanceof Error
            ? requestError.message
            : 'Could not load connections'
        );
    }
  }

  async function saveProfile() {
    setBusy(true);
    setError('');
    try {
      await requestJson('/api/profile', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          displayName: name,
          countryCode: country.code,
          countryName: country.name,
          timeZone: country.zone,
        }),
      });
      setSaved(true);
      setStep(2);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Could not save profile'
      );
    } finally {
      setBusy(false);
    }
  }

  async function syncAccounts() {
    const providers = connections
      .map((connection) => connection.provider)
      .filter((provider) =>
        ['youtube', 'instagram', 'reddit'].includes(provider)
      );
    if (!providers.length) {
      setConnectionMessage(
        'Connect at least one account first, or continue and describe what you plan to create.'
      );
      setStep(3);
      return;
    }
    setBusy(true);
    setError('');
    try {
      await requestJson('/api/sync/content', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ providers }),
      });
      setConnectionMessage(
        'Account sync queued. You can infer your niche once the worker finishes.'
      );
      setStep(3);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Could not queue account sync'
      );
    } finally {
      setBusy(false);
    }
  }

  async function inferNiche() {
    setBusy(true);
    setError('');
    try {
      const proposal = await requestJson('/api/niche', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'infer' }),
      });
      setProposalId(proposal.id);
      setNiche(proposal.label);
      setSubNiches(Array.isArray(proposal.subNiches) ? proposal.subNiches : []);
      setConfidence(
        typeof proposal.confidence === 'number' ? proposal.confidence : null
      );
      setEvidence(Array.isArray(proposal.evidence) ? proposal.evidence : []);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Could not infer niche'
      );
    } finally {
      setBusy(false);
    }
  }

  async function confirmNiche() {
    if (!proposalId) return inferNiche();
    setBusy(true);
    setError('');
    try {
      await requestJson('/api/niche', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'confirm',
          id: proposalId,
          label: niche,
          subNiches,
        }),
      });
      setStep(4);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Could not confirm niche'
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="onboarding">
      <div className="onboarding-brand">
        Bro<span>.</span>
      </div>
      <div className="steps">
        {[1, 2, 3, 4].map((i) => (
          <i className={i <= step ? 'done' : ''} key={i} />
        ))}
      </div>
      <section className="onboarding-panel">
        {step === 1 && (
          <>
            <h1>Let’s set up your creator workspace</h1>
            <p>
              Bro uses your country and time zone to scope topic signals and
              schedule posts correctly.
            </p>
            <label>
              Display name
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label>
              Country
              <select
                value={country.code}
                onChange={(e) =>
                  setCountry(countries.find((c) => c.code === e.target.value)!)
                }
              >
                {countries.map((c) => (
                  <option value={c.code} key={c.code}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="zone">
              <Globe2 />
              Time zone <strong>{country.zone}</strong>
            </div>
          </>
        )}
        {step === 2 && (
          <>
            <h1>Connect your creator accounts</h1>
            <p>
              Start with YouTube and Instagram. Bro never asks for platform
              passwords and uses official OAuth only.
            </p>
            <Connection
              provider="youtube"
              name="YouTube"
              icon={<Youtube />}
              note="Owned Shorts, publishing and comments"
              onDemo={setConnectionMessage}
              demoMode={demoMode}
              connection={connections.find(
                (item) => item.provider === 'youtube'
              )}
            />
            <Connection
              provider="instagram"
              name="Instagram"
              icon={<Instagram />}
              note="Requires an eligible professional account"
              onDemo={setConnectionMessage}
              demoMode={demoMode}
              connection={connections.find(
                (item) => item.provider === 'instagram'
              )}
            />
            <small>Reddit is optional and can be added later.</small>
            {demoMode && !connectionMessage && (
              <div className="demo-note">
                Demo mode does not call YouTube or Instagram. Add provider
                credentials and turn demo mode off to use official OAuth.
              </div>
            )}
            {connectionMessage && (
              <div className="demo-note">{connectionMessage}</div>
            )}
          </>
        )}
        {step === 3 && (
          <>
            <h1>Confirm your niche</h1>
            <p>
              Infer from synced account history, or describe the content you
              plan to create. You must confirm this before topic discovery is
              enabled.
            </p>
            {!proposalId && (
              <button className="primary" onClick={inferNiche} disabled={busy}>
                {busy ? 'Analyzing…' : 'Find my niche'} <ArrowRight />
              </button>
            )}
            <label>
              Primary niche
              <input
                value={niche}
                onChange={(e) => setNiche(e.target.value)}
                placeholder="e.g. beginner-friendly personal finance"
              />
            </label>
            {confidence !== null && (
              <div className="confidence">
                <strong>{Math.round(confidence * 100)}% confidence</strong>
                <span>{evidence.length} supporting items</span>
              </div>
            )}
            {evidence.length > 0 && (
              <ul className="evidence-list">
                {evidence.map((item, index) => (
                  <li key={`${item.platform || item.provider}-${index}`}>
                    <b>{item.platform || item.provider || 'Source'}</b>{' '}
                    {item.excerpt || item.why || 'Supporting account content'}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        {error && <div className="demo-note">{error}</div>}
        {step === 4 && (
          <>
            <div className="complete-icon">
              <Check />
            </div>
            <h1>Your workspace is ready</h1>
            <p>
              {saved ? 'Profile saved. ' : ''}Auto-publishing remains off for
              YouTube and Instagram until you explicitly enable it.
            </p>
            <a className="primary-link" href="/app">
              Open Bro <ArrowRight />
            </a>
          </>
        )}
        {step < 4 && (
          <div className="onboarding-actions">
            {step > 1 ? (
              <button className="back" onClick={() => setStep(step - 1)}>
                <ChevronLeft />
                Back
              </button>
            ) : (
              <span />
            )}
            <button
              className="primary"
              onClick={() =>
                step === 1
                  ? saveProfile()
                  : step === 2
                    ? syncAccounts()
                    : confirmNiche()
              }
              disabled={busy || !name.trim() || (step === 3 && !niche.trim())}
            >
              {busy ? 'Working…' : step === 3 ? 'Confirm niche' : 'Continue'}
              <ArrowRight />
            </button>
          </div>
        )}
      </section>
    </main>
  );
}
function Connection({
  provider,
  name,
  note,
  icon,
  onDemo,
  demoMode,
  connection,
}: {
  provider: 'youtube' | 'instagram';
  name: string;
  note: string;
  icon: React.ReactNode;
  onDemo: (message: string) => void;
  demoMode: boolean;
  connection?: { accountName?: string; status?: string };
}) {
  return (
    <div className="connect-row">
      <div>{icon}</div>
      <span>
        <strong>{name}</strong>
        <small>{note}</small>
      </span>
      <button
        disabled={Boolean(connection)}
        onClick={() => {
          if (demoMode)
            onDemo(
              `Demo mode does not call ${name}. Add the provider credentials, set NEXT_PUBLIC_DEMO_MODE=false, and use this same button for official OAuth.`
            );
          else window.location.href = `/api/oauth/${provider}/start`;
        }}
      >
        {connection
          ? `Connected · ${connection.accountName || name}`
          : 'Connect'}
      </button>
    </div>
  );
}
