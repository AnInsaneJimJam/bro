import {
  ArrowRight,
  CalendarDays,
  Check,
  FileText,
  Instagram,
  Lightbulb,
  LockKeyhole,
  MessageCircle,
  Play,
  ShieldCheck,
  UserRound,
  Upload,
  Youtube,
} from 'lucide-react';
import { isDemoMode } from '@/lib/auth';

const workflow = [
  {
    number: '01',
    title: 'Find the angle',
    body: 'Evidence-backed opportunities for your niche and country.',
    icon: <Lightbulb />,
  },
  {
    number: '02',
    title: 'Write the script',
    body: 'A short-form draft you can edit, version, and make yours.',
    icon: <FileText />,
  },
  {
    number: '03',
    title: 'Upload once',
    body: 'Validate the original video and prepare platform-specific metadata.',
    icon: <Upload />,
  },
  {
    number: '04',
    title: 'Schedule and learn',
    body: 'Manual calendar slots, explicit approval, and grounded comment analysis.',
    icon: <CalendarDays />,
  },
];

export function LandingPage() {
  const demo = isDemoMode();
  const connectHref = demo ? '/onboarding?step=connections' : '/login';
  return (
    <main className="landing">
      <header className="landing-nav">
        <a className="landing-logo" href="#top" aria-label="Bro home">
          Bro<span>.</span>
        </a>
        <nav aria-label="Landing navigation">
          <a href="#how-it-works">How it works</a>
          <a href="#what-bro-does">What Bro does</a>
        </nav>
        <div className="landing-nav-actions">
          {demo && (
            <a className="landing-button secondary" href="/app">
              Try demo
            </a>
          )}
          <a className="landing-button primary" href={connectHref}>
            Connect your accounts
          </a>
        </div>
      </header>

      <section className="landing-hero" id="top">
        <div className="landing-hero-copy">
          <h1>
            Your content
            <br />
            workflow, handled<span>.</span>
          </h1>
          <p>
            Find the right idea, write the script, upload once, schedule the
            post, and understand the comments — all by talking to Bro.
          </p>
          <div className="landing-hero-actions">
            <a className="landing-button primary large" href={connectHref}>
              <Youtube />
              <Instagram />
              Connect YouTube + Instagram
            </a>
            {demo && (
              <a className="landing-button secondary large" href="/app">
                <Play /> Explore the demo
              </a>
            )}
          </div>
          <small>
            <LockKeyhole /> Official APIs. Your approval before publishing.
          </small>
        </div>

        <div className="landing-product" aria-label="Bro workflow preview">
          <aside>
            <div className="preview-logo">
              Bro<span>.</span>
            </div>
            <b className="selected">
              <MessageCircle /> Assistant
            </b>
            <b>
              <Lightbulb /> Opportunities
            </b>
            <b>
              <FileText /> Scripts
            </b>
            <b>
              <Upload /> Upload
            </b>
            <b>
              <CalendarDays /> Schedule
            </b>
          </aside>
          <div className="preview-main">
            <span className="preview-date">Today</span>
            <div className="preview-command">
              Bro, find a strong AI-memory angle and write a 45-second script.
            </div>
            <div className="preview-reply">
              <i>B.</i>
              <div>
                <strong>Got it. Your workflow is ready to review.</strong>
                <div className="preview-flow">
                  <span>
                    <Lightbulb />
                    <b>Opportunity</b>
                    <small>AI agents that remember your work</small>
                  </span>
                  <span>
                    <FileText />
                    <b>Script</b>
                    <small>Contrarian hook · 45 seconds</small>
                  </span>
                  <span>
                    <Upload />
                    <b>Video</b>
                    <small>Validated original upload</small>
                  </span>
                  <span>
                    <CalendarDays />
                    <b>Scheduled</b>
                    <small>YouTube Shorts + Instagram Reels</small>
                  </span>
                </div>
              </div>
            </div>
            <div className="preview-composer">
              Ask Bro anything… <ArrowRight />
            </div>
          </div>
        </div>
      </section>

      <section className="landing-workflow" id="how-it-works">
        <div className="landing-section-heading">
          <h2>
            From blank page to
            <br /> published Short<span>.</span>
          </h2>
          <p>Bro keeps every step connected, while you stay in control.</p>
        </div>
        <div className="workflow-rail" id="what-bro-does">
          {workflow.map((step) => (
            <article key={step.number}>
              <div className="workflow-number">{step.number}</div>
              <div className="workflow-icon">{step.icon}</div>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </article>
          ))}
        </div>
        <div className="workflow-detail">
          <div className="script-fragment">
            <header>
              <b>Script · Draft v2</b>
              <span>
                <Check /> Saved
              </span>
            </header>
            <strong>Hook</strong>
            <p>Most creators get this wrong. Here’s the smarter way.</p>
            <strong>Payoff</strong>
            <p>Build one workflow that remembers the context for you.</p>
            <footer>152 words · 00:42 estimated</footer>
          </div>
          <div className="caption-fragment">
            <div className="vertical-video">
              <div>
                Original video
                <br />
                ready to publish.
              </div>
            </div>
            <div className="caption-timeline">
              <i />
              <span>YouTube title + description</span>
              <span>Instagram caption</span>
              <span>Unlisted test publish</span>
            </div>
          </div>
          <div className="schedule-fragment">
            <header>
              <CalendarDays /> Friday · 7:30 PM
            </header>
            <b>YouTube + Instagram</b>
            <p>Requires explicit approval</p>
            <button>Review schedule</button>
          </div>
        </div>
      </section>

      <section className="landing-connect" id="connect">
        <h2>Ready when you are.</h2>
        <p>
          Connect your creator accounts, confirm what Bro learns about your
          niche, and turn your next idea into a published Short.
        </p>
        <a className="landing-button primary large" href={connectHref}>
          <Youtube />
          <Instagram />
          Connect YouTube + Instagram
        </a>
        {demo && (
          <a className="landing-text-link" href="/app">
            Try the demo first <ArrowRight />
          </a>
        )}
        <small>
          <LockKeyhole /> Bro uses official OAuth. We never ask for your
          platform passwords.
        </small>
        <div className="landing-proof">
          <span>
            <ShieldCheck /> Creator approval by default
          </span>
          <span>
            <UserRound /> One account per platform
          </span>
          <span>
            <Youtube /> English Shorts + Reels
          </span>
        </div>
      </section>

      <footer className="landing-footer">
        <div className="landing-logo">
          Bro<span>.</span>
        </div>
        <div>
          <a href="/privacy">Privacy</a>
          <a href="https://github.com/AnInsaneJimJam/bro">GitHub</a>
        </div>
      </footer>
    </main>
  );
}
