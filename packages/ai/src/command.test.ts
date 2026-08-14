import { describe, expect, it } from 'vitest';
import { resolveDemoCommand } from './command';
describe('command resolution', () => {
  it('asks for duration', () =>
    expect(resolveDemoCommand('Write a script for topic 2')).toEqual({
      followUp: 'How long should the short be—15, 30, 45, or 60 seconds?',
    }));
  it('resolves a specific script command', () =>
    expect(
      resolveDemoCommand(
        'Write a 45-second script for topic 2 with a contrarian hook'
      )
    ).toMatchObject({
      tool: 'generate_short_script',
      arguments: { durationSeconds: 45 },
    }));
  it('does not guess a publish video', () =>
    expect(resolveDemoCommand('Publish to Instagram now')).toEqual({
      followUp: 'Which uploaded video should I publish?',
    }));
  it('routes an explicit latest-video caption request', () =>
    expect(
      resolveDemoCommand('Create captions for my latest uploaded video')
    ).toEqual({
      tool: 'transcribe_video_for_captions',
      arguments: { projectId: '30000000-0000-4000-8000-000000000001' },
    }));
  it('does not mistake cancellation for a new schedule', () =>
    expect(resolveDemoCommand("Cancel tomorrow's scheduled post")).toEqual({
      followUp:
        'Which scheduled post should I cancel? You can provide its title or job ID.',
    }));
});
