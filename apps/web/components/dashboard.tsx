'use client';
import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clapperboard,
  FileText,
  Home,
  Lightbulb,
  Link2,
  MessageCircle,
  Mic,
  RefreshCw,
  Settings,
  Sparkles,
  TrendingUp,
  Youtube,
  Menu,
  X,
} from 'lucide-react';
import { FeaturePanel } from './feature-panels';

const nav = [
  [Home, 'Home'],
  [MessageCircle, 'Bro Chat'],
  [Lightbulb, 'Ideas'],
  [FileText, 'Scripts'],
  [Clapperboard, 'Videos'],
  [CalendarDays, 'Calendar'],
  [MessageCircle, 'Comments'],
  [Link2, 'Connections'],
  [Settings, 'Settings'],
] as const;
type HomeData = {
  mode: string;
  profile?: {
    displayName?: string;
    countryName?: string;
    countryCode?: string;
    timeZone?: string;
  };
  niche?: { label?: string };
  opportunities: Array<{
    id: string;
    topic: string;
    angle?: string;
    score?: number;
    createdAt: string;
  }>;
  script?: { id: string; title?: string; currentVersion?: number };
  nextJob?: { id: string; scheduledAt: string; state: string };
  connections: Array<{
    provider: string;
    accountName?: string;
    status?: string;
  }>;
  failedJobs: Array<{
    id: string;
    resourceId?: string | null;
    kind: string;
    state: string;
    lastErrorMessage?: string;
    updatedAt: string;
  }>;
};

export function Dashboard() {
  const [active, setActive] = useState('Home');
  const [mobile, setMobile] = useState(false);
  const [command, setCommand] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const [home, setHome] = useState<HomeData | null>(null);
  const [confirmation, setConfirmation] = useState<{
    jobId: string;
    card: {
      mediaName: string;
      providers: string[];
      title?: string;
      caption?: string;
      scheduledAt?: string;
      timeZone: string;
      visibility: string;
    };
  } | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  useEffect(() => {
    const choose = () => {
      const requested = decodeURIComponent(location.hash.slice(1));
      if (nav.some(([, label]) => label === requested)) setActive(requested);
    };
    choose();
    fetch('/api/home')
      .then((response) => response.json())
      .then((data) => {
        setHome(data);
        setDemoMode(data.mode === 'demo');
      })
      .catch(() => {});
    addEventListener('hashchange', choose);
    return () => removeEventListener('hashchange', choose);
  }, []);
  async function submit() {
    if (!command.trim() || busy) return;
    const sent = command.trim();
    setBusy(true);
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: sent }),
      });
      const data = await response.json();
      setNotice(data.message || data.error || 'Command completed');
      if (data.confirmations?.[0]) setConfirmation(data.confirmations[0]);
      if (response.ok) setCommand('');
    } catch {
      setNotice('Bro could not reach the command service.');
    } finally {
      setBusy(false);
      setTimeout(() => setNotice(''), 6000);
    }
  }
  async function confirmPublish() {
    if (!confirmation) return;
    setBusy(true);
    const response = await fetch(`/api/publish/${confirmation.jobId}/confirm`, {
        method: 'POST',
      }),
      data = await response.json();
    setNotice(
      response.ok
        ? `Publishing job scheduled for ${new Date(data.scheduledAt).toLocaleString()}.`
        : data.error
    );
    if (response.ok) setConfirmation(null);
    setBusy(false);
  }
  async function retryPublish(jobId: string) {
    setBusy(true);
    const response = await fetch(`/api/publish/${jobId}/retry`, {
        method: 'POST',
      }),
      data = await response.json();
    setNotice(
      response.ok
        ? `Retry queued for ${data.retriedProviders.join(' + ')} only.`
        : data.error
    );
    setBusy(false);
  }
  async function toggleRecording() {
    if (recording) {
      recorder.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true }),
        next = new MediaRecorder(stream);
      chunks.current = [];
      next.ondataavailable = (event) => {
        if (event.data.size) chunks.current.push(event.data);
      };
      next.onstop = async () => {
        setRecording(false);
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunks.current, {
            type: next.mimeType || 'audio/webm',
          }),
          form = new FormData();
        form.append('audio', blob, 'command.webm');
        setBusy(true);
        try {
          const response = await fetch('/api/audio/transcribe', {
              method: 'POST',
              body: form,
            }),
            data = await response.json();
          if (response.ok) {
            setCommand(data.text);
            setNotice('Transcript ready—edit it, then press Send.');
          } else setNotice(data.error);
        } catch {
          setNotice('Bro could not transcribe that recording.');
        } finally {
          setBusy(false);
        }
      };
      recorder.current = next;
      next.start();
      setRecording(true);
      setNotice(
        'Recording English command… press the microphone again to stop.'
      );
    } catch {
      setNotice('Microphone permission was not granted.');
    }
  }
  return (
    <main className="shell">
      <aside className={mobile ? 'sidebar open' : 'sidebar'}>
        <div className="brand">
          Bro<span>.</span>
        </div>
        <button
          className="close"
          onClick={() => setMobile(false)}
          aria-label="Close navigation"
        >
          <X />
        </button>
        <nav>
          {nav.map(([Icon, label]) => (
            <button
              key={label}
              className={active === label ? 'nav active' : 'nav'}
              onClick={() => {
                setActive(label);
                location.hash = encodeURIComponent(label);
                setMobile(false);
              }}
            >
              <Icon />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        {demoMode && (
          <div className="demo">
            <span className="demo-dot" />
            Demo data
          </div>
        )}
      </aside>
      <section className="workspace">
        <header>
          <button
            className="menu"
            onClick={() => setMobile(true)}
            aria-label="Open navigation"
          >
            <Menu />
          </button>
          <div>
            <h1>
              {active === 'Home'
                ? `Good morning, ${home?.profile?.displayName || 'Creator'}`
                : 'Bro ' + active}
            </h1>
            <p>Here’s what’s happening with your content today.</p>
          </div>
          <div className="profile-facts">
            <div>
              <span>Your niche</span>
              <strong>{home?.niche?.label || 'Confirm your niche'}</strong>
            </div>
            <div>
              <span>Country</span>
              <strong>{home?.profile?.countryName || 'Select country'}</strong>
            </div>
          </div>
        </header>
        {active !== 'Home' ? (
          <FeaturePanel active={active} />
        ) : (
          <div className="dashboard">
            <section className="main-column">
              <div className="section-head">
                <h2>Topic opportunities</h2>
                <button>
                  View all ideas <ArrowRight />
                </button>
              </div>
              <div className="idea-list">
                {home === null ? (
                  <p className="all-clear">Loading your opportunities…</p>
                ) : home.opportunities.length === 0 ? (
                  <p className="all-clear">
                    No current opportunities yet. Connect an account, confirm
                    your niche, then ask Bro to discover topics.
                  </p>
                ) : (
                  home.opportunities.map((item, i) => {
                    const idea = {
                      title: item.topic,
                      detail:
                        item.angle || 'Evidence-backed creator opportunity.',
                      score: item.score || 0,
                      age: new Date(item.createdAt).toLocaleString(),
                    };
                    return (
                      <article className="idea" key={idea.title}>
                        <div className="idea-icon">
                          {i === 0 ? <TrendingUp /> : <Lightbulb />}
                        </div>
                        <div className="idea-copy">
                          <h3>{idea.title}</h3>
                          <p>{idea.detail}</p>
                        </div>
                        <div className="score">
                          <strong>{idea.score}</strong>
                          <span>Opportunity</span>
                        </div>
                        <div className="evidence">
                          <span>Evidence</span>
                          <strong>
                            {idea.age} <i />
                          </strong>
                        </div>
                      </article>
                    );
                  })
                )}
              </div>
              <div className="section-head lower">
                <h2>Script in progress</h2>
                <button>
                  View all scripts <ArrowRight />
                </button>
              </div>
              <article className="progress-row">
                <FileText />
                <div>
                  <strong>
                    {home?.script?.title || 'No script in progress'}
                  </strong>
                  {home?.script ? (
                    <span>Draft v{home.script.currentVersion || 1}</span>
                  ) : (
                    <span>Generate one from a topic opportunity</span>
                  )}
                </div>
                {home?.script && (
                  <button>
                    Continue <ArrowRight />
                  </button>
                )}
              </article>
              <div className="section-head lower">
                <h2>Next scheduled post</h2>
                <button>
                  View calendar <ArrowRight />
                </button>
              </div>
              <article className="schedule-row">
                <CalendarDays />
                <div>
                  <strong>
                    {home?.nextJob
                      ? new Date(home.nextJob.scheduledAt).toLocaleString([], {
                          timeZone: home.profile?.timeZone,
                        })
                      : 'Nothing scheduled'}
                  </strong>
                  <span>{home?.profile?.timeZone || 'Select a time zone'}</span>
                </div>
                <div className="schedule-title">
                  <strong>
                    {home?.script?.title || 'Choose a ready video'}
                  </strong>
                  <span>{home?.nextJob?.state || 'No job'}</span>
                </div>
                {home?.nextJob && (
                  <div className="destinations">
                    <span>Scheduled job</span>
                  </div>
                )}
              </article>
            </section>
            <aside className="right-column">
              <div className="section-head">
                <h2>Connections</h2>
                <button>
                  Manage <ArrowRight />
                </button>
              </div>
              <div className="connections">
                {(home?.connections || []).map((connection) => {
                  const name =
                      connection.provider.charAt(0).toUpperCase() +
                      connection.provider.slice(1),
                    handle = connection.accountName || 'Connected',
                    kind =
                      connection.provider === 'youtube'
                        ? 'yt'
                        : connection.provider === 'instagram'
                          ? 'ig'
                          : 'rd';
                  return (
                    <div className="connection" key={name}>
                      <div className={`platform ${kind}`}>
                        {kind === 'yt' ? (
                          <Youtube />
                        ) : kind === 'ig' ? (
                          'IG'
                        ) : (
                          'r/'
                        )}
                      </div>
                      <div>
                        <strong>{name}</strong>
                        <span>{handle}</span>
                      </div>
                      <em>
                        <i />
                        {connection.status || 'Unknown'}
                      </em>
                      <ArrowRight />
                    </div>
                  );
                })}
                {home && home.connections.length === 0 && (
                  <p className="all-clear">
                    No creator accounts connected yet.
                  </p>
                )}
              </div>
              <div className="section-head attention-head">
                <h2>Needs attention</h2>
                <button>
                  View all <ArrowRight />
                </button>
              </div>
              {home?.failedJobs?.[0] ? (
                <article className="attention">
                  <AlertCircle />
                  <div>
                    <strong>
                      {home.failedJobs[0].lastErrorMessage ||
                        'Job needs attention'}
                    </strong>
                    <span>{home.failedJobs[0].kind}</span>
                    <small>
                      {new Date(home.failedJobs[0].updatedAt).toLocaleString()}
                    </small>
                  </div>
                  {home.failedJobs[0].kind === 'publish-video' &&
                  home.failedJobs[0].state === 'failed_retryable' &&
                  home.failedJobs[0].resourceId ? (
                    <button
                      onClick={() =>
                        retryPublish(home.failedJobs[0]!.resourceId!)
                      }
                    >
                      Retry <RefreshCw />
                    </button>
                  ) : null}
                </article>
              ) : (
                <p className="all-clear">No failed jobs need attention.</p>
              )}
              <div className="suggestions">
                <h2>Try asking Bro</h2>
                <button
                  onClick={() =>
                    setCommand(
                      `Find five current ${home?.niche?.label || 'creator'} topics in ${home?.profile?.countryName || 'my country'}`
                    )
                  }
                >
                  Find five trending topics
                </button>
                <button
                  onClick={() =>
                    setCommand(
                      'What are viewers confused about in my latest comments?'
                    )
                  }
                >
                  Analyze recent comments
                </button>
              </div>
            </aside>
          </div>
        )}
        {confirmation && (
          <section
            className="publish-confirmation"
            role="dialog"
            aria-label="Confirm external publish"
          >
            <header>
              <strong>Confirm publishing</strong>
              <button
                onClick={() => setConfirmation(null)}
                aria-label="Close confirmation"
              >
                <X />
              </button>
            </header>
            <dl>
              <div>
                <dt>Media</dt>
                <dd>{confirmation.card.mediaName}</dd>
              </div>
              <div>
                <dt>Destinations</dt>
                <dd>{confirmation.card.providers.join(' + ')}</dd>
              </div>
              {confirmation.card.title && (
                <div>
                  <dt>Title</dt>
                  <dd>{confirmation.card.title}</dd>
                </div>
              )}
              {confirmation.card.caption && (
                <div>
                  <dt>Description / caption</dt>
                  <dd>{confirmation.card.caption}</dd>
                </div>
              )}
              <div>
                <dt>When</dt>
                <dd>
                  {confirmation.card.scheduledAt || 'Publish now'} ·{' '}
                  {confirmation.card.timeZone}
                </dd>
              </div>
              <div>
                <dt>Visibility</dt>
                <dd>{confirmation.card.visibility}</dd>
              </div>
            </dl>
            <footer>
              <button onClick={() => setConfirmation(null)}>Not now</button>
              <button
                className="confirm"
                disabled={busy}
                onClick={confirmPublish}
              >
                Confirm &amp; queue
              </button>
            </footer>
          </section>
        )}
        <div className="composer">
          <Sparkles />
          <input
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="Ask Bro to find an idea, write a script, or schedule a post…"
          />
          <button
            className={recording ? 'mic recording' : 'mic'}
            aria-label={recording ? 'Stop recording' : 'Record command'}
            aria-pressed={recording}
            onClick={toggleRecording}
          >
            <Mic />
          </button>
          <button
            className="send"
            disabled={busy || recording}
            onClick={submit}
          >
            {busy ? 'Working…' : 'Send'}
          </button>
        </div>
      </section>
      {notice && (
        <div className="toast">
          <CheckCircle2 />
          {notice}
        </div>
      )}
    </main>
  );
}
function EmptyPage({ active }: { active: string }) {
  return (
    <div className="empty-page">
      <div className="empty-mark">
        <Sparkles />
      </div>
      <h2>{active}</h2>
      <p>
        This production surface is connected to Bro’s shared domain and adapter
        boundaries. Demo workflows remain clearly labeled until provider
        credentials are configured.
      </p>
      <button>
        Open demo workflow <ArrowRight />
      </button>
    </div>
  );
}
