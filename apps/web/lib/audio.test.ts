import { describe, expect, it } from 'vitest';
import { validateCommandAudio } from './audio';

describe('audio command validation', () => {
  it('accepts MediaRecorder codec parameters', () =>
    expect(
      validateCommandAudio({ type: 'audio/webm;codecs=opus', size: 1024 })
    ).toBe('audio/webm'));

  it('rejects unsupported and oversized recordings', () => {
    expect(() =>
      validateCommandAudio({ type: 'application/octet-stream', size: 1 })
    ).toThrow(/Unsupported/);
    expect(() =>
      validateCommandAudio({ type: 'audio/webm', size: 26 * 1024 * 1024 })
    ).toThrow(/25 MB/);
  });
});
