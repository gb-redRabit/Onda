import { app } from 'electron';
import { spawn } from 'node:child_process';
import { mkdirSync, openSync } from 'node:fs';
import { join } from 'node:path';
import { getLogDir } from '../log-file';
import { logger } from '../../shared/logger';

// Restart całej aplikacji. W buildzie spakowanym wystarcza `app.relaunch()`;
// pod `electron-vite dev` serwer renderera gaśnie razem z procesem Electrona,
// więc trzeba uruchomić świeże polecenie dev (inaczej nowa instancja trafi na
// martwy URL i pokaże puste okno).
//
// Dlaczego nie `npm run dev`: w Windows `shell: true` uruchamia cmd.exe z własną
// konsolą, której `windowsHide` nie ukrywa dla odłączonego shella — użytkownik
// zobaczyłby obce okno cmd. Uruchomienie binarki electron-vite zwykłym Node
// utrzymuje spawn bezokienkowym.
//
// `detached: true` jest wymagane na każdej platformie, w tym Windows: zwykłe
// dziecko jest kończone razem z tym procesem, więc restartowany stos ginąłby
// w trakcie budowania i aplikacja nie wracałaby. Odłączenie pozwala mu przetrwać
// `app.exit(0)` i trzyma go poza grupą procesów rodzica.
function restartDevCommand(): void {
  const node = process.env['npm_node_execpath'] || 'node';
  const bin = join(app.getAppPath(), 'node_modules', 'electron-vite', 'bin', 'electron-vite.js');
  mkdirSync(getLogDir(), { recursive: true });
  const out = openSync(join(getLogDir(), 'dev-restart.log'), 'a');
  const child = spawn(node, [bin, 'dev'], {
    cwd: app.getAppPath(),
    detached: true,
    stdio: ['ignore', out, out],
    windowsHide: true
  });
  child.unref();
}

/**
 * Restartuje aplikację po `delayMs` (pozwala rendererowi pokazać stan pośredni).
 * W dev z `ELECTRON_RENDERER_URL` podnosi nowe `electron-vite dev`; w buildzie
 * spakowanym używa `app.relaunch()`.
 */
export function relaunchApp(delayMs = 300): void {
  setTimeout(() => {
    try {
      if (app.isPackaged) {
        app.relaunch();
      } else if (process.env['ELECTRON_RENDERER_URL']) {
        restartDevCommand();
      }
      app.exit(0);
    } catch (error) {
      // Handler `closed` okna mógł rzucić wyjątkiem podczas zamykania — ponawiamy,
      // żeby restart się odbył.
      logger.warn('relaunch', 'app.exit threw - retrying', error);
      setTimeout(() => app.exit(0), 200);
    }
  }, delayMs);
}
