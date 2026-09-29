import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const userDataDir = mkdtempSync(join(tmpdir(), 'onda-logfile-'));

vi.mock('electron', () => ({
  app: { getPath: () => userDataDir }
}));

const { applyLogSettings, setupFileLogging, getLogPath, flushLogWrites } =
  await import('../log-file');

// Awaits the write queue instead of sleeping: the log is written asynchronously
// and a fixed delay turns this into a flake as soon as the suite gets busier.
const flush = () => flushLogWrites();

beforeEach(() => {
  setupFileLogging();
  applyLogSettings('info', 10);
});

afterEach(async () => {
  await flush();
  rmSync(userDataDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
});

describe('log file level filtering', () => {
  it('writes info/warn/error at the default level but drops debug', async () => {
    console.info('[test] info line');
    console.warn('[test] warn line');
    console.error('[test] error line');
    console.debug('[test] debug line');
    await flush();

    const text = readFileSync(getLogPath(), 'utf8');
    expect(text).toContain('[INFO] [test] info line');
    expect(text).toContain('[WARN] [test] warn line');
    expect(text).toContain('[ERROR] [test] error line');
    expect(text).not.toContain('debug line');
  });

  it('keeps only warnings and errors when the level is warn', async () => {
    applyLogSettings('warn', 10);
    console.info('[test] info hidden');
    console.warn('[test] warn kept');
    await flush();

    const text = readFileSync(getLogPath(), 'utf8');
    expect(text).not.toContain('info hidden');
    expect(text).toContain('[WARN] [test] warn kept');
  });

  it('includes debug lines when the level is debug', async () => {
    applyLogSettings('debug', 10);
    console.debug('[test] debug kept');
    await flush();

    expect(readFileSync(getLogPath(), 'utf8')).toContain('[DEBUG] [test] debug kept');
  });
});
