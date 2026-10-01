import { mkdtemp, rm } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { isProtectedPath } from '../path-policy';

/**
 * Katalog roboczy, który path-policy uznaje za zwykły.
 *
 * Testy sprawdzające, że ścieżka jest *akceptowana*, nie mogą używać os.tmpdir():
 * katalog tymczasowy nie jest zwykłym folderem na każdej platformie, a różnica jest
 * niewidoczna, dopóki CI nie uruchomi się gdzie indziej. Na macOS jest to
 * /var/folders/.../T, a na runnerze Windows bez ustawionych TEMP i TMP
 * rozwiązuje się do C:\WINDOWS\temp — oba są chronionymi prefiksami, więc handler
 * słusznie je odrzuca i test zawodzi z powodu, który nie ma nic wspólnego
 * z tym, co testuje. Dokładnie to zdarzyło się na macOS.
 *
 * Katalog domowy użytkownika to jedyne miejsce gwarantowane jako zwykły folder
 * na Windows, macOS i Linux. Wciąż znajduje się poza repozytorium, więc
 * `check:artifacts` pozostaje spełnione.
 */
export async function makeGrantableScratch(prefix: string): Promise<{
  dir: string;
  cleanup: () => Promise<void>;
}> {
  const base = join(homedir(), `.onda-test-${prefix}`);
  const dir = await mkdtemp(base);

  if (isProtectedPath(dir)) {
    // Lepiej wyjaśnić dlaczego, niż zawieść później w środku niepowiązanej asercji.
    await rm(dir, { recursive: true, force: true });
    throw new Error(
      `scratch directory ${dir} is a protected path; the test fixture must be somewhere path-policy accepts`
    );
  }

  return {
    dir,
    cleanup: () => rm(dir, { recursive: true, force: true })
  };
}

/** Dla testów, które naprawdę potrzebują katalogu tymczasowego i nigdy nie sprawdzają polityki. */
export function makeTempDir(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), `onda-${prefix}-`));
}
