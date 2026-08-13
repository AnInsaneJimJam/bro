'use client';
import { useState } from 'react';
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
  const [niche, setNiche] = useState('AI tools & productivity');
  const [saved, setSaved] = useState(false);
  const [connectionMessage, setConnectionMessage] = useState('');
  async function save() {
    const r = await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        displayName: name,
        countryCode: country.code,
        countryName: country.name,
        timeZone: country.zone,
      }),
    });
    if (r.ok) {
      setSaved(true);
      setStep(4);
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
            />
            <Connection
              provider="instagram"
              name="Instagram"
              icon={<Instagram />}
              note="Requires an eligible professional account"
              onDemo={setConnectionMessage}
              demoMode={demoMode}
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
              Bro inferred this from recent demo-owned content. Edit it before
              activating topic discovery.
            </p>
            <label>
              Primary niche
              <input value={niche} onChange={(e) => setNiche(e.target.value)} />
            </label>
            <div className="confidence">
              <strong>86% confidence</strong>
              <span>3 supporting items</span>
            </div>
            <ul className="evidence-list">
              <li>
                <b>YouTube</b> “Three AI memory tricks…”
              </li>
              <li>
                <b>Instagram</b> “Turn voice notes into a second brain”
              </li>
              <li>
                <b>Reddit</b> “My local-first AI note workflow”
              </li>
            </ul>
          </>
        )}
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
              onClick={() => (step === 3 ? save() : setStep(step + 1))}
              disabled={!name.trim() || !niche.trim()}
            >
              {step === 3 ? 'Confirm niche' : 'Continue'}
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
}: {
  provider: 'youtube' | 'instagram';
  name: string;
  note: string;
  icon: React.ReactNode;
  onDemo: (message: string) => void;
  demoMode: boolean;
}) {
  return (
    <div className="connect-row">
      <div>{icon}</div>
      <span>
        <strong>{name}</strong>
        <small>{note}</small>
      </span>
      <button
        onClick={() => {
          if (demoMode)
            onDemo(
              `Demo mode does not call ${name}. Add the provider credentials, set NEXT_PUBLIC_DEMO_MODE=false, and use this same button for official OAuth.`
            );
          else window.location.href = `/api/oauth/${provider}/start`;
        }}
      >
        Connect
      </button>
    </div>
  );
}
