import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const userDataDir = mkdtempSync(join(tmpdir(), 'onda-logfile-fail-'));

const fsState = vi.hoisted(() => ({ failAppend: true }));

vi.mock('fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs/promises')>();
  return {
    ...actual,
    appendFile: async (...args: Parameters<typeof actual.appendFile>) => {
      if (fsState.failAppend) throw new Error('ENOSPC: no space left on device');
      return actual.appendFile(...args);
    }
  };
});

vi.mock('electron', () => ({
  app: { getPath: () => userDataDir }
}));

type LogFileModule = typeof import('../log-file');

let warnSpy: ReturnType<typeof vi.spyOn>;

// Każdy test dostaje świeży moduł, bo throttle błędów zapisu jest stanem
// modułowym — inaczej kolejny test nie zobaczyłby ostrzeżenia.
async function loadModule(): Promise<LogFileModule> {
  vi.resetModules();
  return import('../log-file');
}

function failureWarnings(): unknown[][] {
  const calls = warnSpy.mock.calls as unknown[][];
  return calls.filter((call) => String(call[0]).includes('[logfile] write failed'));
}

beforeEach(() => {
  fsState.failAppend = true;
  warnSpy = vi.spyOn(console, 'warn');
});

afterEach(() => {
  warnSpy.mockRestore();
  fsState.failAppend = false;
  rmSync(userDataDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
});

describe('log file write failures', () => {
  it('reports the failure once and drains the queue instead of re-queueing forever', async () => {
    const log = await loadModule();
    log.setupFileLogging();
    log.applyLogSettings('info', 10);

    console.warn('[test] disk full');

    // Bez poprawki kolejka nigdy nie jest pusta: każde nieudane `appendFile`
    // dopisuje kolejne zadanie, więc `flush` wisi w nieskończoność.
    await Promise.race([
      log.flushLogWrites(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('write queue stuck')), 1500))
    ]);

    expect(failureWarnings()).toHaveLength(1);
    expect(warnSpy.mock.calls.length).toBeLessThanOrEqual(2);
  });

  it('keeps logging after a failure once the disk recovers', async () => {
    const log = await loadModule();
    log.setupFileLogging();
    log.applyLogSettings('info', 10);

    console.warn('[test] first failure');
    await log.flushLogWrites();

    fsState.failAppend = false;
    console.warn('[test] recovered line');
    await log.flushLogWrites();

    const tail = await log.readLogTail();
    expect(tail).toContain('[test] recovered line');
  });
});
