import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// Uruchamia zbudowaną aplikację (out/main/index.js) z jednorazowym profilem użytkownika, aby
// przebiegi E2E nigdy nie dotykały prawdziwych ustawień, logów ani biblioteki dewelopera.

export interface OndaApp {
  app: ElectronApplication;
  page: Page;
  pageErrors: string[];
  userDataDir: string;
  dispose: () => Promise<void>;
}

export interface LaunchOptions {
  /** Uruchamia się na świeżym katalogu profilu przed startem Electrona. */
  profileSetup?: (userDataDir: string) => void;
  /** Ponownie używa istniejącego profilu (np. zasiał go poprzedni przebieg) zamiast świeżego. */
  userDataDir?: string;
  /** Dodatkowe środowisko dla procesu Electron (np. ONDA_E2E_FIXTURES=1). */
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
  // CI Linux działa jako root bez użytecznego chrome-sandbox.
  if (process.platform === 'linux') args.push('--no-sandbox');

  // main/index.ts stosuje to przed blokadą pojedynczej instancji, więc każdy przebieg
  // dostaje świeży profil, a równoległe instancje nie walczą o blokadę.
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
        // Onda ukrywa się do tray zamiast zamykać (close-to-tray), więc najpierw zniszcz
        // okna; następnie daj Playwrightowi ograniczoną szansę na zebranie aplikacji.
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
    // Nigdy nie zostawiaj procesu Electron trzymającego blokadę instancji.
    await app.close().catch(() => {});
    if (!proc.killed) proc.kill('SIGKILL');
    rmSync(userDataDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
    throw error;
  }
}

const WIZARD_WAIT_MS = 8_000;
const WIZARD_CLICK_TIMEOUT_MS = 5_000;

/**
 * Pierwsze uruchomienie na świeżym profilu pokazuje kreatora onboardingu. Montuje się
 * asynchronicznie (najpierw ładują się ustawienia + locale), a jego pełnoekranowa nakładka
 * pożera zdarzenia wskaźnika, więc poczekaj na niego, odrzuć go i potwierdź, że węzeł
 * zniknął, zanim test wejdzie w interakcję z UI.
 */
export async function dismissWizard(page: Page): Promise<void> {
  const skip = page.getByTestId('wizard-skip');

  // Po odrzuceniu flaga przetrwa przeładowania, więc kreator nie zamontuje się
  // ponownie — nie czekaj przez pełny timeout pojawienia się.
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
