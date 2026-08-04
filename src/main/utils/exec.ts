import { spawn } from 'child_process';

export interface RunCommandOptions {
  timeout?: number;
  cwd?: string;
}

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
    const child = spawn(bin, args, {
      windowsHide: true,
      timeout: options.timeout,
      cwd: options.cwd
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (d: Buffer) => {
      stdout += d.toString('utf-8');
    });
    child.stderr?.on('data', (d: Buffer) => {
      stderr += d.toString('utf-8');
    });
    child.on('error', (err) => reject(err));
    child.on('close', (code, signal) => {
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
