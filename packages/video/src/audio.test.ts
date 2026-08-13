import { describe, expect, it } from 'vitest';
import { audioExtractionArgs } from './audio';
describe('audio extraction', () => {
  it('creates mono 16k compressed audio without shell interpolation', () =>
    expect(audioExtractionArgs('input file.mp4', 'audio.mp3')).toEqual([
      '-y',
      '-i',
      'input file.mp4',
      '-vn',
      '-ac',
      '1',
      '-ar',
      '16000',
      '-c:a',
      'libmp3lame',
      '-b:a',
      '64k',
      'audio.mp3',
    ]));
});
