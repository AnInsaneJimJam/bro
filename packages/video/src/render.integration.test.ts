import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import {
  captionsToAss,
  normalizeVideoArgs,
  probeVideo,
  renderArgs,
  runFfmpeg,
} from './index';

const execute = promisify(execFile);
describe('FFmpeg rendering integration', () => {
  it('burns captions into a playable vertical H.264/AAC MP4', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'bro-render-test-'));
    try {
      const input = join(dir, 'input.mp4'),
        ass = join(dir, 'captions.ass'),
        output = join(dir, 'output.mp4');
      await execute('ffmpeg', [
        '-y',
        '-f',
        'lavfi',
        '-i',
        'color=c=0x202020:s=360x640:d=1.5',
        '-f',
        'lavfi',
        '-i',
        'anullsrc=r=44100:cl=stereo',
        '-shortest',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        input,
      ]);
      await writeFile(
        ass,
        captionsToAss([{ text: 'Bro captions work', start: 0, end: 1.2 }])
      );
      await runFfmpeg(renderArgs(input, ass, output));
      const metadata = await probeVideo(output),
        bytes = await readFile(output);
      expect(metadata).toMatchObject({
        width: 360,
        height: 640,
        videoCodec: 'h264',
        audioCodec: 'aac',
        audioSampleRate: 48000,
      });
      expect(metadata.duration).toBeGreaterThan(1);
      expect(bytes.length).toBeGreaterThan(1000);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 30_000);
  it('normalizes a WebM upload into a publishable H.264/AAC MP4', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'bro-normalize-test-'));
    try {
      const input = join(dir, 'input.webm'),
        output = join(dir, 'publishable.mp4');
      await execute('ffmpeg', [
        '-y',
        '-f',
        'lavfi',
        '-i',
        'color=c=0x202020:s=360x640:d=1.5',
        '-f',
        'lavfi',
        '-i',
        'anullsrc=r=44100:cl=stereo',
        '-shortest',
        '-c:v',
        'libvpx-vp9',
        '-c:a',
        'libopus',
        input,
      ]);
      await runFfmpeg(normalizeVideoArgs(input, output));
      const metadata = await probeVideo(output);
      expect(metadata).toMatchObject({
        videoCodec: 'h264',
        audioCodec: 'aac',
        audioSampleRate: 48000,
      });
      expect(metadata.formatName.split(',')).toContain('mp4');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 30_000);
});
