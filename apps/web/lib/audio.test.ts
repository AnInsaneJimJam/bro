import { describe, expect, it } from 'vitest';
import { encodeWav, validateCommandAudio } from './audio';

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

it('encodes mono PCM samples as a valid WAV header', () => {
  const wav = encodeWav([new Float32Array([-1, 0, 1])], 8000),
    view = new DataView(wav);
  expect(new TextDecoder().decode(new Uint8Array(wav.slice(0, 4)))).toBe(
    'RIFF'
  );
  expect(new TextDecoder().decode(new Uint8Array(wav.slice(8, 12)))).toBe(
    'WAVE'
  );
  expect(view.getUint16(22, true)).toBe(1);
  expect(view.getUint32(24, true)).toBe(8000);
  expect(view.getUint32(40, true)).toBe(6);
});
