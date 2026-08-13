import { spawn } from 'node:child_process';
export function audioExtractionArgs(input: string, output: string) {
  return [
    '-y',
    '-i',
    input,
    '-vn',
    '-ac',
    '1',
    '-ar',
    '16000',
    '-c:a',
    'libmp3lame',
    '-b:a',
    '64k',
    output,
  ];
}
export async function extractAudio(input: string, output: string) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn('ffmpeg', audioExtractionArgs(input, output), {
      shell: false,
      stdio: 'ignore',
    });
    child.once('error', reject);
    child.once('exit', (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`audio extraction failed (${code})`))
    );
  });
}
