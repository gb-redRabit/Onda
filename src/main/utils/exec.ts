import { spawn } from 'child_process';

interface RunCommandOptions {
  timeout?: number;
  cwd?: string;
  /**
   * Cap on the combined captured stdout+stderr. The process is killed and the
   * promise rejects once the cap is exceeded, so a runaway yt-dlp/ffmpeg can
   * never grow the two strings until the V8 heap is exhausted.
   */
  maxBuffer?: number;
}

// 64 MB: far above any legitimate `--version`/metadata JSON, but bounded.
const DEFAULT_MAX_BUFFER = 64 * 1024 * 1024;

/**
 * Run a binary with explicit argument array (no shell), avoiding shell
 * injection from untrusted file paths. Resolves with captured stdout, or
 * rejects with an Error containing captured stderr / exit code.
 */
export function runCommand(
  bin: string,
  args: string[],
  options: RunCommandOptions = {}
): Promise<string> {
  return new Promise((resolve, reject) => {
    const maxBuffer = options.maxBuffer ?? DEFAULT_MAX_BUFFER;
    const child = spawn(bin, args, {
      windowsHide: true,
      timeout: options.timeout,
      cwd: options.cwd
    });
    let stdout = '';
    let stderr = '';
    let size = 0;
    let settled = false;

    const fail = (err: Error): void => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(err);
    };

    const append = (chunk: Buffer, target: 'out' | 'err'): void => {
      if (settled) return;
      size += chunk.length;
      if (size > maxBuffer) {
        fail(new Error(`Command output exceeded ${maxBuffer} bytes and was killed`));
        return;
      }
      if (target === 'out') stdout += chunk.toString('utf-8');
      else stderr += chunk.toString('utf-8');
    };

    child.stdout?.on('data', (d: Buffer) => append(d, 'out'));
    child.stderr?.on('data', (d: Buffer) => append(d, 'err'));
    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    });
    child.on('close', (code, signal) => {
      if (settled) return;
      settled = true;
      if (signal) {
        reject(new Error(`Process killed by signal ${signal}`));
        return;
      }
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(stderr.trim() || `Command failed with exit code ${code}`));
      }
    });
  });
}
