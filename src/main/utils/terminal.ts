import type { ChildProcess } from 'child_process';

export interface TerminalCommand {
  cmd: string;
  args: string[];
}

/**
 * Terminal emulators to try, in order, for the current platform. Windows uses
 * cmd; macOS `open -a Terminal`; Linux has no single binary, so the common
 * emulators are tried and `xdg-open` is the last resort.
 */
export function terminalCandidates(platform: NodeJS.Platform, dir: string): TerminalCommand[] {
  if (platform === 'win32') return [{ cmd: 'cmd', args: ['/K', 'cd', '/d', dir] }];
  if (platform === 'darwin') return [{ cmd: 'open', args: ['-a', 'Terminal', dir] }];
  return [
    { cmd: 'x-terminal-emulator', args: ['--working-directory', dir] },
    { cmd: 'gnome-terminal', args: ['--working-directory', dir] },
    { cmd: 'konsole', args: ['--workdir', dir] },
    { cmd: 'xfce4-terminal', args: ['--working-directory', dir] },
    { cmd: 'xterm', args: ['-e', 'sh', '-c', `cd "${dir}" && exec sh`] },
    { cmd: 'xdg-open', args: [dir] }
  ];
}

export type SpawnLike = (cmd: string, args: string[], options: object) => ChildProcess;

/**
 * Spawns the first candidate that actually launches. A missing binary does not
 * throw synchronously — Node emits an asynchronous 'error' — so each candidate
 * is awaited until its 'spawn' event fires, then unref'd (detached).
 * Resolves true when one launched, false when none did.
 */
export async function spawnFirstAvailable(
  candidates: TerminalCommand[],
  spawnFn: SpawnLike
): Promise<boolean> {
  for (const candidate of candidates) {
    const launched = await new Promise<boolean>((resolve) => {
      let settled = false;
      const child = spawnFn(candidate.cmd, candidate.args, {
        detached: true,
        stdio: 'ignore'
      });
      child.on('error', () => {
        if (settled) return;
        settled = true;
        resolve(false);
      });
      child.on('spawn', () => {
        if (settled) return;
        settled = true;
        child.unref();
        resolve(true);
      });
    });
    if (launched) return true;
  }
  return false;
}
