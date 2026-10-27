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
  /** Anulowanie zabija proces (np. ffmpeg podczas analizy głośności). */
  signal?: AbortSignal;
}

export interface CommandResult {
  stdout: string;
  stderr: string;
}

// 64 MB: znacznie powyżej każdego uzasadnionego JSON-a `--version`/metadanych, ale ograniczone.
const DEFAULT_MAX_BUFFER = 64 * 1024 * 1024;

/**
 * Jak `runCommand`, ale zwraca też stderr — potrzebne narzędziom, które piszą wynik
 * na stderr (np. podsumowanie `ebur128` w ffmpeg).
 */
export function runCommandResult(
  bin: string,
  args: string[],
  options: RunCommandOptions = {}
): Promise<CommandResult> {
  if (options.signal?.aborted) return Promise.reject(new Error('Command aborted'));
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

    const cleanup = (): void => {
      options.signal?.removeEventListener('abort', onAbort);
    };

    const fail = (err: Error): void => {
      if (settled) return;
      settled = true;
      cleanup();
      child.kill();
      reject(err);
    };

    const onAbort = (): void => fail(new Error('Command aborted'));

    if (options.signal) {
      if (options.signal.aborted) {
        fail(new Error('Command aborted'));
        return;
      }
      options.signal.addEventListener('abort', onAbort, { once: true });
    }

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
      cleanup();
      reject(err);
    });
    child.on('close', (code, signal) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (signal) {
        reject(new Error(`Process killed by signal ${signal}`));
        return;
      }
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(stderr.trim() || `Command failed with exit code ${code}`));
      }
    });
  });
}

/**
 * Uruchamia binarium z jawną tablicą argumentów (bez shella), unikając wstrzyknięcia
 * poleceń z niezaufanych ścieżek plików. Rozwiązuje się przechwyconym stdout albo
 * odrzuca błędem zawierającym przechwycony stderr / kod wyjścia.
 */
export async function runCommand(
  bin: string,
  args: string[],
  options: RunCommandOptions = {}
): Promise<string> {
  const { stdout } = await runCommandResult(bin, args, options);
  return stdout;
}
