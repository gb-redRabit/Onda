import { _electron as electron, type ElectronApplication, type Page } from 'playwright';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// Launches the built app (out/main/index.js) with a throw-away user profile so
// E2E runs never touch the developer's real settings, logs or library.

export interface OndaApp {
  app: ElectronApplication;
  page: Page;
  pageErrors: string[];
  dispose: () => Promise<void>;
}

const MAIN_WINDOW_TIMEOUT_MS = 30_000;
const CLOSE_TIMEOUT_MS = 5_000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForMainWindow(app: ElectronApplication): Promise<Page> {
  const deadline = Date.now() + MAIN_WINDOW_TIMEOUT_MS;
  while (Date.now() < deadline) {
    for (const page of app.windows()) {
      const url = page.url();
      if (url && !url.includes('splash.html')) return page;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Onda main window did not appear within ${MAIN_WINDOW_TIMEOUT_MS}ms`);
}

export async function launchOnda(): Promise<OndaApp> {
  const userDataDir = mkdtempSync(join(tmpdir(), 'onda-e2e-'));
  const args = ['.'];
  // CI Linux runs as root without a usable chrome-sandbox.
  if (process.platform === 'linux') args.push('--no-sandbox');

  // main/index.ts applies this before the single-instance lock, so every run
  // gets a fresh profile and parallel instances do not fight over the lock.
  const env = { ...process.env, ONDA_USER_DATA_DIR: userDataDir } as Record<string, string>;

  const app = await electron.launch({ args, env });
  const proc = app.process();
  try {
    const page = await waitForMainWindow(app);

    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    return {
      app,
      page,
      pageErrors,
      dispose: async () => {
        // Onda hides to tray instead of closing (close-to-tray), so destroy the
        // windows first; then give Playwright a bounded chance to reap the app.
        await app
          .evaluate(({ BrowserWindow }) => {
            for (const win of BrowserWindow.getAllWindows()) win.destroy();
          })
          .catch(() => {});
        await Promise.race([app.close().catch(() => {}), delay(CLOSE_TIMEOUT_MS)]);
        if (!proc.killed) proc.kill('SIGKILL');
        rmSync(userDataDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
      }
    };
  } catch (error) {
    // Never leak an Electron process holding the instance lock.
    await app.close().catch(() => {});
    if (!proc.killed) proc.kill('SIGKILL');
    rmSync(userDataDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
    throw error;
  }
}
