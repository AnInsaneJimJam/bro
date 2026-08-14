import { isDeferredVideoEditingTool, type ToolName } from '@bro/ai';

export async function executeToolThroughOwnedRoutes(
  request: Request,
  name: ToolName,
  args: Record<string, unknown>
) {
  if (isDeferredVideoEditingTool(name))
    return {
      status: 'unavailable',
      code: 'SUBTITLE_FEATURE_DEFERRED',
      message:
        'Subtitle editing is not enabled in this MVP yet. Upload and publish the original video instead.',
    };
  const routes: Partial<
    Record<
      ToolName,
      {
        path: string | ((a: Record<string, unknown>) => string);
        method?: string;
        body?: (a: Record<string, unknown>) => unknown;
      }
    >
  > = {
    get_creator_profile: { path: '/api/profile' },
    get_connection_status: { path: '/api/connections' },
    sync_creator_content: {
      path: '/api/sync/content',
      method: 'POST',
      body: (a) => ({
        providers: a.providers || ['youtube', 'instagram', 'reddit'],
      }),
    },
    infer_creator_niche: {
      path: '/api/niche',
      method: 'POST',
      body: () => ({ action: 'infer' }),
    },
    confirm_creator_niche: {
      path: '/api/niche',
      method: 'POST',
      body: (a) => ({
        action: 'confirm',
        id: a.nicheVersionId,
        label: a.label,
        subNiches: a.subNiches,
      }),
    },
    discover_topic_opportunities: {
      path: '/api/opportunities',
      method: 'POST',
      body: (a) => ({ count: a.count, countryCode: a.countryCode }),
    },
    generate_short_script: {
      path: '/api/scripts',
      method: 'POST',
      body: (a) => ({
        topicId: a.topicId,
        duration: a.durationSeconds,
        platforms: a.platforms,
        angle: a.angle,
      }),
    },
    list_scripts: { path: '/api/scripts' },
    create_video_project: {
      path: '/api/videos',
      method: 'POST',
      body: (a) => a,
    },
    list_video_projects: { path: (a) => `/api/videos?limit=${a.limit || 20}` },
    transcribe_video_for_captions: {
      path: (a) => `/api/videos/${a.projectId}/transcribe`,
      method: 'POST',
    },
    render_captioned_video: {
      path: (a) => `/api/videos/${a.projectId}/render`,
      method: 'POST',
    },
    publish_video_now: {
      path: '/api/publish',
      method: 'POST',
      body: (a) => ({
        projectId: a.projectId,
        providers: a.platforms,
        mode: 'now',
        metadata: a.metadata,
      }),
    },
    schedule_video_publish: {
      path: '/api/publish',
      method: 'POST',
      body: (a) => ({
        projectId: a.projectId,
        providers: a.platforms,
        mode: 'schedule',
        localDateTime: a.localDateTime,
        timeZone: a.timeZone,
        metadata: a.metadata,
      }),
    },
    list_publish_jobs: {
      path: (a) =>
        `/api/publish?${new URLSearchParams(Object.entries({ from: a.from, to: a.to }).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))}`,
    },
    reschedule_publish_job: {
      path: (a) => `/api/publish/${a.jobId}`,
      method: 'PATCH',
      body: (a) => ({ localDateTime: a.localDateTime, timeZone: a.timeZone }),
    },
    cancel_publish_job: {
      path: (a) => `/api/publish/${a.jobId}`,
      method: 'DELETE',
    },
    sync_comments: {
      path: '/api/comments',
      method: 'POST',
      body: (a) => ({
        action: 'sync',
        platforms: a.platforms || ['youtube', 'instagram'],
      }),
    },
    analyze_comments: {
      path: '/api/comments',
      method: 'POST',
      body: (a) => ({
        action: 'analyze',
        question: a.question,
        filters: {
          platforms: a.platforms,
          postIds: a.postIds,
          from: a.from,
          to: a.to,
        },
      }),
    },
  };
  const route = routes[name];
  if (!route)
    throw Object.assign(
      new Error(
        `${name} requires a dedicated publishing or transcription confirmation flow.`
      ),
      { status: 409 }
    );
  const path = typeof route.path === 'function' ? route.path(args) : route.path,
    headers = new Headers({ accept: 'application/json' }),
    cookie = request.headers.get('cookie');
  if (cookie) headers.set('cookie', cookie);
  if (route.body) headers.set('content-type', 'application/json');
  const response = await fetch(new URL(path, request.url), {
    method: route.method || 'GET',
    headers,
    body: route.body ? JSON.stringify(route.body(args)) : undefined,
  });
  const result = await response.json();
  if (!response.ok)
    throw Object.assign(new Error(result.error || `${name} failed`), {
      status: response.status,
      details: result,
    });
  return result;
}
