import { demoStore } from './demo-store';
export async function executeDemoTool(
  name: string,
  args: Record<string, unknown>
) {
  switch (name) {
    case 'get_creator_profile':
      return demoStore.getProfile();
    case 'get_connection_status':
      return [
        { provider: 'youtube', status: 'healthy' },
        { provider: 'instagram', status: 'healthy' },
        { provider: 'reddit', status: 'healthy', demo: true },
      ];
    case 'infer_creator_niche':
      return demoStore.inferNiche();
    case 'discover_topic_opportunities':
      return demoStore.opportunities(Number(args.count || 5));
    case 'generate_short_script':
      return demoStore.generateScript(
        String(args.topicId),
        Number(args.durationSeconds),
        typeof args.angle === 'string' ? args.angle : undefined
      );
    case 'list_scripts':
      return demoStore.listScripts();
    case 'transcribe_video_for_captions':
      return {
        projectId: args.projectId,
        state: 'captions_ready',
        cueCount: 2,
        demo: true,
        notice:
          'Loaded the labeled sample transcript. No synthetic transcription was presented as a live job.',
      };
    case 'analyze_comments':
      return {
        sampleSize: 12,
        lastSyncedAt: new Date().toISOString(),
        summary:
          'Viewers like the practical demonstrations but want a clearer explanation of where AI memory is stored.',
        themes: ['privacy', 'setup steps', 'tool cost'],
        representativeComments: [
          {
            commentId: 'demo-comment-2',
            excerpt: 'Where does it store the memory?',
            postId: 'demo-post-1',
          },
        ],
        classificationNotice:
          'Sentiment is an approximate model classification.',
        demo: true,
      };
    default:
      return { status: 'not_implemented_in_demo', tool: name };
  }
}
