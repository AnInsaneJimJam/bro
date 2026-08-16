'use client';
import { useEffect, useRef, useState } from 'react';
import { createSupabaseBrowserClient } from '../lib/supabase/browser';
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileText,
  Film,
  Pencil,
  Instagram,
  Plus,
  RefreshCw,
  Save,
  Upload,
  Video as VideoIcon,
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
type ConnectionSummary = {
  provider: string;
  accountName?: string;
  status?: string;
  needsReauthorization?: boolean;
};
type VideoDraftMetadata = {
  title: string;
  description: string;
  instagramCaption: string;
};
type CaptionCue = {
  text: string;
  start: number;
  end: number;
  style?: Record<string, unknown>;
};
type VideoStatusMetadata = {
  hasTranscript?: boolean;
  transcriptionStatus?: string | null;
  transcriptionProvider?: string | null;
  aiMetadata?: VideoDraftMetadata | null;
  notice?: string | null;
};
type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};
/**
 * Set by "Schedule" on My Videos so Calendar opens with that project
 * pre-selected instead of defaulting to the most recently updated one.
 */
const FOCUS_PROJECT_KEY = 'bro:focusProjectId';
/**
 * Set by "Generate script" on Ideas so Scripts opens with that new script
 * selected, the same way a chat-generated script opens automatically.
 */
const FOCUS_SCRIPT_KEY = 'bro:focusScriptId';
/**
 * Tracks which named action is in flight so a button can show a spinner
 * (via data-busy) instead of leaving a click with no visible response.
 */
function useBusy() {
  const [busyKey, setBusyKey] = useState<string | null>(null);
  return {
    isBusy: (key: string) => busyKey === key,
    run: async (key: string, action: () => Promise<void>) => {
      setBusyKey(key);
      try {
        await action();
      } finally {
        setBusyKey(null);
      }
    },
  };
}
export function FeaturePanel({
  active,
  chatMessages,
  chatBusy,
  focusScriptId,
}: {
  active: string;
  chatMessages?: ChatMessage[];
  chatBusy?: boolean;
  focusScriptId?: string;
}) {
  if (active === 'Ideas') return <Ideas />;
  if (active === 'Scripts') return <Scripts focusScriptId={focusScriptId} />;
  if (active === 'Upload') return <Videos />;
  if (active === 'My Videos') return <MyVideos />;
  if (active === 'Calendar') return <Calendar />;
  if (active === 'Comments') return <Comments />;
  if (active === 'Connections') return <Connections />;
  if (active === 'Settings') return <Settings />;
  if (active === 'Bro Chat')
    return <BroChat messages={chatMessages || []} busy={Boolean(chatBusy)} />;
  return null;
}
function Ideas() {
  const [items, setItems] = useState<Opportunity[]>([]),
    [loading, setLoading] = useState(true),
    [message, setMessage] = useState(''),
    [genError, setGenError] = useState<{ id: string; text: string } | null>(
      null
    ),
    { isBusy, run } = useBusy();
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
  async function generateScript(topic: Opportunity) {
    await run(topic.id, () => generateScriptFromIdea(topic));
  }
  async function generateScriptFromIdea(topic: Opportunity) {
    setGenError(null);
    const response = await fetch('/api/scripts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          topicId: topic.id,
          duration: 45,
          platforms: ['youtube', 'instagram'],
          angle: topic.angle,
        }),
      }),
      data = await response.json();
    if (!response.ok) {
      setGenError({
        id: topic.id,
        text: data.error || 'Bro could not generate a script for this idea.',
      });
      return;
    }
    sessionStorage.setItem(FOCUS_SCRIPT_KEY, data.id);
    location.hash = 'Scripts';
  }
  return (
    <Surface
      title="Topic opportunities"
      subtitle="Evidence-backed signals for your confirmed niche and country."
      action={
        <button
          onClick={() => load(true)}
          disabled={loading}
          data-busy={loading}
        >
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
        ) : items.length === 0 ? (
          <p>
            No current opportunities. Confirm your niche, then refresh official
            signals.
          </p>
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
                <button
                  className="idea-generate-script"
                  onClick={() => generateScript(x)}
                  disabled={isBusy(x.id)}
                  data-busy={isBusy(x.id)}
                >
                  <FileText />
                  Generate script
                </button>
                {genError?.id === x.id && (
                  <small className="idea-generate-error">{genError.text}</small>
                )}
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
function Scripts({ focusScriptId }: { focusScriptId?: string }) {
  const [items, setItems] = useState<Script[]>([]),
    [selected, setSelected] = useState<Script | null>(null),
    [mode, setMode] = useState<'read' | 'edit'>('read'),
    [message, setMessage] = useState(''),
    { isBusy, run } = useBusy();
  useEffect(() => {
    setMode('read');
  }, [selected?.id]);
  async function load(preferredId?: string) {
    const r = await fetch('/api/scripts'),
      d = await r.json();
    if (!r.ok) {
      setMessage(d.error || 'Could not load scripts.');
      return;
    }
    const next = Array.isArray(d) ? (d as Script[]) : [];
    setItems(next);
    // The API returns newest first. Open the requested generated script when
    // supplied; otherwise make the first script the active editor by default.
    setSelected((current) => {
      const target = preferredId
        ? next.find((script) => script.id === preferredId)
        : current
          ? next.find((script) => script.id === current.id)
          : next[0];
      return target
        ? {
            ...target,
            version:
              target.version ||
              (target as Script & { currentVersion?: number }).currentVersion ||
              1,
          }
        : null;
    });
  }
  useEffect(() => {
    const sessionFocusId = sessionStorage.getItem(FOCUS_SCRIPT_KEY);
    if (sessionFocusId) sessionStorage.removeItem(FOCUS_SCRIPT_KEY);
    void load(sessionFocusId || focusScriptId);
  }, [focusScriptId]);
  async function create() {
    await run('create', createScript);
  }
  async function createScript() {
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
      setMessage(s.generationNotice || '');
      load();
    } else setMessage(s.error);
  }
  async function save() {
    if (!selected) return;
    await run('save', saveScript);
  }
  async function saveScript() {
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
      setMode('read');
      setMessage(`Saved version ${s.version}`);
      load();
    } else setMessage(s.error);
  }
  async function duplicate() {
    if (!selected) return;
    await run('duplicate', duplicateScript);
  }
  async function duplicateScript() {
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
    await run(`regenerate-${section}-${beatIndex ?? ''}`, async () =>
      regenerateSection(section, instruction, beatIndex)
    );
  }
  async function regenerateSection(
    section: 'hook' | 'beat' | 'cta',
    instruction: string,
    beatIndex?: number
  ) {
    if (!selected) return;
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
        <button
          onClick={create}
          disabled={isBusy('create')}
          data-busy={isBusy('create')}
        >
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
          {selected && mode === 'read' ? (
            <div className="script-read">
              <header className="script-read-head">
                <div>
                  <h2>{selected.title}</h2>
                  <span>
                    {selected.duration}s · version {selected.version}
                  </span>
                </div>
                <div className="script-read-actions">
                  <button onClick={() => setMode('edit')}>
                    <Pencil />
                    Edit
                  </button>
                  <button
                    onClick={duplicate}
                    disabled={isBusy('duplicate')}
                    data-busy={isBusy('duplicate')}
                  >
                    Duplicate script
                  </button>
                </div>
              </header>
              <div className="script-beat">
                <span className="script-beat-label">Hook</span>
                <p>{selected.hook}</p>
              </div>
              {selected.beats.map((beat, i) => (
                <div className="script-beat" key={i}>
                  <span className="script-beat-label">{beat.label}</span>
                  <p>{beat.spoken}</p>
                </div>
              ))}
              <div className="script-beat">
                <span className="script-beat-label">CTA</span>
                <p>{selected.cta}</p>
              </div>
              {message && <small>{message}</small>}
            </div>
          ) : selected ? (
            <>
              <div className="script-edit-head">
                <button type="button" onClick={() => setMode('read')}>
                  <ChevronLeft />
                  Back to read view
                </button>
              </div>
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
                <button
                  type="button"
                  className="regenerate-link"
                  onClick={() => regenerate('hook')}
                  disabled={isBusy('regenerate-hook-')}
                  data-busy={isBusy('regenerate-hook-')}
                >
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
                  <button
                    type="button"
                    className="regenerate-link"
                    onClick={() => regenerate('beat', i)}
                    disabled={isBusy(`regenerate-beat-${i}`)}
                    data-busy={isBusy(`regenerate-beat-${i}`)}
                  >
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
                <button
                  type="button"
                  className="regenerate-link"
                  onClick={() => regenerate('cta')}
                  disabled={isBusy('regenerate-cta-')}
                  data-busy={isBusy('regenerate-cta-')}
                >
                  Regenerate CTA
                </button>
              </label>
              <button
                onClick={save}
                disabled={isBusy('save')}
                data-busy={isBusy('save')}
              >
                <Save />
                Save new version
              </button>
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
// A camera recording defaults to 60s to match the worker's default
// MAX_VIDEO_DURATION_SECONDS; the worker still enforces the real limit.
const defaultMaxRecordingSeconds = 60;
function formatRecordTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60),
    seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
function Videos() {
  const input = useRef<HTMLInputElement>(null),
    video = useRef<HTMLVideoElement>(null),
    cameraVideo = useRef<HTMLVideoElement>(null),
    cameraStream = useRef<MediaStream | null>(null),
    recorder = useRef<MediaRecorder | null>(null),
    chunks = useRef<Blob[]>([]),
    transcriptionRequested = useRef(new Set<string>()),
    metadataRequested = useRef(new Set<string>()),
    [projectId, setProjectId] = useState(''),
    [projectState, setProjectState] = useState(''),
    [status, setStatus] = useState(
      'Upload a video to publish it to YouTube and Instagram.'
    ),
    [recordMode, setRecordMode] = useState<'idle' | 'live' | 'preview'>('idle'),
    [recordSeconds, setRecordSeconds] = useState(0),
    [recordedClip, setRecordedClip] = useState<{
      blob: Blob;
      url: string;
    } | null>(null),
    [uploading, setUploading] = useState(false),
    [drafting, setDrafting] = useState(false),
    [refreshing, setRefreshing] = useState(false),
    [retrying, setRetrying] = useState(false),
    [publishing, setPublishing] = useState(false),
    [metadataReady, setMetadataReady] = useState(false),
    [preview, setPreview] = useState(''),
    [connections, setConnections] = useState<ConnectionSummary[]>([]),
    [connectionsLoaded, setConnectionsLoaded] = useState(false),
    [youtubeEnabled, setYoutubeEnabled] = useState(true),
    [instagramEnabled, setInstagramEnabled] = useState(true),
    [youtubeTitle, setYoutubeTitle] = useState(''),
    [youtubeDescription, setYoutubeDescription] = useState(''),
    [youtubeVisibility, setYoutubeVisibility] = useState<
      'public' | 'unlisted' | 'private'
    >('unlisted'),
    [instagramCaption, setInstagramCaption] = useState(''),
    captionsLoaded = useRef(new Set<string>()),
    [cues, setCues] = useState<CaptionCue[]>([]),
    [cuesUpdatedAt, setCuesUpdatedAt] = useState(''),
    [captionsStatus, setCaptionsStatus] = useState(''),
    [savingCaptions, setSavingCaptions] = useState(false),
    [burningIn, setBurningIn] = useState(false),
    [captionedReady, setCaptionedReady] = useState(false);
  useEffect(() => {
    void loadConnections();
  }, []);
  useEffect(() => {
    if (!connectionsLoaded) return;
    if (!providerReady('youtube')) setYoutubeEnabled(false);
    if (!providerReady('instagram')) setInstagramEnabled(false);
  }, [connectionsLoaded, connections]);
  useEffect(() => {
    if (
      !projectId ||
      projectId === 'demo' ||
      (projectState === 'ready' && metadataReady) ||
      ![
        'queued',
        'uploaded',
        'validating',
        'transcribing',
        'captions_ready',
        'ready',
      ].includes(projectState)
    )
      return;
    const timer = window.setInterval(() => {
      void refresh(projectId);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [projectId, projectState, metadataReady]);
  async function loadConnections() {
    try {
      const response = await fetch('/api/connections');
      if (!response.ok) return;
      const data = (await response.json()) as ConnectionSummary[];
      if (Array.isArray(data)) setConnections(data);
    } catch {
      // The publish API still performs the authoritative connection check.
    } finally {
      setConnectionsLoaded(true);
    }
  }
  function providerReady(provider: 'youtube' | 'instagram') {
    return connections.some(
      (connection) =>
        connection.provider === provider &&
        connection.status === 'healthy' &&
        !connection.needsReauthorization
    );
  }
  function applyVideoDraft(draft: VideoDraftMetadata) {
    setYoutubeTitle(draft.title);
    setYoutubeDescription(draft.description);
    setInstagramCaption(draft.instagramCaption);
  }
  async function startTranscription(targetProjectId: string) {
    if (transcriptionRequested.current.has(targetProjectId)) return;
    transcriptionRequested.current.add(targetProjectId);
    setProjectState('transcribing');
    setStatus('Reading the spoken text from your video…');
    const response = await fetch(`/api/videos/${targetProjectId}/transcribe`, {
        method: 'POST',
      }),
      data = await response.json();
    if (!response.ok) {
      setProjectState('ready');
      setStatus(
        data.error ||
          'Bro could not read the spoken text. Add Gemini or OpenAI transcription credentials and try again.'
      );
      return;
    }
    setStatus('Transcript queued. Bro will draft the post fields next.');
  }
  async function draftMetadata(targetProjectId: string) {
    if (metadataRequested.current.has(targetProjectId)) return;
    metadataRequested.current.add(targetProjectId);
    setDrafting(true);
    setStatus(
      'Drafting the title, description, and Reel caption from the transcript…'
    );
    const response = await fetch(`/api/videos/${targetProjectId}/metadata`, {
        method: 'POST',
      }),
      data = await response.json();
    if (!response.ok) {
      setDrafting(false);
      setStatus(data.error || 'Bro could not draft the post fields yet.');
      return;
    }
    applyVideoDraft(data as VideoDraftMetadata);
    setMetadataReady(true);
    setDrafting(false);
    setStatus(
      data.generationNotice ||
        'Post fields drafted from the spoken text. Review them before publishing.'
    );
  }
  async function loadCaptions(targetProjectId: string) {
    if (
      !targetProjectId ||
      targetProjectId === 'demo' ||
      captionsLoaded.current.has(targetProjectId)
    )
      return;
    captionsLoaded.current.add(targetProjectId);
    const response = await fetch(`/api/videos/${targetProjectId}/captions`),
      data = await response.json();
    if (!response.ok) return;
    setCues(data.cues || []);
    setCuesUpdatedAt(data.project?.updatedAt || '');
  }
  async function saveCaptions() {
    if (!projectId || projectId === 'demo') return;
    setSavingCaptions(true);
    setCaptionsStatus('');
    const response = await fetch(`/api/videos/${projectId}/captions`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          expectedUpdatedAt: cuesUpdatedAt,
          cues: cues.map((cue) => ({
            text: cue.text,
            start: cue.start,
            end: cue.end,
            style: cue.style,
          })),
        }),
      }),
      data = await response.json();
    setSavingCaptions(false);
    if (!response.ok) {
      setCaptionsStatus(data.error || 'Bro could not save the captions.');
      return;
    }
    setCuesUpdatedAt(data.updatedAt);
    setCaptionsStatus('Captions saved.');
  }
  async function burnInCaptions() {
    if (!projectId || projectId === 'demo') return;
    setBurningIn(true);
    setCaptionsStatus('Burning captions into the video…');
    const response = await fetch(`/api/videos/${projectId}/render`, {
        method: 'POST',
      }),
      data = await response.json();
    if (!response.ok) {
      setBurningIn(false);
      setCaptionsStatus(data.error || 'Bro could not render captions.');
      return;
    }
    for (let attempt = 0; attempt < 60; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const statusResponse = await fetch(
          `/api/sync/content/status?kind=render-video&bossJobId=${encodeURIComponent(data.bossJobId)}`
        ),
        statusData = await statusResponse.json();
      if (!statusResponse.ok) {
        setCaptionsStatus(
          statusData.error || 'Caption render status is unavailable.'
        );
        break;
      }
      if (statusData.state === 'completed') {
        setCaptionedReady(true);
        setCaptionsStatus(
          'Captioned video ready. Publishing will use this version.'
        );
        break;
      }
      if (
        statusData.state === 'failed_retryable' ||
        statusData.state === 'failed_permanent'
      ) {
        setCaptionsStatus(
          statusData.lastErrorMessage || 'Caption rendering failed.'
        );
        break;
      }
    }
    setBurningIn(false);
  }
  function stopCameraStream() {
    cameraStream.current?.getTracks().forEach((track) => track.stop());
    cameraStream.current = null;
  }
  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 720 },
          height: { ideal: 1280 },
        },
        audio: true,
      });
      cameraStream.current = stream;
      setRecordMode('live');
      setStatus('Recording…');
      // The <video> element mounts with this render, so attach srcObject next tick.
      setTimeout(() => {
        if (cameraVideo.current) cameraVideo.current.srcObject = stream;
      }, 0);
      const mimeType = [
          'video/webm;codecs=vp9,opus',
          'video/webm;codecs=vp8,opus',
          'video/webm',
        ].find((type) => MediaRecorder.isTypeSupported(type)),
        next = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunks.current = [];
      next.ondataavailable = (event) => {
        if (event.data.size) chunks.current.push(event.data);
      };
      next.onstop = () => {
        const blob = new Blob(chunks.current, {
          type: next.mimeType || 'video/webm',
        });
        setRecordedClip({ blob, url: URL.createObjectURL(blob) });
        setRecordMode('preview');
        stopCameraStream();
      };
      recorder.current = next;
      next.start();
      setRecordSeconds(0);
    } catch {
      setStatus('Camera/microphone permission was not granted.');
    }
  }
  function stopRecording() {
    recorder.current?.stop();
  }
  function retakeRecording() {
    if (recordedClip) URL.revokeObjectURL(recordedClip.url);
    setRecordedClip(null);
    void startRecording();
  }
  function cancelRecording() {
    recorder.current?.stop();
    stopCameraStream();
    if (recordedClip) URL.revokeObjectURL(recordedClip.url);
    setRecordedClip(null);
    setRecordMode('idle');
    setStatus('Upload a video to publish it to YouTube and Instagram.');
  }
  async function useRecording() {
    if (!recordedClip) return;
    const extension = recordedClip.blob.type.includes('mp4') ? 'mp4' : 'webm',
      baseMime =
        recordedClip.blob.type.split(';', 1)[0]?.trim() || 'video/webm',
      file = new File(
        [recordedClip.blob],
        `recording-${Date.now()}.${extension}`,
        { type: baseMime }
      );
    URL.revokeObjectURL(recordedClip.url);
    setRecordedClip(null);
    setRecordMode('idle');
    await upload(file);
  }
  useEffect(() => {
    if (recordMode !== 'live') return;
    const timer = window.setInterval(() => {
      setRecordSeconds((seconds) => {
        const next = seconds + 1;
        if (next >= defaultMaxRecordingSeconds) stopRecording();
        return next;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [recordMode]);
  useEffect(() => stopCameraStream, []);
  async function upload(file?: File) {
    if (!file || uploading) return;
    setUploading(true);
    setPreview('');
    setProjectState('');
    setMetadataReady(false);
    setDrafting(false);
    setYoutubeTitle('');
    setYoutubeDescription('');
    setInstagramCaption('');
    setCues([]);
    setCuesUpdatedAt('');
    setCaptionsStatus('');
    setCaptionedReady(false);
    try {
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
        setStatus(details.error || 'Bro could not start the upload.');
        return;
      }
      const configResponse = await fetch('/api/auth/config', {
          cache: 'no-store',
        }),
        config = (await configResponse.json()) as {
          url?: string;
          anonKey?: string;
          error?: string;
        };
      if (!configResponse.ok || !config.url || !config.anonKey) {
        setStatus(config.error || 'Supabase browser configuration is missing.');
        return;
      }
      setStatus('Uploading the original video privately…');
      const client = createSupabaseBrowserClient({
          url: config.url,
          anonKey: config.anonKey,
        }),
        result = await client.storage
          .from(details.bucket)
          .uploadToSignedUrl(details.objectKey, details.token, file, {
            contentType: file.type,
          });
      if (result.error) {
        setStatus(`Upload failed: ${result.error.message}`);
        return;
      }
      setStatus('Upload received. Bro is validating the video for publishing…');
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
        setStatus(created.error || 'Bro could not finalize the upload.');
        return;
      }
      setProjectId(created.projectId);
      setProjectState(created.state || 'queued');
      transcriptionRequested.current.delete(created.projectId);
      metadataRequested.current.delete(created.projectId);
      const media = await fetch(`/api/videos/${created.projectId}/media`),
        signedMedia = await media.json();
      if (media.ok) setPreview(signedMedia.url);
      setStatus('Upload complete. Bro is validating the video for publishing.');
    } catch (error) {
      setStatus(
        error instanceof Error
          ? `Upload failed: ${error.message}`
          : 'Upload failed. Check your connection and try again.'
      );
    } finally {
      setUploading(false);
      if (input.current) input.current.value = '';
    }
  }
  async function refresh(targetProjectId = projectId) {
    if (!targetProjectId) {
      setStatus('Upload a video first.');
      return;
    }
    const r = await fetch(`/api/videos/${targetProjectId}/status`),
      d = await r.json();
    if (!r.ok) {
      setStatus(d.error);
      return;
    }
    const nextState = d.project.state || '',
      statusMetadata = (d.project.metadata || {}) as VideoStatusMetadata,
      draft = statusMetadata.aiMetadata;
    setProjectState(nextState);
    if (draft) {
      applyVideoDraft(draft);
      setMetadataReady(true);
    }
    if (statusMetadata.hasTranscript) void loadCaptions(targetProjectId);
    if (d.demo) setStatus('Demo data — edits stay in this browser.');
    else if (nextState === 'failed')
      setStatus(
        'Video validation or transcript generation failed. Retry the relevant step or upload a different file.'
      );
    else if (nextState === 'transcribing')
      setStatus('Reading the spoken text from your video…');
    else if (
      (nextState === 'ready' || nextState === 'captions_ready') &&
      statusMetadata.hasTranscript &&
      !draft
    ) {
      await draftMetadata(targetProjectId);
    } else if (
      nextState === 'ready' &&
      !statusMetadata.hasTranscript &&
      statusMetadata.transcriptionStatus !== 'failed'
    ) {
      await startTranscription(targetProjectId);
    } else if (statusMetadata.transcriptionStatus === 'failed') {
      // Nothing else will arrive for this project, so stop the status poll.
      setMetadataReady(true);
      setStatus(
        statusMetadata.notice ||
          'Bro could not read the spoken text. Write the post fields yourself and publish.'
      );
    } else if (nextState !== 'ready' || !draft) {
      setStatus(`Project state: ${nextState}`);
    } else if (!statusMetadata.notice) {
      setStatus(
        'Post fields drafted from the spoken text. Review them before publishing.'
      );
    }
    if (!d.demo) {
      if (!preview) {
        const media = await fetch(`/api/videos/${targetProjectId}/media`),
          signed = await media.json();
        if (media.ok) setPreview(signed.url);
      }
    }
  }
  async function retryValidation() {
    if (!projectId || projectId === 'demo') return;
    const response = await fetch(`/api/videos/${projectId}/validate`, {
        method: 'POST',
      }),
      data = await response.json();
    transcriptionRequested.current.delete(projectId);
    metadataRequested.current.delete(projectId);
    setMetadataReady(false);
    setProjectState(data.state || (response.ok ? 'queued' : 'failed'));
    setStatus(
      response.ok
        ? 'Validation queued again. Bro will enable publishing when it is ready.'
        : data.error || 'Could not retry video validation.'
    );
  }
  async function publishNow() {
    setPublishing(true);
    try {
      await publish();
    } finally {
      setPublishing(false);
    }
  }
  async function publish() {
    if (!projectId) {
      setStatus('Upload and validate a video first.');
      return;
    }
    if (projectState !== 'ready') {
      setStatus(
        projectState
          ? `The video is still ${projectState}. Bro will enable publishing when validation finishes.`
          : 'Upload and validate a video first.'
      );
      return;
    }
    const providers = [
      ...(youtubeEnabled ? (['youtube'] as const) : []),
      ...(instagramEnabled ? (['instagram'] as const) : []),
    ];
    if (!providers.length) {
      setStatus(
        connectionsLoaded
          ? 'Connect YouTube or Instagram before publishing.'
          : 'Choose YouTube, Instagram, or both.'
      );
      return;
    }
    if (youtubeEnabled && !youtubeTitle.trim()) {
      setStatus('Add a YouTube title before publishing.');
      return;
    }
    const response = await fetch('/api/publish', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId,
          providers,
          mode: 'now',
          metadata: {
            youtube: youtubeEnabled
              ? {
                  title: youtubeTitle.trim(),
                  description: youtubeDescription.trim(),
                  visibility: youtubeVisibility,
                }
              : undefined,
            instagram: instagramEnabled
              ? { caption: instagramCaption.trim() }
              : undefined,
          },
        }),
      }),
      data = await response.json();
    if (!response.ok) {
      setStatus(data.error || 'Could not create the publish job.');
      return;
    }
    if (data.requiresConfirmation) {
      const approved = confirm(publishConfirmationText(data.card));
      if (!approved) {
        setStatus('Publish job is awaiting your confirmation.');
        return;
      }
      const confirmation = await fetch(`/api/publish/${data.jobId}/confirm`, {
          method: 'POST',
        }),
        result = await confirmation.json();
      setStatus(
        confirmation.ok
          ? 'Publishing queued. Track each destination in Calendar.'
          : result.error || 'Could not confirm publishing.'
      );
      return;
    }
    setStatus('Publishing queued. Track each destination in Calendar.');
  }
  return (
    <Surface
      title="Upload & publish"
      subtitle="Upload once, then publish the original video to YouTube Shorts, Instagram Reels, or both."
      action={
        <div className="video-header-actions">
          <input
            ref={input}
            hidden
            type="file"
            accept="video/mp4,video/quicktime,video/webm"
            onChange={(e) => upload(e.target.files?.[0])}
          />
          <button
            onClick={() => input.current?.click()}
            disabled={uploading || recordMode !== 'idle'}
            data-busy={uploading}
          >
            <Upload />
            Upload video
          </button>
          <button
            onClick={startRecording}
            disabled={uploading || recordMode !== 'idle'}
          >
            <VideoIcon />
            Record video
          </button>
        </div>
      }
    >
      <div className="publish-workspace">
        <section className="video-preview-panel">
          <div className="video-frame">
            {recordMode === 'live' ? (
              <>
                <video ref={cameraVideo} autoPlay muted playsInline />
                <span className="record-indicator">
                  <i /> {formatRecordTime(recordSeconds)}
                </span>
              </>
            ) : recordMode === 'preview' && recordedClip ? (
              <video src={recordedClip.url} controls playsInline />
            ) : preview ? (
              <video ref={video} src={preview} controls playsInline />
            ) : (
              <div className="video-empty">
                <VerticalVideoGlyph />
                <span>
                  Upload or record a vertical video to preview it here.
                </span>
              </div>
            )}
          </div>
          {recordMode === 'live' ? (
            <div className="video-actions">
              <button onClick={stopRecording} className="primary-small">
                Stop recording
              </button>
              <button onClick={cancelRecording}>Cancel</button>
            </div>
          ) : recordMode === 'preview' ? (
            <div className="video-actions">
              <button
                onClick={useRecording}
                className="primary-small"
                disabled={uploading}
                data-busy={uploading}
              >
                Use this recording
              </button>
              <button onClick={retakeRecording}>Retake</button>
              <button onClick={cancelRecording}>Cancel</button>
            </div>
          ) : (
            <>
              <div className="video-status" role="status" aria-live="polite">
                <i className={projectState === 'failed' ? 'error' : ''} />
                <span>{status}</span>
              </div>
              <div className="video-actions">
                {projectId && projectId !== 'demo' && (
                  <button
                    onClick={async () => {
                      setRefreshing(true);
                      try {
                        await refresh();
                      } finally {
                        setRefreshing(false);
                      }
                    }}
                    disabled={refreshing}
                    data-busy={refreshing}
                  >
                    <RefreshCw />
                    Refresh status
                  </button>
                )}
                {projectId &&
                  projectId !== 'demo' &&
                  projectState === 'failed' && (
                    <button
                      onClick={async () => {
                        setRetrying(true);
                        try {
                          await retryValidation();
                        } finally {
                          setRetrying(false);
                        }
                      }}
                      disabled={retrying}
                      data-busy={retrying}
                    >
                      <RefreshCw />
                      Retry processing
                    </button>
                  )}
              </div>
            </>
          )}
          <p className="video-hint">
            Bro reads the spoken English in short videos and drafts the title,
            description, and Reel caption for you.
          </p>
        </section>
        <section className="post-editor">
          <header className="post-editor-header">
            <div>
              <strong>Post details</strong>
              <span>Review before publishing</span>
            </div>
            {drafting && <em>Drafting from transcript…</em>}
          </header>
          <div className="destination-card">
            <label className="destination-toggle">
              <span>
                <input
                  type="checkbox"
                  checked={youtubeEnabled}
                  disabled={connectionsLoaded && !providerReady('youtube')}
                  onChange={(event) => setYoutubeEnabled(event.target.checked)}
                />
                <b>YouTube Shorts</b>
              </span>
              <small>
                {providerReady('youtube') ? 'Connected' : 'Connect account'}
              </small>
            </label>
            {connectionsLoaded && !providerReady('youtube') && (
              <p className="connection-note">
                YouTube is not connected or needs attention.{' '}
                <a href="/onboarding?step=connections">Connect YouTube</a>
              </p>
            )}
            {youtubeEnabled && (
              <div className="post-fields">
                <label>
                  Title
                  <input
                    value={youtubeTitle}
                    maxLength={100}
                    onChange={(event) => setYoutubeTitle(event.target.value)}
                    placeholder="A clear title for your Short"
                  />
                  <small>{youtubeTitle.length}/100</small>
                </label>
                <label>
                  Description
                  <textarea
                    value={youtubeDescription}
                    onChange={(event) =>
                      setYoutubeDescription(event.target.value)
                    }
                    placeholder="Description, links, and hashtags"
                  />
                </label>
                <label>
                  Visibility
                  <select
                    value={youtubeVisibility}
                    onChange={(event) =>
                      setYoutubeVisibility(
                        event.target.value as 'public' | 'unlisted' | 'private'
                      )
                    }
                  >
                    <option value="unlisted">
                      Unlisted (recommended for testing)
                    </option>
                    <option value="private">Private</option>
                    <option value="public">Public</option>
                  </select>
                </label>
              </div>
            )}
          </div>
          <div className="destination-card">
            <label className="destination-toggle">
              <span>
                <input
                  type="checkbox"
                  checked={instagramEnabled}
                  disabled={connectionsLoaded && !providerReady('instagram')}
                  onChange={(event) =>
                    setInstagramEnabled(event.target.checked)
                  }
                />
                <b>Instagram Reels</b>
              </span>
              <small>
                {providerReady('instagram') ? 'Connected' : 'Connect account'}
              </small>
            </label>
            {connectionsLoaded && !providerReady('instagram') && (
              <p className="connection-note">
                Instagram is not connected or needs attention.{' '}
                <a href="/onboarding?step=connections">Connect Instagram</a>
              </p>
            )}
            {instagramEnabled && (
              <label className="post-fields">
                Caption
                <textarea
                  value={instagramCaption}
                  onChange={(event) => setInstagramCaption(event.target.value)}
                  placeholder="Caption and hashtags for your Reel"
                />
              </label>
            )}
          </div>
          <div className="post-editor-footer">
            <button
              className="primary-small"
              onClick={publishNow}
              disabled={
                !projectId ||
                projectState !== 'ready' ||
                drafting ||
                uploading ||
                publishing
              }
              data-busy={publishing}
            >
              Publish now
            </button>
            <small>
              Scheduling is available in Calendar. You can edit every field
              before publishing.
            </small>
          </div>
        </section>
      </div>
      {cues.length > 0 && (
        <section className="cue-editor">
          <header>
            <div>
              <strong>English captions</strong>
              <span>
                {captionedReady
                  ? 'Burned in — publishing will use this captioned version.'
                  : 'Auto-generated from the transcript. Edit the text below, then burn them into the video.'}
              </span>
            </div>
          </header>
          {cues.map((cue, i) => (
            <div className="cue" key={i}>
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
                <input value={cue.start.toFixed(1)} readOnly />
              </label>
              <label>
                End
                <input value={cue.end.toFixed(1)} readOnly />
              </label>
            </div>
          ))}
          <button
            className="primary-small"
            onClick={saveCaptions}
            disabled={savingCaptions}
            data-busy={savingCaptions}
          >
            <Save />
            Save captions
          </button>
          <button
            onClick={burnInCaptions}
            disabled={burningIn}
            data-busy={burningIn}
          >
            {captionedReady ? 'Re-burn captions' : 'Burn in captions'}
          </button>
          {captionsStatus && (
            <small className="cue-error">{captionsStatus}</small>
          )}
        </section>
      )}
    </Surface>
  );
}
function VerticalVideoGlyph() {
  return (
    <svg
      className="vertical-video-glyph"
      viewBox="0 0 64 96"
      fill="none"
      aria-hidden="true"
    >
      <rect
        x="4"
        y="2"
        width="56"
        height="92"
        rx="12"
        stroke="currentColor"
        strokeWidth="3"
      />
      <rect x="24" y="7" width="16" height="4" rx="2" fill="currentColor" />
      <circle
        cx="32"
        cy="50"
        r="17"
        stroke="currentColor"
        strokeWidth="3"
        opacity="0.5"
      />
      <path d="M27 41.5v17l15-8.5-15-8.5z" fill="currentColor" />
    </svg>
  );
}
const videoStateLabels: Record<string, string> = {
  queued: 'Queued',
  uploaded: 'Uploaded',
  validating: 'Validating',
  transcribing: 'Reading transcript',
  captions_ready: 'Captions ready',
  ready: 'Ready',
  failed: 'Needs attention',
};
function MyVideos() {
  type Project = {
    id: string;
    state: string;
    demo?: boolean;
    updatedAt?: string;
    metadata?: {
      filename?: string;
      aiMetadata?: VideoDraftMetadata;
      metadataNotice?: string;
    };
  };
  const [projects, setProjects] = useState<Project[]>([]),
    [previews, setPreviews] = useState<Record<string, string>>({}),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const response = await fetch('/api/videos?limit=50'),
        data = await response.json();
      if (cancelled) return;
      const list = Array.isArray(data) ? (data as Project[]) : [];
      setProjects(list);
      setLoading(false);
      if (list[0]?.demo) return;
      const entries = await Promise.all(
        list.map(async (project) => {
          const mediaResponse = await fetch(`/api/videos/${project.id}/media`),
            media = await mediaResponse.json();
          return [project.id, mediaResponse.ok ? media.url : ''] as const;
        })
      );
      if (!cancelled) setPreviews(Object.fromEntries(entries));
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  function scheduleThis(projectId: string) {
    sessionStorage.setItem(FOCUS_PROJECT_KEY, projectId);
    location.hash = 'Calendar';
  }
  return (
    <Surface
      title="My Videos"
      subtitle="Every upload, with the title, description, and caption Bro drafted for it."
    >
      {loading ? (
        <p>Loading your videos…</p>
      ) : projects.length === 0 ? (
        <div className="video-library-empty">
          <VerticalVideoGlyph />
          <p>
            No videos yet. Upload one in Upload and Bro will draft its post
            fields automatically.
          </p>
        </div>
      ) : (
        <div className="video-library">
          {projects.map((project) => {
            const draft = project.metadata?.aiMetadata,
              filename = project.metadata?.filename || project.id,
              preview = previews[project.id];
            return (
              <article key={project.id} className="video-card">
                <div className="video-card-thumb">
                  {preview ? (
                    <video src={preview} muted preload="metadata" />
                  ) : (
                    <VerticalVideoGlyph />
                  )}
                  <span
                    className={`video-card-state ${project.state === 'failed' ? 'error' : ''}`}
                  >
                    {videoStateLabels[project.state] || project.state}
                  </span>
                </div>
                <div className="video-card-body">
                  <strong className="video-card-title">
                    {draft?.title || filename}
                  </strong>
                  {draft ? (
                    <>
                      <p className="video-card-desc">{draft.description}</p>
                      <p className="video-card-caption">
                        <Instagram /> {draft.instagramCaption}
                      </p>
                    </>
                  ) : (
                    <p className="video-card-desc muted">
                      {project.metadata?.metadataNotice ||
                        'No draft yet. Bro drafts post fields automatically after a video validates.'}
                    </p>
                  )}
                </div>
                {project.state === 'ready' && (
                  <div className="video-card-actions">
                    <button onClick={() => scheduleThis(project.id)}>
                      <CalendarDays />
                      Schedule
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </Surface>
  );
}
function Calendar() {
  type Job = {
    id: string;
    scheduledAt: string;
    scheduledLocalDate?: string;
    state: string;
    destinations?: Array<{
      provider: string;
      state: string;
      url?: string | null;
      errorMessage?: string | null;
    }>;
  };
  type Project = {
    id: string;
    state: string;
    demo?: boolean;
    metadata?: {
      filename?: string;
      aiMetadata?: VideoDraftMetadata;
    };
  };
  const now = new Date(),
    initial = new Date(now.getTime() + 864e5);
  initial.setHours(19, 30, 0, 0);
  const [cursor, setCursor] = useState(
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
    [youtubeTitle, setYoutubeTitle] = useState(''),
    [youtubeDescription, setYoutubeDescription] = useState(''),
    [youtubeVisibility, setYoutubeVisibility] = useState<
      'public' | 'unlisted' | 'private'
    >('unlisted'),
    [instagramCaption, setInstagramCaption] = useState(''),
    [message, setMessage] = useState(''),
    [scheduling, setScheduling] = useState(false),
    prefilledProjectId = useRef('');
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
    const focusId = sessionStorage.getItem(FOCUS_PROJECT_KEY);
    if (focusId && ready.some((project) => project.id === focusId)) {
      sessionStorage.removeItem(FOCUS_PROJECT_KEY);
      setProjectId(focusId);
    } else setProjectId((value) => value || ready[0]?.id || '');
    if (profile.timeZone) setZone(profile.timeZone);
  }
  useEffect(() => {
    load();
  }, [cursor]);
  // Prefill from the video's already-generated bundle so a creator never
  // retypes a title/description/caption Bro drafted during upload. Only
  // runs once per project selection, so editing a field mid-session and
  // navigating months doesn't clobber it.
  useEffect(() => {
    if (!projectId || prefilledProjectId.current === projectId) return;
    const project = projects.find((item) => item.id === projectId);
    if (!project) return;
    prefilledProjectId.current = projectId;
    const draft = project.metadata?.aiMetadata;
    if (draft) {
      setYoutubeTitle(draft.title);
      setYoutubeDescription(draft.description);
      setInstagramCaption(draft.instagramCaption);
    }
  }, [projectId, projects]);
  async function schedule() {
    setScheduling(true);
    try {
      await scheduleJob();
    } finally {
      setScheduling(false);
    }
  }
  async function scheduleJob() {
    const providers = Object.entries(destinations)
      .filter(([, enabled]) => enabled)
      .map(([provider]) => provider);
    if (!projectId) {
      setMessage('Choose a validated, publish-ready video first.');
      return;
    }
    if (!providers.length) {
      setMessage('Choose at least one destination.');
      return;
    }
    if (destinations.youtube && !youtubeTitle.trim()) {
      setMessage('Add a YouTube title before scheduling.');
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
          metadata: {
            youtube: destinations.youtube
              ? {
                  title: youtubeTitle.trim(),
                  description: youtubeDescription.trim(),
                  visibility: youtubeVisibility,
                }
              : undefined,
            instagram: destinations.instagram
              ? { caption: instagramCaption.trim() }
              : undefined,
          },
        }),
      }),
      data = await response.json();
    if (data.requiresConfirmation) {
      if (!confirm(publishConfirmationText(data.card))) {
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
    if (!confirm('Cancel this scheduled post? This cannot be undone.')) return;
    const response = await fetch(`/api/publish/${jobId}`, { method: 'DELETE' }),
      data = await response.json();
    setMessage(response.ok ? 'Scheduled post cancelled.' : data.error);
    load();
  }
  const today = new Date(),
    todayKey = dateKey(today),
    monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1),
    daysInMonth = new Date(
      cursor.getFullYear(),
      cursor.getMonth() + 1,
      0
    ).getDate(),
    leadingBlanks = monthStart.getDay(),
    month = cursor.toLocaleString([], { month: 'long', year: 'numeric' }),
    jobsByDay = new Map<string, Job[]>();
  for (const job of jobs) {
    const key =
      job.scheduledLocalDate ||
      new Date(job.scheduledAt).toLocaleDateString('en-CA', { timeZone: zone });
    jobsByDay.set(key, [...(jobsByDay.get(key) || []), job]);
  }
  return (
    <Surface
      title="Calendar"
      subtitle={`Times shown in ${zone}. Bro stores execution times in UTC.`}
    >
      <div className="calendar-layout">
        <section className="calendar-panel">
          <div className="calendar-toolbar">
            <button
              aria-label="Previous month"
              onClick={() =>
                setCursor(
                  new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1)
                )
              }
            >
              <ChevronLeft />
            </button>
            <h3>{month}</h3>
            <button
              aria-label="Next month"
              onClick={() =>
                setCursor(
                  new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
                )
              }
            >
              <ChevronRight />
            </button>
            <button
              className="calendar-today"
              onClick={() =>
                setCursor(new Date(today.getFullYear(), today.getMonth(), 1))
              }
            >
              Today
            </button>
          </div>
          <div className="calendar-weekdays">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>
          <div className="calendar-grid">
            {[...Array(leadingBlanks)].map((_, i) => (
              <div key={`blank-${i}`} className="calendar-cell empty" />
            ))}
            {[...Array(daysInMonth)].map((_, i) => {
              const day = i + 1,
                key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
                dayJobs = jobsByDay.get(key) || [],
                isToday = key === todayKey,
                isPast = key < todayKey;
              return (
                <div
                  key={day}
                  role="button"
                  tabIndex={isPast ? -1 : 0}
                  aria-disabled={isPast}
                  aria-current={isToday ? 'date' : undefined}
                  className={[
                    'calendar-cell',
                    isToday ? 'today' : '',
                    isPast ? 'past' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => {
                    if (isPast) return;
                    const date = new Date(
                      cursor.getFullYear(),
                      cursor.getMonth(),
                      day,
                      19,
                      30
                    );
                    setSelected(localInput(date));
                  }}
                  onKeyDown={(event) => {
                    if (isPast) return;
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      const date = new Date(
                        cursor.getFullYear(),
                        cursor.getMonth(),
                        day,
                        19,
                        30
                      );
                      setSelected(localInput(date));
                    }
                  }}
                >
                  <span className="calendar-daynum">{day}</span>
                  <div className="calendar-jobs">
                    {dayJobs.slice(0, 2).map((job) => (
                      <button
                        key={job.id}
                        type="button"
                        className={`calendar-job ${jobStateClass(job.state)}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (job.state === 'scheduled') cancel(job.id);
                        }}
                        title={
                          job.state === 'scheduled'
                            ? 'Click to cancel this scheduled post'
                            : job.state
                        }
                      >
                        <span className="calendar-job-time">
                          {new Date(job.scheduledAt).toLocaleTimeString([], {
                            timeZone: zone,
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                        <span className="calendar-job-icons">
                          {(job.destinations || []).map((destination) => (
                            <i key={`${job.id}-${destination.provider}`}>
                              {destination.provider === 'youtube' ? (
                                <Youtube />
                              ) : (
                                <Instagram />
                              )}
                            </i>
                          ))}
                        </span>
                      </button>
                    ))}
                    {dayJobs.length > 2 && (
                      <span className="calendar-job-more">
                        +{dayJobs.length - 2} more
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
        <section className="post-editor calendar-schedule-card">
          <header className="post-editor-header">
            <div>
              <strong>Schedule a post</strong>
              <span>Pick a day on the calendar, or set a time below</span>
            </div>
          </header>
          <div className="post-fields">
            <label>
              Video
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
            </label>
            <label>
              <span className="calendar-slot-label">
                <CalendarDays /> Date &amp; time
              </span>
              <input
                type="datetime-local"
                value={selected}
                min={localInput(new Date())}
                onChange={(e) => setSelected(e.target.value)}
              />
            </label>
          </div>
          <div className="destination-card">
            <label className="destination-toggle">
              <span>
                <input
                  type="checkbox"
                  checked={destinations.youtube}
                  onChange={(e) =>
                    setDestinations({
                      ...destinations,
                      youtube: e.target.checked,
                    })
                  }
                />
                <b>YouTube Shorts</b>
              </span>
            </label>
            {destinations.youtube && (
              <div className="post-fields">
                <label>
                  Title
                  <input
                    value={youtubeTitle}
                    maxLength={100}
                    onChange={(event) => setYoutubeTitle(event.target.value)}
                    placeholder="Title for your Short"
                  />
                  <small>{youtubeTitle.length}/100</small>
                </label>
                <label>
                  Description
                  <textarea
                    value={youtubeDescription}
                    onChange={(event) =>
                      setYoutubeDescription(event.target.value)
                    }
                    placeholder="Description and hashtags"
                  />
                </label>
                <label>
                  Visibility
                  <select
                    value={youtubeVisibility}
                    onChange={(event) =>
                      setYoutubeVisibility(
                        event.target.value as 'public' | 'unlisted' | 'private'
                      )
                    }
                  >
                    <option value="unlisted">
                      Unlisted (recommended for testing)
                    </option>
                    <option value="private">Private</option>
                    <option value="public">Public</option>
                  </select>
                </label>
              </div>
            )}
          </div>
          <div className="destination-card">
            <label className="destination-toggle">
              <span>
                <input
                  type="checkbox"
                  checked={destinations.instagram}
                  onChange={(e) =>
                    setDestinations({
                      ...destinations,
                      instagram: e.target.checked,
                    })
                  }
                />
                <b>Instagram Reels</b>
              </span>
            </label>
            {destinations.instagram && (
              <label className="post-fields">
                Caption
                <textarea
                  value={instagramCaption}
                  onChange={(event) => setInstagramCaption(event.target.value)}
                  placeholder="Caption and hashtags"
                />
              </label>
            )}
          </div>
          <div className="post-editor-footer">
            <button
              className="primary-small"
              onClick={schedule}
              disabled={scheduling}
              data-busy={scheduling}
            >
              Review schedule
            </button>
            {message && <small>{message}</small>}
          </div>
        </section>
      </div>
    </Surface>
  );
}
function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function jobStateClass(state: string) {
  if (state.startsWith('published')) return 'is-published';
  if (state.startsWith('failed')) return 'is-failed';
  if (state.startsWith('processing') || state.startsWith('uploading'))
    return 'is-processing';
  return 'is-scheduled';
}
function localInput(date: Date) {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16);
}
function publishConfirmationText(card: {
  mediaName: string;
  providers: string[];
  title?: string;
  caption?: string;
  scheduledAt?: string;
  timeZone: string;
  visibility?: string;
}) {
  return [
    'Review this externally visible publish:',
    `Media: ${card.mediaName}`,
    `Destinations: ${card.providers.join(' + ')}`,
    card.title ? `YouTube title: ${card.title}` : undefined,
    card.caption ? `Description/caption: ${card.caption}` : undefined,
    card.visibility ? `YouTube visibility: ${card.visibility}` : undefined,
    `When: ${card.scheduledAt || 'Publish now'} (${card.timeZone})`,
    '',
    'Create this publish job?',
  ]
    .filter((line): line is string => Boolean(line))
    .join('\n');
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
    [message, setMessage] = useState(''),
    { isBusy, run } = useBusy();
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
    await run('sync', syncComments);
  }
  async function syncComments() {
    const providers =
      platform === 'all' ? ['youtube', 'instagram'] : [platform];
    const response = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'sync', platforms: providers }),
      }),
      data = await response.json();
    if (!response.ok) {
      setMessage(data.error);
      return;
    }
    if (!data.bossJobId) {
      setMessage(data.message || 'Comment sync queued.');
      return;
    }
    setMessage('Syncing comments from owned posts…');
    for (let attempt = 0; attempt < 30; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const statusResponse = await fetch(
          `/api/sync/content/status?kind=sync-comments&bossJobId=${encodeURIComponent(data.bossJobId)}`
        ),
        statusData = await statusResponse.json();
      if (!statusResponse.ok) {
        setMessage(statusData.error || 'Comment sync status is unavailable.');
        return;
      }
      if (statusData.state === 'completed') {
        setMessage('Comment sync completed.');
        await refreshList();
        return;
      }
      if (
        statusData.state === 'failed_retryable' ||
        statusData.state === 'failed_permanent'
      ) {
        setMessage(
          statusData.lastErrorMessage ||
            'Comment sync failed. Reconnect and try again.'
        );
        return;
      }
    }
    setMessage('Comment sync is still running. Refresh later.');
  }
  async function analyze() {
    await run('analyze', analyzeComments);
  }
  async function analyzeComments() {
    const filters: {
      platforms?: string[];
      from?: string;
      to?: string;
      keyword?: string;
    } = {};
    if (platform !== 'all') filters.platforms = [platform];
    if (keyword) filters.keyword = keyword;
    if (date) {
      const start = new Date(`${date}T00:00:00`);
      filters.from = start.toISOString();
      filters.to = new Date(start.getTime() + 86400e3 - 1).toISOString();
    }
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
        <button
          onClick={sync}
          disabled={isBusy('sync')}
          data-busy={isBusy('sync')}
        >
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
        <button
          onClick={analyze}
          disabled={isBusy('analyze')}
          data-busy={isBusy('analyze')}
        >
          Analyze selected comments
        </button>
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
    lastError?: string;
    needsReauthorization?: boolean;
    lastSyncAt?: string;
    demo?: boolean;
  };
  const [connections, setConnections] = useState<Connection[]>([]),
    [message, setMessage] = useState(''),
    { isBusy, run } = useBusy();
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
    await run(`disconnect-${provider}`, () => disconnectProvider(provider));
  }
  async function disconnectProvider(provider: Connection['provider']) {
    const response = await fetch('/api/connections', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider }),
      }),
      data = await response.json();
    setMessage(response.ok ? `${provider} disconnected.` : data.error);
    load();
  }
  async function syncConnection(provider: Connection['provider']) {
    await run(`sync-${provider}`, () => syncProviderContent(provider));
  }
  async function syncProviderContent(provider: Connection['provider']) {
    const response = await fetch('/api/sync/content', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ providers: [provider] }),
      }),
      data = await response.json();
    if (!response.ok) {
      setMessage(data.error);
      return;
    }
    if (!data.bossJobId) {
      setMessage(`${provider} content sync queued.`);
      return;
    }
    setMessage(`${provider} content sync queued…`);
    for (let attempt = 0; attempt < 30; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const statusResponse = await fetch(
        `/api/sync/content/status?bossJobId=${encodeURIComponent(data.bossJobId)}`
      );
      const statusData = await statusResponse.json();
      if (!statusResponse.ok) {
        setMessage(
          statusData.error || `${provider} sync status is unavailable.`
        );
        return;
      }
      if (statusData.state === 'completed') {
        setMessage(`${provider} content sync completed.`);
        await load();
        return;
      }
      if (
        statusData.state === 'failed_retryable' ||
        statusData.state === 'failed_permanent'
      ) {
        setMessage(
          statusData.lastErrorMessage ||
            `${provider} content sync failed. Reconnect and try again.`
        );
        await load();
        return;
      }
      setMessage(
        `${provider} content sync ${statusData.state || 'processing'}…`
      );
    }
    setMessage(`${provider} content sync is still running. Refresh later.`);
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
              : connection?.needsReauthorization
                ? 'Reconnect required'
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
                {connection?.lastError && <small>{connection.lastError}</small>}
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
                      onClick={() => syncConnection(provider)}
                      disabled={isBusy(`sync-${provider}`)}
                      data-busy={isBusy(`sync-${provider}`)}
                    >
                      Sync now
                      <RefreshCw />
                    </button>
                    <button
                      onClick={() =>
                        (location.href = `/api/oauth/${provider}/start`)
                      }
                    >
                      Reconnect
                      <ExternalLink />
                    </button>
                    <button
                      onClick={() => disconnect(provider)}
                      disabled={isBusy(`disconnect-${provider}`)}
                      data-busy={isBusy(`disconnect-${provider}`)}
                    >
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
  type Check = {
    key: string;
    label: string;
    status: 'ready' | 'missing' | 'optional';
    detail: string;
  };
  const [values, setValues] = useState({ youtube: false, instagram: false }),
    [checks, setChecks] = useState<Check[]>([]),
    [message, setMessage] = useState(''),
    { isBusy, run } = useBusy();
  useEffect(() => {
    fetch('/api/settings/auto-publish')
      .then((r) => r.json())
      .then((d) =>
        setValues({ youtube: !!d.youtube, instagram: !!d.instagram })
      );
    fetch('/api/system/status')
      .then((r) => r.json())
      .then((d) => setChecks(Array.isArray(d.checks) ? d.checks : []));
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
    await run('delete-account', deleteAccountData);
  }
  async function deleteAccountData() {
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
  async function signOut() {
    await run('sign-out', signOutSession);
  }
  async function signOutSession() {
    const response = await fetch('/api/auth/signout', { method: 'POST' }),
      data = await response.json();
    if (response.ok) location.href = '/login';
    else setMessage(data.error || 'Could not sign out.');
  }
  return (
    <Surface
      title="Settings"
      subtitle="Publishing remains creator-controlled and defaults to confirmation."
    >
      <section className="settings-section">
        <h3>System readiness</h3>
        <p>
          These checks expose configuration state only; credentials and tokens
          are never shown in the browser.
        </p>
        <div className="system-checks">
          {checks.map((check) => (
            <div className="system-check" key={check.key}>
              <span
                className={
                  check.status === 'ready'
                    ? 'system-check-dot ready'
                    : 'system-check-dot missing'
                }
              />
              <div>
                <strong>{check.label}</strong>
                <small>{check.detail}</small>
              </div>
              <em>{check.status === 'ready' ? 'Ready' : 'Setup needed'}</em>
            </div>
          ))}
        </div>
      </section>
      <section className="settings-section">
        <h3>Auto-publish</h3>
        <p>
          Enabling a destination requires explicit confirmation. Specific chat
          commands can then act without another confirmation.
        </p>
        <Toggle
          name="YouTube"
          value={values.youtube}
          busy={isBusy('toggle-youtube')}
          set={(v) => run('toggle-youtube', () => change('youtube', v))}
        />
        <Toggle
          name="Instagram"
          value={values.instagram}
          busy={isBusy('toggle-instagram')}
          set={(v) => run('toggle-instagram', () => change('instagram', v))}
        />
        {message && <small>{message}</small>}
      </section>
      <section className="settings-section">
        <h3>Session</h3>
        <button
          onClick={signOut}
          disabled={isBusy('sign-out')}
          data-busy={isBusy('sign-out')}
        >
          Sign out of Bro
        </button>
      </section>
      <section className="settings-section">
        <h3>Privacy</h3>
        <button
          onClick={deleteAccount}
          disabled={isBusy('delete-account')}
          data-busy={isBusy('delete-account')}
        >
          Delete account and data
        </button>
        <a href="/privacy">Read privacy notice</a>
      </section>
    </Surface>
  );
}
function Toggle({
  name,
  value,
  busy,
  set,
}: {
  name: string;
  value: boolean;
  busy?: boolean;
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
        disabled={busy}
        data-busy={busy}
      >
        <i />
      </button>
    </div>
  );
}
function BroChat({
  messages,
  busy,
}: {
  messages: ChatMessage[];
  busy: boolean;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages.length, busy]);
  return (
    <Surface
      title="Bro Chat"
      subtitle="Typed and recorded English commands invoke validated application tools."
    >
      <div className="chat-panel" role="log" aria-live="polite">
        {!messages.length && !busy ? (
          <div className="chat-empty">
            <h3>What should we make next?</h3>
            <p>
              Ask Bro to find evidence-backed topics, write a short script, or
              check your connected accounts. Use the composer below to start.
            </p>
            <div className="chat-rules">
              <span>
                <Check /> Missing information is requested instead of guessed.
              </span>
              <span>
                <Check /> Publishing obeys destination-specific confirmation
                settings.
              </span>
            </div>
          </div>
        ) : (
          messages.map((message) => (
            <article
              className={`chat-message ${message.role}`}
              key={message.id}
            >
              <span className="chat-author">
                {message.role === 'user' ? 'You' : 'Bro'}
              </span>
              <p>{message.content}</p>
            </article>
          ))
        )}
        {busy && (
          <article className="chat-message assistant pending">
            <span className="chat-author">Bro</span>
            <p>Working on that…</p>
          </article>
        )}
        <div ref={endRef} />
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
