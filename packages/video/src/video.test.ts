import { describe, it, expect } from 'vitest';
import {
  segmentCaptions,
  validateCues,
  renderArgs,
  splitCue,
  mergeCues,
  sanitizeUploadFilename,
  validateUpload,
  parseFfprobe,
  captionsToAss,
  detectedVideoMime,
  needsPublishNormalization,
  normalizeVideoArgs,
} from './index';
describe('captions', () => {
  it('segments punctuation', () =>
    expect(
      segmentCaptions([
        { text: 'Hello', start: 0, end: 0.3 },
        { text: 'world.', start: 0.4, end: 0.8 },
        { text: 'Again', start: 1, end: 1.4 },
      ])
    ).toHaveLength(2));
  it('rejects overlap', () =>
    expect(() =>
      validateCues([
        { text: 'a', start: 0, end: 2 },
        { text: 'b', start: 1, end: 3 },
      ])
    ).toThrow());
  it('clamps overlapping ASR word timestamps into valid, non-overlapping cues', () => {
    const cues = segmentCaptions([
      { text: 'Hello', start: 0, end: 1 },
      { text: 'world.', start: 0.8, end: 1.6 },
      // Whisper-style overlap: this word's start lands before the
      // previous cue's end.
      { text: 'Again', start: 1.4, end: 2.4 },
      { text: 'now.', start: 2.6, end: 3 },
    ]);
    expect(() => validateCues(cues)).not.toThrow();
    for (let i = 1; i < cues.length; i++)
      expect(cues[i]!.start).toBeGreaterThanOrEqual(cues[i - 1]!.end);
  });
  it('splits and merges cues', () => {
    const split = splitCue(
      [{ text: 'hello creator world', start: 0, end: 3 }],
      0,
      1.5
    );
    expect(split).toHaveLength(2);
    expect(mergeCues(split, 0)).toEqual([
      { text: 'hello creator world', start: 0, end: 3 },
    ]);
  });
  it('constructs args without shell', () =>
    expect(renderArgs('in.mp4', 'cap.ass', 'out.mp4')).toContain('libx264'));
});
describe('uploads', () => {
  it('sanitizes malicious filenames', () =>
    expect(sanitizeUploadFilename('../../my <video>;$(x).mp4')).toBe(
      '..-..-my-video-x-.mp4'
    ));
  it('rejects spoofed content', () =>
    expect(() =>
      validateUpload({
        filename: 'clip.mp4',
        declaredMime: 'video/mp4',
        detectedMime: 'application/pdf',
        size: 10,
        duration: 5,
      })
    ).toThrow(/Unsupported/));
  it('parses probe metadata', () =>
    expect(
      parseFfprobe({
        format: { duration: '12.4' },
        streams: [
          {
            codec_type: 'video',
            codec_name: 'h264',
            width: 1080,
            height: 1920,
          },
          { codec_type: 'audio', codec_name: 'aac' },
        ],
      })
    ).toMatchObject({ duration: 12.4, width: 1080, height: 1920 }));
  it('detects supported containers from ffprobe format names', () => {
    expect(detectedVideoMime('mov,mp4,m4a,3gp,3g2,mj2')).toBe('video/mp4');
    expect(detectedVideoMime('matroska,webm')).toBe('video/webm');
    expect(detectedVideoMime('pdf')).toBe('application/octet-stream');
  });
  it('normalizes non-MP4 or non-H.264/AAC uploads for publishing', () => {
    expect(
      needsPublishNormalization({
        formatName: 'mov,mp4,m4a,3gp,3g2,mj2',
        videoCodec: 'h264',
        audioCodec: 'aac',
        audioSampleRate: 48000,
      })
    ).toBe(false);
    expect(
      needsPublishNormalization({
        formatName: 'matroska,webm',
        videoCodec: 'vp9',
        audioCodec: 'opus',
        audioSampleRate: 48000,
      })
    ).toBe(true);
    expect(
      needsPublishNormalization({
        formatName: 'mov,mp4,m4a,3gp,3g2,mj2',
        videoCodec: 'h264',
        audioCodec: 'aac',
        audioSampleRate: 44100,
      })
    ).toBe(true);
    expect(normalizeVideoArgs('input.webm', 'publishable.mp4')).toEqual(
      expect.arrayContaining([
        'libx264',
        'aac',
        '48000',
        'yuv420p',
        'publishable.mp4',
      ])
    );
  });
});
describe('render artifacts', () => {
  it('creates valid ASS dialogue', () =>
    expect(
      captionsToAss([{ text: 'Hello {creator}', start: 0, end: 1.25 }])
    ).toContain('Dialogue: 0,0:00:00.00,0:00:01.25'));
});
