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
export function Onboarding() {
  const [step, setStep] = useState(1);
  const [name, setName] = useState('Creator');
  const [country, setCountry] = useState(countries[0]!);
  const [niche, setNiche] = useState('AI tools & productivity');
  const [saved, setSaved] = useState(false);
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
            <h1>Connect your accounts</h1>
            <p>
              Connections are optional now. Bro never asks for platform
              passwords and uses official OAuth only.
            </p>
            <Connection
              name="YouTube"
              icon={<Youtube />}
              note="Owned Shorts, publishing and comments"
            />
            <Connection
              name="Instagram"
              icon={<Instagram />}
              note="Requires an eligible professional account"
            />
            <Connection
              name="Reddit"
              icon={<b>r/</b>}
              note="Niche signals only; feature-flagged pending approval"
            />
            <div className="demo-note">
              Demo mode — connection buttons make no live provider calls.
            </div>
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
            <a className="primary-link" href="/">
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
  name,
  note,
  icon,
}: {
  name: string;
  note: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="connect-row">
      <div>{icon}</div>
      <span>
        <strong>{name}</strong>
        <small>{note}</small>
      </span>
      <button title="Live OAuth requires provider credentials">Connect</button>
    </div>
  );
}
