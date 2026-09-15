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
  userDataDir: string;
  dispose: () => Promise<void>;
}

export interface LaunchOptions {
  /** Runs against the fresh profile directory before Electron starts. */
  profileSetup?: (userDataDir: string) => void;
  /** Reuses an existing profile (e.g. seeded by a previous run) instead of a fresh one. */
  userDataDir?: string;
  /** Extra environment for the Electron process (e.g. ONDA_E2E_FIXTURES=1). */
  env?: Record<string, string>;
}

const MAIN_WINDOW_TIMEOUT_MS = 30_000;
const CLOSE_TIMEOUT_MS = 5_000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isMainWindowUrl(url: string): boolean {
  if (!url || url.includes('splash.html')) return false;
  if (url.includes('/renderer/index.html') || url.includes('\\renderer\\index.html')) return true;
  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  return !!devUrl && url.startsWith(devUrl);
}

async function waitForMainWindow(app: ElectronApplication): Promise<Page> {
  const deadline = Date.now() + MAIN_WINDOW_TIMEOUT_MS;
  while (Date.now() < deadline) {
    for (const page of app.windows()) {
      if (isMainWindowUrl(page.url())) return page;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Onda main window did not appear within ${MAIN_WINDOW_TIMEOUT_MS}ms`);
}

export async function launchOnda(options: LaunchOptions = {}): Promise<OndaApp> {
  const userDataDir = options.userDataDir ?? mkdtempSync(join(tmpdir(), 'onda-e2e-'));
  options.profileSetup?.(userDataDir);
  const args = ['.'];
  // CI Linux runs as root without a usable chrome-sandbox.
  if (process.platform === 'linux') args.push('--no-sandbox');

  // main/index.ts applies this before the single-instance lock, so every run
  // gets a fresh profile and parallel instances do not fight over the lock.
  const env = {
    ...process.env,
    ONDA_USER_DATA_DIR: userDataDir,
    ...options.env
  } as Record<string, string>;

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
      userDataDir,
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

const WIZARD_WAIT_MS = 8_000;
const WIZARD_CLICK_TIMEOUT_MS = 5_000;

/**
 * First run on a fresh profile shows the onboarding wizard. It mounts
 * asynchronously (settings + locale load first) and its full-screen overlay
 * swallows pointer events, so wait for it, dismiss it and confirm the node is
 * gone before the test interacts with the UI.
 */
export async function dismissWizard(page: Page): Promise<void> {
  const skip = page.getByTestId('wizard-skip');

  // After a dismissal the flag survives reloads, so the wizard will not mount
  // again — don't sit through the full appearance timeout.
  const done = await page
    .evaluate(() => {
      try {
        return localStorage.getItem('onda-first-run-done') === '1';
      } catch {
        return false;
      }
    })
    .catch(() => false);
  if (done) {
    await skip.waitFor({ state: 'detached', timeout: 3_000 }).catch(() => {});
    return;
  }

  const appeared = await skip.waitFor({ state: 'visible', timeout: WIZARD_WAIT_MS }).then(
    () => true,
    () => false
  );
  if (!appeared) return;

  for (let attempt = 0; attempt < 3; attempt++) {
    if ((await skip.count()) === 0) return;
    await skip.click({ timeout: WIZARD_CLICK_TIMEOUT_MS }).catch(() => {});
    const gone = await skip.waitFor({ state: 'detached', timeout: 3_000 }).then(
      () => true,
      () => false
    );
    if (gone) return;
  }
  throw new Error('onboarding wizard did not close after 3 attempts');
}
