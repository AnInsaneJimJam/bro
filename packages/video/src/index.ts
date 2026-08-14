import { spawn } from 'node:child_process';
export * from './audio';
export type TimedWord = {
  text: string;
  start: number;
  end: number;
  confidence?: number;
};
export type CaptionCue = { text: string; start: number; end: number };
export function segmentCaptions(
  words: TimedWord[],
  maxChars = 36,
  maxDuration = 2.8
): CaptionCue[] {
  const cues: CaptionCue[] = [];
  let current: TimedWord[] = [];
  for (const word of words) {
    const next = [...current, word],
      text = next.map((w) => w.text).join(' ');
    const duration = (next.at(-1)?.end ?? 0) - (next[0]?.start ?? 0);
    if (current.length && (text.length > maxChars || duration > maxDuration)) {
      cues.push(toCue(current));
      current = [word];
    } else current = next;
    if (/[.!?]$/.test(word.text) && current.length) {
      cues.push(toCue(current));
      current = [];
    }
  }
  if (current.length) cues.push(toCue(current));
  return cues;
}
function toCue(words: TimedWord[]): CaptionCue {
  return {
    text: words.map((w) => w.text).join(' '),
    start: words[0]!.start,
    end: words.at(-1)!.end,
  };
}
export function validateCues(cues: CaptionCue[]) {
  for (let i = 0; i < cues.length; i++) {
    const cue = cues[i]!;
    if (cue.start < 0 || cue.end <= cue.start)
      throw new Error(`Invalid cue ${i}`);
    if (i && cue.start < cues[i - 1]!.end)
      throw new Error(`Overlapping cue ${i}`);
  }
}
export function splitCue(
  cues: CaptionCue[],
  index: number,
  at: number
): CaptionCue[] {
  const cue = cues[index];
  if (!cue) throw new Error('Cue not found');
  if (at <= cue.start || at >= cue.end)
    throw new Error('Split must be inside the cue');
  const words = cue.text.trim().split(/\s+/);
  if (words.length < 2)
    throw new Error('Cue needs at least two words to split');
  const pivot = Math.ceil(words.length / 2);
  const next = [
    ...cues.slice(0, index),
    { text: words.slice(0, pivot).join(' '), start: cue.start, end: at },
    { text: words.slice(pivot).join(' '), start: at, end: cue.end },
    ...cues.slice(index + 1),
  ];
  validateCues(next);
  return next;
}
export function mergeCues(cues: CaptionCue[], index: number): CaptionCue[] {
  const first = cues[index],
    second = cues[index + 1];
  if (!first || !second) throw new Error('Two adjacent cues are required');
  const next = [
    ...cues.slice(0, index),
    {
      text: `${first.text} ${second.text}`.trim(),
      start: first.start,
      end: second.end,
    },
    ...cues.slice(index + 2),
  ];
  validateCues(next);
  return next;
}
export const allowedVideoMimeTypes = new Set([
  'video/mp4',
  'video/quicktime',
  'video/webm',
]);
export function sanitizeUploadFilename(name: string) {
  const base = name
    .normalize('NFKC')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
  if (!base || base === '.' || base === '..')
    throw new Error('Invalid filename');
  return base;
}
export function validateUpload(
  input: {
    filename: string;
    declaredMime: string;
    detectedMime: string;
    size: number;
    duration: number;
  },
  limits = { maxBytes: 536_870_912, maxDuration: 60 }
) {
  sanitizeUploadFilename(input.filename);
  if (
    !allowedVideoMimeTypes.has(input.declaredMime) ||
    !allowedVideoMimeTypes.has(input.detectedMime)
  )
    throw new Error('Unsupported video format');
  if (
    input.declaredMime !== input.detectedMime &&
    !(
      input.declaredMime === 'video/quicktime' &&
      input.detectedMime === 'video/mp4'
    )
  )
    throw new Error('File content does not match its declared type');
  if (input.size <= 0 || input.size > limits.maxBytes)
    throw new Error('Video exceeds the upload size limit');
  if (input.duration <= 0 || input.duration > limits.maxDuration)
    throw new Error('Video exceeds the duration limit');
  return { filename: sanitizeUploadFilename(input.filename) };
}
export type ProbeMetadata = {
  duration: number;
  width: number;
  height: number;
  videoCodec: string;
  audioCodec?: string;
  formatName: string;
};
export function parseFfprobe(value: unknown): ProbeMetadata {
  const data = value as {
    format?: { duration?: string; format_name?: string };
    streams?: Array<{
      codec_type?: string;
      codec_name?: string;
      width?: number;
      height?: number;
    }>;
  };
  const video = data.streams?.find((s) => s.codec_type === 'video'),
    audio = data.streams?.find((s) => s.codec_type === 'audio'),
    duration = Number(data.format?.duration);
  if (!video || !video.width || !video.height || !Number.isFinite(duration))
    throw new Error('Could not read valid video metadata');
  return {
    duration,
    width: video.width,
    height: video.height,
    videoCodec: video.codec_name || 'unknown',
    audioCodec: audio?.codec_name,
    formatName: data.format?.format_name || 'unknown',
  };
}
export function detectedVideoMime(formatName: string) {
  const formats = new Set(formatName.toLowerCase().split(','));
  if (formats.has('webm')) return 'video/webm';
  if (formats.has('mov') && !formats.has('mp4')) return 'video/quicktime';
  if (formats.has('mp4') || formats.has('mov')) return 'video/mp4';
  return 'application/octet-stream';
}
export function needsPublishNormalization(
  media: Pick<ProbeMetadata, 'formatName' | 'videoCodec' | 'audioCodec'>
) {
  const formats = new Set(media.formatName.toLowerCase().split(','));
  return (
    !formats.has('mp4') ||
    media.videoCodec.toLowerCase() !== 'h264' ||
    (!!media.audioCodec && media.audioCodec.toLowerCase() !== 'aac')
  );
}
export function normalizeVideoArgs(input: string, output: string) {
  return [
    '-y',
    '-i',
    input,
    '-map',
    '0:v:0',
    '-map',
    '0:a?',
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    '-crf',
    '20',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    '-movflags',
    '+faststart',
    output,
  ];
}
export function renderArgs(input: string, assFile: string, output: string) {
  return [
    '-y',
    '-i',
    input,
    '-vf',
    `ass=${assFile.replaceAll(':', '\\:')}`,
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    '-crf',
    '20',
    '-c:a',
    'aac',
    '-movflags',
    '+faststart',
    output,
  ];
}
export async function runFfmpeg(args: string[]) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn('ffmpeg', args, { stdio: 'ignore', shell: false });
    child.once('error', reject);
    child.once('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`))
    );
  });
}
export async function probeVideo(path: string): Promise<ProbeMetadata> {
  const output = await new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    const child = spawn(
      'ffprobe',
      ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', path],
      { shell: false }
    );
    child.stdout.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    child.once('error', reject);
    child.once('exit', (code) =>
      code === 0
        ? resolve(Buffer.concat(chunks).toString('utf8'))
        : reject(new Error(`ffprobe exited ${code}`))
    );
  });
  return parseFfprobe(JSON.parse(output));
}
const assTime = (seconds: number) => {
  const cs = Math.round(seconds * 100),
    h = Math.floor(cs / 360000),
    m = Math.floor(cs / 6000) % 60,
    s = Math.floor(cs / 100) % 60,
    c = cs % 100;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}`;
};
export function captionsToAss(
  cues: CaptionCue[],
  style: {
    fontSize?: number;
    color?: string;
    outline?: number;
    verticalPosition?: 'top' | 'middle' | 'bottom';
  } = {}
) {
  validateCues(cues);
  const size = Math.min(96, Math.max(24, style.fontSize ?? 58)),
    alignment =
      style.verticalPosition === 'top'
        ? 8
        : style.verticalPosition === 'middle'
          ? 5
          : 2,
    outline = Math.min(8, Math.max(0, style.outline ?? 4));
  const escape = (text: string) =>
    text
      .replaceAll('\\', '\\\\')
      .replaceAll('{', '\\{')
      .replaceAll('}', '\\}')
      .replaceAll('\n', '\\N');
  return `[Script Info]\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\nWrapStyle: 0\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Arial,${size},&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,${outline},0,${alignment},70,70,150,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n${cues.map((c) => `Dialogue: 0,${assTime(c.start)},${assTime(c.end)},Default,,0,0,0,,${escape(c.text)}`).join('\n')}\n`;
}
