import { spawn } from 'child_process';

interface RunCommandOptions {
  timeout?: number;
  cwd?: string;
  /**
   * Limit łącznego przechwyconego stdout+stderr. Proces jest zabijany, a promise
   * odrzucany po przekroczeniu limitu, więc rozbiegane yt-dlp/ffmpeg nigdy nie
   * rozrosną tych dwóch stringów, aż sterta V8 się wyczerpie.
   */
  maxBuffer?: number;
}

// 64 MB: znacznie powyżej każdego uzasadnionego JSON-a `--version`/metadanych, ale ograniczone.
const DEFAULT_MAX_BUFFER = 64 * 1024 * 1024;

/**
 * Uruchamia binarium z jawną tablicą argumentów (bez shella), unikając wstrzyknięcia
 * poleceń z niezaufanych ścieżek plików. Rozwiązuje się przechwyconym stdout albo
 * odrzuca błędem zawierającym przechwycony stderr / kod wyjścia.
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
