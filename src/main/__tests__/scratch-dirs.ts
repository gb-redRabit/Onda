import { mkdtemp, rm } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { isProtectedPath } from '../path-policy';

/**
 * A scratch directory that path-policy considers ordinary.
 *
 * Tests that assert a path is *accepted* cannot use os.tmpdir(): the temp
 * directory is not an ordinary folder on every platform, and the difference is
 * invisible until CI runs somewhere else. On macOS it is
 * /var/folders/.../T, and on a Windows runner with TEMP and TMP unset it
 * resolves to C:\WINDOWS\temp — both are protected prefixes, so the handler
 * correctly refuses them and the test fails for a reason that has nothing to do
 * with what it is testing. That is exactly what happened on macOS.
 *
 * The user's home directory is the one location guaranteed to be a plain folder
 * on Windows, macOS and Linux. It is still outside the repository, so
 * `check:artifacts` stays satisfied.
 */
export async function makeGrantableScratch(prefix: string): Promise<{
  dir: string;
  cleanup: () => Promise<void>;
}> {
  const base = join(homedir(), `.onda-test-${prefix}`);
  const dir = await mkdtemp(base);

  if (isProtectedPath(dir)) {
    // Better to say why than to fail later inside an unrelated assertion.
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

/** For tests that genuinely need a temp directory and never assert on policy. */
export function makeTempDir(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), `onda-${prefix}-`));
}
