import type { ChildProcess } from 'child_process';

export interface TerminalCommand {
  cmd: string;
  args: string[];
  /**
   * Katalog roboczy terminala. Ustawiamy go przez opcję spawnu, a NIE przez
   * `cd "<dir>"` w argumencie — ścieżka pochodzi z renderera i może zawierać
   * metaznaki shella (`"`, `$`, `` ` ``, `&`, `;`), co dawało wstrzyknięcie
   * polecenia (np. katalog `/tmp/$(touch /tmp/pwned)`).
   */
  cwd?: string;
}

/**
 * Emulatory terminala do wypróbowania, w kolejności, dla bieżącej platformy.
 * Windows używa cmd; macOS `open -a Terminal`; Linux nie ma jednego binarium,
 * więc próbowane są popularne emulatory, a `xdg-open` jest ostatnią deską ratunku.
 * Katalog przekazywany jest zawsze przez `cwd` lub osobny argument argv, nigdy
 * przez łańcuch interprettowany przez shell.
 */
export function terminalCandidates(platform: NodeJS.Platform, dir: string): TerminalCommand[] {
  if (platform === 'win32') return [{ cmd: 'cmd', args: [], cwd: dir }];
  if (platform === 'darwin') return [{ cmd: 'open', args: ['-a', 'Terminal', dir] }];
  return [
    { cmd: 'x-terminal-emulator', args: ['--working-directory', dir] },
    { cmd: 'gnome-terminal', args: ['--working-directory', dir] },
    { cmd: 'konsole', args: ['--workdir', dir] },
    { cmd: 'xfce4-terminal', args: ['--working-directory', dir] },
    { cmd: 'xterm', args: ['-e', 'sh'], cwd: dir },
    { cmd: 'xdg-open', args: [dir] }
  ];
}

export type SpawnLike = (cmd: string, args: string[], options: object) => ChildProcess;

/**
 * Uruchamia pierwszego kandydata, który faktycznie się uruchomi. Brakujące
 * binarium nie rzuca synchronicznie — Node emituje asynchroniczny 'error' —
 * więc każdy kandydat jest oczekiwany, aż wystrzeli jego zdarzenie 'spawn',
 * a potem unref'owany (detached).
 * Rozwiązuje się na true, gdy jeden się uruchomił, false, gdy żaden.
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
        stdio: 'ignore',
        ...(candidate.cwd ? { cwd: candidate.cwd } : {})
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
