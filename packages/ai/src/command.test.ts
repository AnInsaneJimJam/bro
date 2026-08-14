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
  it('explains that subtitle editing is deferred', () =>
    expect(
      resolveDemoCommand('Create captions for my latest uploaded video')
    ).toEqual({
      followUp:
        'Subtitle editing is not enabled yet. Upload and publish the original video now; caption tools are planned for a later update.',
    }));
  it('does not mistake cancellation for a new schedule', () =>
    expect(resolveDemoCommand("Cancel tomorrow's scheduled post")).toEqual({
      followUp:
        'Which scheduled post should I cancel? You can provide its title or job ID.',
    }));
});
