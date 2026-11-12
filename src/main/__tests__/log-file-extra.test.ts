import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const userDataDir = mkdtempSync(join(tmpdir(), 'onda-logfile-extra-'));

const h = vi.hoisted(() => ({
  recordWarning: vi.fn(),
  clearWarnings: vi.fn(),
  rotate: vi.fn(async () => undefined)
}));

vi.mock('electron', () => ({
  app: {
    getPath: () => userDataDir,
    getName: () => 'Onda',
    getVersion: () => '9.9.9'
  }
}));
vi.mock('../warnings', () => ({
  recordWarning: h.recordWarning,
  clearWarnings: h.clearWarnings
}));
vi.mock('../log-rotate', () => ({ rotateLogIfNeeded: h.rotate }));

import {
  applyLogSettings,
  clearLogFile,
  copyLogTo,
  flushLogWrites,
  getEnvironmentInfo,
  getLogDir,
  getLogPath,
  readLogTail,
  setupFileLogging
} from '../log-file';

const flush = () => flushLogWrites();

function readLog(): string {
  return readFileSync(getLogPath(), 'utf8');
}

function resetLogs(): void {
  rmSync(getLogDir(), { recursive: true, force: true });
}

beforeEach(async () => {
  setupFileLogging();
  applyLogSettings('debug', 10);
  resetLogs();
  await flush();
  h.recordWarning.mockClear();
  h.clearWarnings.mockClear();
  h.rotate.mockClear();
});

afterEach(async () => {
  await flush();
  rmSync(userDataDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
});

describe('settings and paths', () => {
  it('keeps the previous level for unknown values and ignores bad sizes', async () => {
    applyLogSettings('warn', 10);
    applyLogSettings('verbose', -1);
    console.info('[test] hidden');
    console.warn('[test] kept');
    await flush();

    expect(readLog()).not.toContain('hidden');
    expect(readLog()).toContain('[WARN] [test] kept');
  });

  it('ignores a non-positive max size and keeps the current limit', async () => {
    applyLogSettings('debug', 10);
    applyLogSettings(undefined, 0);
    console.info('[test] line');
    await flush();

    expect(h.rotate).toHaveBeenCalledWith(getLogPath(), 10 * 1024 * 1024);
  });

  it('exposes the log directory and file paths', () => {
    expect(getLogDir()).toBe(join(userDataDir, 'logs'));
    expect(getLogPath()).toBe(join(userDataDir, 'logs', 'main.log'));
  });
});

describe('formatting', () => {
  it('formats errors, objects, circular values and primitives', async () => {
    const circular: Record<string, unknown> = { name: 'loop' };
    circular.self = circular;

    console.log(
      '[test] object',
      { a: 1 },
      new Error('boom'),
      circular,
      123n,
      'string',
      '[test] end'
    );
    console.error('[test] error line');
    console.debug('[test] debug line');
    await flush();

    const text = readLog();
    expect(text).toContain('[ERROR] [test] error line');
    expect(text).toContain('[DEBUG] [test] debug line');
    expect(text).toContain('{"a":1}');
    expect(text).toContain('Error: boom');
    expect(text).toContain('[object Object]');
    expect(text).toContain('123');
    expect(text).toContain('string');
  });

  it('records warnings with the redacted text', async () => {
    console.warn('[test] warn', { password: 'hunter2' });
    await flush();

    expect(h.recordWarning).toHaveBeenCalledWith(expect.stringContaining('[test] warn'));
  });
});

describe('reading the tail', () => {
  it('merges the rotated file with the current one', async () => {
    mkdirSync(getLogDir(), { recursive: true });
    writeFileSync(`${getLogPath()}.1`, 'old-1\nold-2\n');
    writeFileSync(getLogPath(), 'new-1\nnew-2\n');

    expect(await readLogTail()).toContain('old-1');
    expect(await readLogTail(3)).toBe('new-1\nnew-2\n');
  });

  it('returns an empty string when no logs exist', async () => {
    resetLogs();
    expect(await readLogTail()).toBe('');
  });
});

describe('clearing and copying', () => {
  it('truncates the log, removes the rotated file and clears warnings', async () => {
    console.info('[test] before clear');
    await flush();
    writeFileSync(`${getLogPath()}.1`, 'previous');

    await expect(clearLogFile()).resolves.toBe(true);

    expect(readLog()).toBe('');
    expect(h.clearWarnings).toHaveBeenCalledTimes(1);
    await expect(readLogTail()).resolves.toBe('');
  });

  it('returns false when the log cannot be truncated', async () => {
    resetLogs();

    await expect(clearLogFile()).resolves.toBe(false);
  });

  it('copies the current log to a destination', async () => {
    console.info('[test] copy me');
    await flush();
    const dest = join(userDataDir, 'copy.log');

    await copyLogTo(dest);

    expect(readFileSync(dest, 'utf8')).toBe(readLog());
  });
});

describe('environment info', () => {
  it('reports app, runtime and path details', () => {
    const info = getEnvironmentInfo();

    expect(info).toMatchObject({
      appName: 'Onda',
      appVersion: '9.9.9',
      platform: process.platform,
      arch: process.arch,
      userDataPath: userDataDir,
      logPath: getLogPath()
    });
    expect(info.electron).toBe(process.versions.electron ?? '');
    expect(typeof info.uptime).toBe('number');
    expect(info.os).toBeTruthy();
  });
});
