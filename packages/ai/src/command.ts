export type ResolvedCommand =
  { tool: string; arguments: Record<string, unknown> } | { followUp: string };

// Deterministic development router. Production uses the same validated tools
// through Responses API function calling; this fallback keeps demo mode useful
// without representing keyword parsing as an LLM response.
export function resolveDemoCommand(text: string): ResolvedCommand {
  const value = text.trim();
  const lower = value.toLowerCase();
  if (/find.*niche|analy[sz]e.*accounts/.test(lower))
    return { tool: 'infer_creator_niche', arguments: { force: false } };
  if (/write|script/.test(lower)) {
    const duration = Number(lower.match(/(15|30|45|60)[ -]?second/)?.[1]);
    const topicNumber = Number(lower.match(/topic\s+(\d+)/)?.[1]);
    if (!duration)
      return {
        followUp: 'How long should the short be—15, 30, 45, or 60 seconds?',
      };
    if (!topicNumber)
      return {
        followUp: 'Which topic should I use? Give me its topic number.',
      };
    return {
      tool: 'generate_short_script',
      arguments: {
        topicId: `20000000-0000-4000-8000-00000000000${topicNumber}`,
        durationSeconds: duration,
        platforms: ['youtube', 'instagram'],
        angle: lower.includes('contrarian')
          ? 'Use a contrarian hook and then demonstrate the practical fix.'
          : undefined,
      },
    };
  }
  if (/trending|topic|ideas?/.test(lower)) {
    const count = Number(
      lower
        .match(/\b(5|6|7|8|9|10|five|six|seven|eight|nine|ten)\b/)?.[1]
        ?.replace('five', '5')
        .replace('six', '6')
        .replace('seven', '7')
        .replace('eight', '8')
        .replace('nine', '9')
        .replace('ten', '10') || 5
    );
    return {
      tool: 'discover_topic_opportunities',
      arguments: { count, countryCode: 'IN' },
    };
  }
  if (/captions?|transcrib/.test(lower)) {
    if (!/latest|this|uploaded/.test(lower))
      return {
        followUp:
          'Which uploaded video should I transcribe for editable captions?',
      };
    return {
      tool: 'transcribe_video_for_captions',
      arguments: { projectId: '30000000-0000-4000-8000-000000000001' },
    };
  }
  if (/cancel/.test(lower))
    return {
      followUp:
        'Which scheduled post should I cancel? You can provide its title or job ID.',
    };
  if (/schedule/.test(lower)) {
    if (!/(youtube|instagram)/.test(lower))
      return {
        followUp:
          'Which destinations should I schedule: YouTube, Instagram, or both?',
      };
    if (!/\b(am|pm)\b/.test(lower))
      return {
        followUp:
          'What local date and time should I use? Your saved time zone is Asia/Kolkata.',
      };
    return { followUp: 'Which uploaded video should I schedule?' };
  }
  if (/publish/.test(lower)) {
    if (!/(youtube|instagram)/.test(lower))
      return {
        followUp:
          'Which destination should I publish to: YouTube, Instagram, or both?',
      };
    return { followUp: 'Which uploaded video should I publish?' };
  }
  if (/comments?/.test(lower))
    return { tool: 'analyze_comments', arguments: { question: value } };
  return {
    followUp:
      'I can find your niche, discover topic opportunities, write a short script, upload and publish a video, schedule posts, and analyze comments. What would you like to do?',
  };
}
