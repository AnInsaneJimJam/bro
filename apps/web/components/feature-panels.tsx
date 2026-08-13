'use client';
import { useEffect, useRef, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Instagram,
  Plus,
  RefreshCw,
  Save,
  Upload,
  Youtube,
} from 'lucide-react';
type Opportunity = {
  id: string;
  topic: string;
  score: number;
  reason: string;
  angle: string;
  hook: string;
  freshness: string;
  caveat: string | null;
};
type Script = {
  id: string;
  title: string;
  duration: number;
  hook: string;
  beats: Array<{ label: string; spoken: string }>;
  cta: string;
  version: number;
};
export function FeaturePanel({ active }: { active: string }) {
  if (active === 'Ideas') return <Ideas />;
  if (active === 'Scripts') return <Scripts />;
  if (active === 'Videos') return <Videos />;
  if (active === 'Calendar') return <Calendar />;
  if (active === 'Comments') return <Comments />;
  if (active === 'Connections') return <Connections />;
  if (active === 'Settings') return <Settings />;
  if (active === 'Bro Chat') return <BroChatIntro />;
  return null;
}
function Ideas() {
  const [items, setItems] = useState<Opportunity[]>([]),
    [loading, setLoading] = useState(true),
    [message, setMessage] = useState('');
  async function load(refresh = false) {
    setLoading(true);
    const r = await fetch(
        '/api/opportunities?count=5',
        refresh
          ? {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ count: 5 }),
            }
          : undefined
      ),
      d = await r.json();
    setItems(d.items || []);
    setMessage(r.ok ? '' : d.error);
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);
  return (
    <Surface
      title="Topic opportunities"
      subtitle="Evidence-backed signals for your confirmed niche and country."
      action={
        <button onClick={() => load(true)}>
          <RefreshCw />
          Refresh official signals
        </button>
      }
    >
      <div className="opportunity-feed">
        {loading ? (
          <p>Refreshing time-bounded signals…</p>
        ) : message ? (
          <p>{message}</p>
        ) : (
          items.map((x, i) => (
            <article key={x.id}>
              <div className="rank">{i + 1}</div>
              <div>
                <h3>{x.topic}</h3>
                <p>{x.reason}</p>
                <dl>
                  <div>
                    <dt>Suggested angle</dt>
                    <dd>{x.angle}</dd>
                  </div>
                  <div>
                    <dt>Potential hook</dt>
                    <dd>{x.hook}</dd>
                  </div>
                </dl>
                {x.caveat && <small>{x.caveat}</small>}
              </div>
              <div className="op-score">
                <strong>{x.score}</strong>
                <span>Opportunity</span>
                <time>
                  {new Date(x.freshness).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </time>
              </div>
            </article>
          ))
        )}
      </div>
    </Surface>
  );
}
function Scripts() {
  const [items, setItems] = useState<Script[]>([]),
    [selected, setSelected] = useState<Script | null>(null),
    [message, setMessage] = useState('');
  async function load() {
    const r = await fetch('/api/scripts'),
      d = await r.json();
    setItems(Array.isArray(d) ? d : []);
  }
  useEffect(() => {
    load();
  }, []);
  async function create() {
    const opportunityResponse = await fetch('/api/opportunities?count=5'),
      opportunities = await opportunityResponse.json(),
      topicId = opportunities.items?.[0]?.id;
    if (!topicId) {
      setMessage(opportunities.error || 'Refresh topic opportunities first.');
      return;
    }
    const r = await fetch('/api/scripts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          topicId,
          duration: 45,
          platforms: ['youtube', 'instagram'],
          angle: 'Open with a contrarian claim, then demonstrate the fix.',
        }),
      }),
      s = await r.json();
    if (r.ok) {
      setSelected({ ...s, version: s.currentVersion || s.version });
      load();
    } else setMessage(s.error);
  }
  async function save() {
    if (!selected) return;
    const r = await fetch('/api/scripts', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: selected.id,
          expectedVersion: selected.version,
          patch: {
            title: selected.title,
            hook: selected.hook,
            beats: selected.beats,
            cta: selected.cta,
          },
        }),
      }),
      s = await r.json();
    if (r.ok) {
      setSelected(s);
      setMessage(`Saved version ${s.version}`);
      load();
    } else setMessage(s.error);
  }
  async function duplicate() {
    if (!selected) return;
    const response = await fetch(`/api/scripts/${selected.id}/duplicate`, {
        method: 'POST',
      }),
      data = await response.json();
    if (response.ok) {
      setSelected(data);
      setMessage('Created an independent versioned copy.');
      load();
    } else setMessage(data.error);
  }
  async function regenerate(
    section: 'hook' | 'beat' | 'cta',
    beatIndex?: number
  ) {
    if (!selected) return;
    const instruction = prompt('How should Bro rewrite this section?');
    if (!instruction) return;
    const response = await fetch(`/api/scripts/${selected.id}/regenerate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ section, beatIndex, instruction }),
      }),
      data = await response.json();
    if (!response.ok) {
      setMessage(data.error);
      return;
    }
    if (
      !confirm(
        `Suggested rewrite:\n\n${data.text}\n\nApply this suggestion? Your current edit will remain unsaved until you save a new version.`
      )
    )
      return;
    if (section === 'hook') setSelected({ ...selected, hook: data.text });
    else if (section === 'cta') setSelected({ ...selected, cta: data.text });
    else
      setSelected({
        ...selected,
        beats: selected.beats.map((beat, i) =>
          i === beatIndex ? { ...beat, spoken: data.text } : beat
        ),
      });
    setMessage(
      'Suggestion applied locally. Save to create a new immutable version.'
    );
  }
  return (
    <Surface
      title="Scripts"
      subtitle="Versioned scripts for 15–60 second vertical videos."
      action={
        <button onClick={create}>
          <Plus />
          New 45s draft
        </button>
      }
    >
      <div className="split-view">
        <aside className="script-list">
          {items.length ? (
            items.map((s) => (
              <button
                className={selected?.id === s.id ? 'selected' : ''}
                key={s.id}
                onClick={() =>
                  setSelected({
                    ...s,
                    version:
                      s.version ||
                      (s as Script & { currentVersion?: number })
                        .currentVersion ||
                      1,
                  })
                }
              >
                <strong>{s.title}</strong>
                <span>
                  {s.duration}s · v
                  {s.version ||
                    (s as Script & { currentVersion?: number })
                      .currentVersion ||
                    1}
                </span>
              </button>
            ))
          ) : (
            <p>No scripts yet. Create one from a topic opportunity.</p>
          )}
        </aside>
        <section className="script-editor">
          {selected ? (
            <>
              <label>
                Working title
                <input
                  value={selected.title}
                  onChange={(e) =>
                    setSelected({ ...selected, title: e.target.value })
                  }
                />
              </label>
              <label>
                Hook
                <textarea
                  value={selected.hook}
                  onChange={(e) =>
                    setSelected({ ...selected, hook: e.target.value })
                  }
                />
                <button type="button" onClick={() => regenerate('hook')}>
                  Regenerate hook
                </button>
              </label>
              {selected.beats.map((beat, i) => (
                <label key={i}>
                  {beat.label}
                  <textarea
                    value={beat.spoken}
                    onChange={(e) =>
                      setSelected({
                        ...selected,
                        beats: selected.beats.map((b, n) =>
                          n === i ? { ...b, spoken: e.target.value } : b
                        ),
                      })
                    }
                  />
                  <button type="button" onClick={() => regenerate('beat', i)}>
                    Regenerate beat
                  </button>
                </label>
              ))}
              <label>
                CTA
                <textarea
                  value={selected.cta}
                  onChange={(e) =>
                    setSelected({ ...selected, cta: e.target.value })
                  }
                />
                <button type="button" onClick={() => regenerate('cta')}>
                  Regenerate CTA
                </button>
              </label>
              <button onClick={save}>
                <Save />
                Save new version
              </button>
              <button onClick={duplicate}>Duplicate script</button>
              {message && <small>{message}</small>}
            </>
          ) : (
            <div className="editor-empty">
              Select a script to edit without overwriting its history.
            </div>
          )}
        </section>
      </div>
    </Surface>
  );
}
function Videos() {
  type Cue = {
    text: string;
    start: number;
    end: number;
    style?: Record<string, unknown>;
  };
  const input = useRef<HTMLInputElement>(null),
    video = useRef<HTMLVideoElement>(null),
    [cues, setCues] = useState([
      { text: 'Your AI assistant forgets everything', start: 0, end: 2.2 },
      { text: 'and that is costing you hours.', start: 2.2, end: 4.4 },
    ]),
    [projectId, setProjectId] = useState('demo'),
    [updatedAt, setUpdatedAt] = useState(new Date().toISOString()),
    [status, setStatus] = useState('Demo captions are editable locally.'),
    [preview, setPreview] = useState(''),
    [style, setStyle] = useState({
      fontSize: 58,
      textColor: '#ffffff',
      outline: 4,
      verticalPosition: 'bottom',
    });
  const validation = cues.flatMap((cue, i) =>
    cue.start < 0 || cue.end <= cue.start
      ? [`Cue ${i + 1} needs a positive duration.`]
      : i > 0 && cue.start < cues[i - 1]!.end
        ? [`Cue ${i + 1} overlaps cue ${i}.`]
        : []
  );
  async function upload(file?: File) {
    if (!file) return;
    setStatus('Requesting a private signed upload…');
    const signed = await fetch('/api/uploads/sign', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          filename: file.name,
          mimeType: file.type,
          size: file.size,
        }),
      }),
      details = await signed.json();
    if (!signed.ok) {
      setStatus(details.error);
      return;
    }
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
      key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
      setStatus('Supabase browser configuration is missing.');
      return;
    }
    const client = createClient(url, key),
      result = await client.storage
        .from(details.bucket)
        .uploadToSignedUrl(details.objectKey, details.token, file, {
          contentType: file.type,
        });
    if (result.error) {
      setStatus(result.error.message);
      return;
    }
    const finalized = await fetch('/api/uploads/finalize', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId: details.projectId,
          objectKey: details.objectKey,
          filename: file.name,
          mimeType: file.type,
          size: file.size,
        }),
      }),
      created = await finalized.json();
    if (!finalized.ok) {
      setStatus(created.error);
      return;
    }
    setProjectId(created.projectId);
    const media = await fetch(`/api/videos/${created.projectId}/media`),
      signedMedia = await media.json();
    if (media.ok) setPreview(signedMedia.url);
    setStatus('Queued for metadata extraction and timestamped transcription.');
  }
  async function refresh() {
    const r = await fetch(`/api/videos/${projectId}/captions`),
      d = await r.json();
    if (!r.ok) {
      setStatus(d.error);
      return;
    }
    setCues(
      d.cues.map((c: Cue) => ({
        text: c.text,
        start: c.start,
        end: c.end,
        style: c.style,
      }))
    );
    if (d.cues[0]?.style)
      setStyle((current) => ({ ...current, ...d.cues[0].style }));
    setUpdatedAt(d.project.updatedAt);
    setStatus(
      d.demo
        ? 'Demo data — edits stay in this browser.'
        : `Project state: ${d.project.state}`
    );
    if (!d.demo) {
      const media = await fetch(`/api/videos/${projectId}/media`),
        signed = await media.json();
      if (media.ok) setPreview(signed.url);
    }
  }
  async function save() {
    if (validation.length) {
      setStatus(validation[0]!);
      return;
    }
    if (projectId === 'demo') {
      setStatus('Demo data — edits are not stored or rendered.');
      return;
    }
    const r = await fetch(`/api/videos/${projectId}/captions`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          expectedUpdatedAt: updatedAt,
          cues: cues.map((cue) => ({ ...cue, style })),
        }),
      }),
      d = await r.json();
    if (r.ok) {
      setUpdatedAt(d.updatedAt);
      setStatus('Caption draft saved.');
    } else setStatus(d.error);
  }
  async function render() {
    if (validation.length) {
      setStatus(validation[0]!);
      return;
    }
    if (projectId === 'demo') {
      setStatus('Demo mode does not claim to render media.');
      return;
    }
    const r = await fetch(`/api/videos/${projectId}/render`, {
        method: 'POST',
      }),
      d = await r.json();
    setStatus(
      r.ok
        ? 'Render queued. The worker will burn captions into a new MP4.'
        : d.error
    );
  }
  function split(i: number) {
    const cue = cues[i]!,
      words = cue.text.trim().split(/\s+/),
      half = Math.max(1, Math.floor(words.length / 2)),
      mid = Number(((cue.start + cue.end) / 2).toFixed(3));
    setCues([
      ...cues.slice(0, i),
      { ...cue, text: words.slice(0, half).join(' '), end: mid },
      { ...cue, text: words.slice(half).join(' ') || '…', start: mid },
      ...cues.slice(i + 1),
    ]);
  }
  function merge(i: number) {
    if (i >= cues.length - 1) return;
    const current = cues[i]!,
      next = cues[i + 1]!;
    setCues([
      ...cues.slice(0, i),
      {
        ...current,
        text: `${current.text} ${next.text}`.trim(),
        end: next.end,
      },
      ...cues.slice(i + 2),
    ]);
  }
  return (
    <Surface
      title="Videos & captions"
      subtitle="Upload directly to private storage, then edit timestamped English captions before rendering."
      action={
        <>
          <input
            ref={input}
            hidden
            type="file"
            accept="video/mp4,video/quicktime,video/webm"
            onChange={(e) => upload(e.target.files?.[0])}
          />
          <button onClick={() => input.current?.click()}>
            <Upload />
            Upload video
          </button>
        </>
      }
    >
      <div className="caption-workspace">
        <div className="video-placeholder">
          {preview ? (
            <video ref={video} src={preview} controls playsInline />
          ) : (
            <>
              <div>9:16</div>
              <p>Video preview appears after a validated upload.</p>
            </>
          )}
          <small>{status}</small>
          {projectId !== 'demo' && (
            <button onClick={refresh}>
              <RefreshCw />
              Refresh captions
            </button>
          )}
        </div>
        <div className="cue-editor">
          <header>
            <strong>Caption cues</strong>
            <span>High-contrast default · bottom</span>
          </header>
          <div className="caption-style">
            <label>
              Size
              <input
                type="number"
                min="28"
                max="96"
                value={style.fontSize}
                onChange={(e) =>
                  setStyle({ ...style, fontSize: Number(e.target.value) })
                }
              />
            </label>
            <label>
              Text
              <input
                type="color"
                value={style.textColor}
                onChange={(e) =>
                  setStyle({ ...style, textColor: e.target.value })
                }
              />
            </label>
            <label>
              Outline
              <input
                type="number"
                min="0"
                max="10"
                value={style.outline}
                onChange={(e) =>
                  setStyle({ ...style, outline: Number(e.target.value) })
                }
              />
            </label>
            <label>
              Position
              <select
                value={style.verticalPosition}
                onChange={(e) =>
                  setStyle({ ...style, verticalPosition: e.target.value })
                }
              >
                <option>top</option>
                <option>middle</option>
                <option>bottom</option>
              </select>
            </label>
          </div>
          {cues.map((cue, i) => (
            <div
              className="cue"
              key={i}
              onClick={() => {
                if (video.current) video.current.currentTime = cue.start;
              }}
            >
              <span>{i + 1}</span>
              <textarea
                value={cue.text}
                onChange={(e) =>
                  setCues(
                    cues.map((c, n) =>
                      n === i ? { ...c, text: e.target.value } : c
                    )
                  )
                }
              />
              <label>
                Start
                <input
                  type="number"
                  step="0.1"
                  value={cue.start}
                  onChange={(e) =>
                    setCues(
                      cues.map((c, n) =>
                        n === i ? { ...c, start: Number(e.target.value) } : c
                      )
                    )
                  }
                />
              </label>
              <label>
                End
                <input
                  type="number"
                  step="0.1"
                  value={cue.end}
                  onChange={(e) =>
                    setCues(
                      cues.map((c, n) =>
                        n === i ? { ...c, end: Number(e.target.value) } : c
                      )
                    )
                  }
                />
              </label>
              <div className="cue-actions">
                <button onClick={() => split(i)}>Split</button>
                <button
                  disabled={i === cues.length - 1}
                  onClick={() => merge(i)}
                >
                  Merge
                </button>
                <button
                  disabled={cues.length === 1}
                  onClick={() => setCues(cues.filter((_, n) => n !== i))}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
          {validation.map((error) => (
            <small className="cue-error" key={error}>
              {error}
            </small>
          ))}
          <button
            onClick={() =>
              setCues([
                ...cues,
                {
                  text: 'New caption',
                  start: cues.at(-1)?.end || 0,
                  end: (cues.at(-1)?.end || 0) + 2,
                },
              ])
            }
          >
            <Plus />
            Add cue
          </button>
          <button onClick={save}>
            <Save />
            Save draft
          </button>
          <button className="primary-small" onClick={render}>
            Render captioned MP4
          </button>
        </div>
      </div>
    </Surface>
  );
}
function Calendar() {
  type Job = {
    id: string;
    scheduledAt: string;
    scheduledLocalDate?: string;
    state: string;
  };
  type Project = {
    id: string;
    state: string;
    demo?: boolean;
    metadata?: { filename?: string };
  };
  const now = new Date(),
    initial = new Date(now.getTime() + 864e5);
  initial.setHours(19, 30, 0, 0);
  const [view, setView] = useState<'month' | 'week'>('month'),
    [cursor, setCursor] = useState(
      new Date(now.getFullYear(), now.getMonth(), 1)
    ),
    [selected, setSelected] = useState(localInput(initial)),
    [zone, setZone] = useState(
      Intl.DateTimeFormat().resolvedOptions().timeZone
    ),
    [jobs, setJobs] = useState<Job[]>([]),
    [projects, setProjects] = useState<Project[]>([]),
    [projectId, setProjectId] = useState(''),
    [destinations, setDestinations] = useState({
      youtube: true,
      instagram: true,
    }),
    [message, setMessage] = useState('');
  async function load() {
    const [start, end] = [
        new Date(cursor.getFullYear(), cursor.getMonth(), 1),
        new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1),
      ],
      responses = await Promise.all([
        fetch(
          `/api/publish?from=${start.toISOString()}&to=${end.toISOString()}`
        ),
        fetch('/api/videos?limit=50'),
        fetch('/api/profile'),
      ]),
      jobData = await responses[0].json(),
      videoData = await responses[1].json(),
      profile = await responses[2].json();
    setJobs(Array.isArray(jobData) ? jobData : []);
    const ready = Array.isArray(videoData)
      ? videoData.filter((item: Project) => item.state === 'ready')
      : [];
    setProjects(ready);
    setProjectId((value) => value || ready[0]?.id || '');
    if (profile.timeZone) setZone(profile.timeZone);
  }
  useEffect(() => {
    load();
  }, [cursor]);
  async function schedule() {
    const providers = Object.entries(destinations)
      .filter(([, enabled]) => enabled)
      .map(([provider]) => provider);
    if (!projectId) {
      setMessage('Choose a ready captioned video first.');
      return;
    }
    if (!providers.length) {
      setMessage('Choose at least one destination.');
      return;
    }
    const response = await fetch('/api/publish', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId,
          providers,
          mode: 'schedule',
          localDateTime: selected,
          timeZone: zone,
        }),
      }),
      data = await response.json();
    if (data.requiresConfirmation) {
      if (
        !confirm(
          `Confirm ${data.card.mediaName} to ${data.card.providers.join(' + ')} at ${data.card.scheduledAt} ${data.card.timeZone}?`
        )
      ) {
        setMessage('Schedule remains awaiting confirmation.');
        return;
      }
      const confirmed = await fetch(`/api/publish/${data.jobId}/confirm`, {
          method: 'POST',
        }),
        result = await confirmed.json();
      if (confirmed.ok && data.demo) {
        const scheduledAt = new Date(selected).toISOString();
        setJobs((current) => [
          ...current,
          {
            id: data.jobId,
            scheduledAt,
            scheduledLocalDate: selected.slice(0, 10),
            state: 'scheduled · demo',
          },
        ]);
        setMessage(
          'Demo schedule added to this calendar only. No platform request was made.'
        );
        return;
      } else setMessage(confirmed.ok ? 'Publish job scheduled.' : result.error);
    } else setMessage(response.ok ? 'Publish job scheduled.' : data.error);
    load();
  }
  async function cancel(jobId: string) {
    const response = await fetch(`/api/publish/${jobId}`, { method: 'DELETE' }),
      data = await response.json();
    setMessage(response.ok ? 'Scheduled post cancelled.' : data.error);
    load();
  }
  const days =
      view === 'month'
        ? new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate()
        : 7,
    month = cursor.toLocaleString([], { month: 'long', year: 'numeric' });
  return (
    <Surface
      title="Calendar"
      subtitle={`Manual slots shown in ${zone}. Bro stores execution times in UTC.`}
      action={
        <div className="toggle">
          <button
            className={view === 'month' ? 'on' : ''}
            onClick={() => setView('month')}
          >
            Month
          </button>
          <button
            className={view === 'week' ? 'on' : ''}
            onClick={() => setView('week')}
          >
            Week
          </button>
        </div>
      }
    >
      <div className="calendar-toolbar">
        <button
          onClick={() =>
            setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))
          }
        >
          <ChevronLeft />
        </button>
        <h3>{month}</h3>
        <button
          onClick={() =>
            setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))
          }
        >
          <ChevronRight />
        </button>
      </div>
      <div className="calendar-grid">
        {[...Array(days)].map((_, i) => {
          const day = i + 1,
            dayJobs = jobs.filter(
              (job) =>
                (job.scheduledLocalDate ||
                  new Date(job.scheduledAt).toLocaleDateString('en-CA', {
                    timeZone: zone,
                  })) ===
                `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
            );
          return (
            <button
              key={day}
              onClick={() => {
                const date = new Date(
                  cursor.getFullYear(),
                  cursor.getMonth(),
                  day,
                  19,
                  30
                );
                setSelected(localInput(date));
              }}
            >
              <span>{day}</span>
              {dayJobs.map((job) => (
                <b
                  key={job.id}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (job.state === 'scheduled') cancel(job.id);
                  }}
                >
                  <Youtube />
                  {new Date(job.scheduledAt).toLocaleTimeString([], {
                    timeZone: zone,
                    hour: '2-digit',
                    minute: '2-digit',
                  })}{' '}
                  · {job.state}
                </b>
              ))}
            </button>
          );
        })}
      </div>
      <div className="slot-editor">
        <CalendarDays />
        <label>
          Manual future slot
          <input
            type="datetime-local"
            value={selected}
            min={localInput(new Date())}
            onChange={(e) => setSelected(e.target.value)}
          />
        </label>
        <div>
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
          >
            <option value="">Choose a ready video</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.metadata?.filename || project.id}
              </option>
            ))}
          </select>
          <label>
            <input
              type="checkbox"
              checked={destinations.youtube}
              onChange={(e) =>
                setDestinations({ ...destinations, youtube: e.target.checked })
              }
            />{' '}
            YouTube
          </label>
          <label>
            <input
              type="checkbox"
              checked={destinations.instagram}
              onChange={(e) =>
                setDestinations({
                  ...destinations,
                  instagram: e.target.checked,
                })
              }
            />{' '}
            Instagram
          </label>
        </div>
        <button onClick={schedule}>Review schedule</button>
      </div>
      {message && <small>{message}</small>}
    </Surface>
  );
}
function localInput(date: Date) {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16);
}
function Comments() {
  type Analysis = {
    summary: string;
    themes?: string[];
    sampleSize: number;
    lastSyncedAt?: string;
    classificationNotice: string;
    representativeComments?: Array<{
      commentId: string;
      excerpt?: string;
      platform?: string;
      canonicalUrl?: string;
    }>;
  };
  const [platform, setPlatform] = useState('all'),
    [keyword, setKeyword] = useState(''),
    [date, setDate] = useState(''),
    [question, setQuestion] = useState('What are viewers confused about?'),
    [analysis, setAnalysis] = useState<Analysis | null>(null),
    [sample, setSample] = useState(0),
    [lastSync, setLastSync] = useState<string | undefined>(),
    [message, setMessage] = useState('');
  async function refreshList() {
    const params = new URLSearchParams();
    if (platform !== 'all') params.set('platform', platform);
    if (keyword) params.set('keyword', keyword);
    if (date) params.set('from', new Date(`${date}T00:00:00`).toISOString());
    const response = await fetch(`/api/comments?${params}`),
      data = await response.json();
    setSample(data.sampleSize || 0);
    setLastSync(data.lastSyncedAt);
    if (!response.ok) setMessage(data.error);
  }
  useEffect(() => {
    refreshList();
  }, [platform, keyword, date]);
  async function sync() {
    const providers =
      platform === 'all' ? ['youtube', 'instagram'] : [platform];
    const response = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'sync', platforms: providers }),
      }),
      data = await response.json();
    setMessage(
      response.ok ? data.message || 'Comment sync queued.' : data.error
    );
  }
  async function analyze() {
    const filters: { platforms?: string[]; from?: string } = {};
    if (platform !== 'all') filters.platforms = [platform];
    if (date) filters.from = new Date(`${date}T00:00:00`).toISOString();
    const response = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'analyze', question, filters }),
      }),
      data = await response.json();
    if (response.ok) setAnalysis(data);
    else setMessage(data.error);
  }
  return (
    <Surface
      title="Comments"
      subtitle={`${sample} stored comments${lastSync ? ` · last sync ${new Date(lastSync).toLocaleString()}` : ''}.`}
      action={
        <button onClick={sync}>
          <RefreshCw />
          Sync owned media
        </button>
      }
    >
      <div className="filter-row">
        <select value={platform} onChange={(e) => setPlatform(e.target.value)}>
          <option value="all">YouTube + Instagram</option>
          <option value="youtube">YouTube</option>
          <option value="instagram">Instagram</option>
        </select>
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="Filter by keyword"
        />
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>
      <div className="filter-row">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          aria-label="Analysis question"
        />
        <button onClick={analyze}>Analyze selected comments</button>
      </div>
      {analysis && (
        <div className="analysis">
          <h3>{question}</h3>
          <p>{analysis.summary}</p>
          {analysis.themes?.length && (
            <div>
              <strong>Recurring themes</strong>
              <span>{analysis.themes.join(' · ')}</span>
            </div>
          )}
          {analysis.representativeComments?.map((comment) => (
            <blockquote key={comment.commentId}>
              “{comment.excerpt}”{' '}
              <cite>
                {comment.platform}
                {comment.canonicalUrl && (
                  <>
                    {' '}
                    ·{' '}
                    <a
                      href={comment.canonicalUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      owned post
                    </a>
                  </>
                )}
              </cite>
            </blockquote>
          ))}
          <small>
            Sample: {analysis.sampleSize} retrieved comments.{' '}
            {analysis.classificationNotice}
          </small>
        </div>
      )}
      {message && <small>{message}</small>}
    </Surface>
  );
}
function Connections() {
  type Connection = {
    provider: 'youtube' | 'instagram' | 'reddit';
    accountName?: string;
    status: string;
    lastSyncAt?: string;
    demo?: boolean;
  };
  const [connections, setConnections] = useState<Connection[]>([]),
    [message, setMessage] = useState('');
  async function load() {
    const response = await fetch('/api/connections'),
      data = await response.json();
    setConnections(Array.isArray(data) ? data : []);
    if (!response.ok) setMessage(data.error);
  }
  useEffect(() => {
    load();
  }, []);
  async function disconnect(provider: Connection['provider']) {
    if (
      !confirm(
        `Disconnect ${provider}? Bro will revoke the token where the provider supports it.`
      )
    )
      return;
    const response = await fetch('/api/connections', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider }),
      }),
      data = await response.json();
    setMessage(response.ok ? `${provider} disconnected.` : data.error);
    load();
  }
  const notes = {
    youtube: 'Owned Shorts, uploads and comments',
    instagram: 'Eligible professional account required',
    reddit: 'Feature-flagged pending approved API access',
  };
  return (
    <Surface
      title="Connections"
      subtitle="One account per platform. Official OAuth only; passwords are never requested."
    >
      <div className="connection-table">
        {(['youtube', 'instagram', 'reddit'] as const).map((provider) => {
          const connection = connections.find(
              (item) => item.provider === provider
            ),
            name = provider.charAt(0).toUpperCase() + provider.slice(1),
            status = connection?.demo
              ? 'Demo data'
              : connection?.status || 'Disconnected';
          return (
            <article key={provider}>
              <div className="platform-letter">{name.charAt(0)}</div>
              <div>
                <h3>
                  {name}
                  {connection?.accountName
                    ? ` · ${connection.accountName}`
                    : ''}
                </h3>
                <p>
                  {notes[provider]}
                  {connection?.lastSyncAt
                    ? ` · synced ${new Date(connection.lastSyncAt).toLocaleString()}`
                    : ''}
                </p>
              </div>
              <span
                className={status === 'healthy' ? 'healthy' : 'demo-status'}
              >
                {status}
              </span>
              <div>
                {connection && !connection.demo ? (
                  <>
                    <button
                      onClick={() =>
                        (location.href = `/api/oauth/${provider}/start`)
                      }
                    >
                      Reconnect
                      <ExternalLink />
                    </button>
                    <button onClick={() => disconnect(provider)}>
                      Disconnect
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() =>
                      (location.href = `/api/oauth/${provider}/start`)
                    }
                  >
                    Connect
                    <ExternalLink />
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
      {message && <small>{message}</small>}
    </Surface>
  );
}
function Settings() {
  const [values, setValues] = useState({ youtube: false, instagram: false }),
    [message, setMessage] = useState('');
  useEffect(() => {
    fetch('/api/settings/auto-publish')
      .then((r) => r.json())
      .then((d) =>
        setValues({ youtube: !!d.youtube, instagram: !!d.instagram })
      );
  }, []);
  async function change(provider: 'youtube' | 'instagram', enabled: boolean) {
    if (
      enabled &&
      !confirm(
        `Enable auto-publish for ${provider}? Externally visible posts may be created from sufficiently specific commands.`
      )
    )
      return;
    const r = await fetch('/api/settings/auto-publish', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          provider,
          enabled,
          confirmed: enabled || undefined,
        }),
      }),
      d = await r.json();
    if (r.ok) {
      setValues((v) => ({ ...v, [provider]: enabled }));
      setMessage(
        `${provider} auto-publish ${enabled ? 'enabled' : 'disabled'}.`
      );
    } else setMessage(d.error);
  }
  async function deleteAccount() {
    if (
      !confirm(
        'Delete your Bro account, connected tokens, stored content, comments, and videos? This cannot be undone.'
      )
    )
      return;
    if (
      !confirm('Final confirmation: permanently delete all Bro account data?')
    )
      return;
    const response = await fetch('/api/account', { method: 'DELETE' }),
      data = await response.json();
    if (response.ok) {
      setMessage(
        data.warnings?.length
          ? `Account data deleted. ${data.warnings.join(' ')}`
          : 'Account deleted.'
      );
      location.href = '/login';
    } else setMessage(data.error);
  }
  return (
    <Surface
      title="Settings"
      subtitle="Publishing remains creator-controlled and defaults to confirmation."
    >
      <section className="settings-section">
        <h3>Auto-publish</h3>
        <p>
          Enabling a destination requires explicit confirmation. Specific chat
          commands can then act without another confirmation.
        </p>
        <Toggle
          name="YouTube"
          value={values.youtube}
          set={(v) => change('youtube', v)}
        />
        <Toggle
          name="Instagram"
          value={values.instagram}
          set={(v) => change('instagram', v)}
        />
        {message && <small>{message}</small>}
      </section>
      <section className="settings-section">
        <h3>Privacy</h3>
        <button onClick={deleteAccount}>Delete account and data</button>
        <a href="/privacy">Read privacy notice</a>
      </section>
    </Surface>
  );
}
function Toggle({
  name,
  value,
  set,
}: {
  name: string;
  value: boolean;
  set: (v: boolean) => void | Promise<void>;
}) {
  return (
    <div className="setting-row">
      <div>
        <strong>{name}</strong>
        <span>{value ? 'Enabled' : 'Confirmation required'}</span>
      </div>
      <button
        aria-label={`${value ? 'Disable' : 'Enable'} ${name} auto-publish`}
        aria-pressed={value}
        className={value ? 'switch on' : 'switch'}
        onClick={() => set(!value)}
      >
        <i />
      </button>
    </div>
  );
}
function BroChatIntro() {
  return (
    <Surface
      title="Bro Chat"
      subtitle="Typed and recorded English commands invoke validated application tools."
    >
      <div className="chat-intro">
        <h3>What should we make next?</h3>
        <p>
          Try “Find five trending AI-memory topics in India” or “Write a
          45-second script for topic two with a contrarian hook.”
        </p>
        <div>
          <Check />
          Missing information is requested instead of guessed.
        </div>
        <div>
          <Check />
          Publishing obeys destination-specific confirmation settings.
        </div>
      </div>
    </Surface>
  );
}
function Surface({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="feature">
      <header>
        <div>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
        {action}
      </header>
      {children}
    </div>
  );
}
