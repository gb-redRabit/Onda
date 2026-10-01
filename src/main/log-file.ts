import { app } from 'electron';
import { appendFile, mkdir, readFile, truncate, copyFile, rm } from 'fs/promises';
import { join } from 'path';
import os from 'os';
import { logger } from '../shared/logger';
import { redactSecrets } from '../shared/redact';
import { recordWarning, clearWarnings } from './warnings';
import { rotateLogIfNeeded } from './log-rotate';
import { WriteQueue } from './utils/write-queue';

const LOG_LINES = 2000;

// `general.logLevel` / `general.logMaxSizeMB` (Ustawienia → System → Logi). Stosowane
// przy starcie i przy każdej zmianie ustawień, więc poziom/limit są respektowane,
// a nie pełnią funkcji dekoracyjnej.
const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;
type LogLevel = (typeof LOG_LEVELS)[number];
const LEVEL_WEIGHT: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

let minLevel: LogLevel = 'info';
let maxFileBytes = 10 * 1024 * 1024;

export function applyLogSettings(level?: string, maxSizeMB?: number): void {
  if (level && (LOG_LEVELS as readonly string[]).includes(level)) minLevel = level as LogLevel;
  if (typeof maxSizeMB === 'number' && maxSizeMB > 0) {
    maxFileBytes = Math.round(maxSizeMB * 1024 * 1024);
  }
}

export function getLogDir(): string {
  return join(app.getPath('userData'), 'logs');
}

export function getLogPath(): string {
  return join(getLogDir(), 'main.log');
}

function formatArgs(args: unknown[]): string {
  return args
    .map((a) => {
      if (a instanceof Error) return a.stack || a.message;
      if (typeof a === 'string') return a;
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    })
    .join(' ');
}

function ts(): string {
  return new Date().toISOString();
}

const writeQueue = new WriteQueue();

function writeLine(level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR', args: unknown[]): void {
  if (LEVEL_WEIGHT[level.toLowerCase() as LogLevel] < LEVEL_WEIGHT[minLevel]) return;
  const dir = getLogDir();
  const file = getLogPath();
  const text = redactSecrets(formatArgs(args));
  if (level === 'WARN') recordWarning(text);
  const line = `[${ts()}] [${level}] ${text}\n`;
  writeQueue.push(async () => {
    try {
      await mkdir(dir, { recursive: true });
      // Rotuje (zachowując jeden poprzedni plik) zamiast obcinać, aby seria
      // przekraczająca limit nie wyrzuciła wcześniejszej diagnostyki.
      await rotateLogIfNeeded(file, maxFileBytes);
      await appendFile(file, line, 'utf-8');
    } catch (e) {
      logger.warn('logfile', 'write failed', e);
    }
  });
}

// Podmienia console w procesie głównym, aby każde wywołanie loggera trafiało też na dysk.
export function setupFileLogging(): void {
  const original = {
    log: console.log,
    info: console.info,
    error: console.error,
    warn: console.warn,
    debug: console.debug
  };
  console.log = (...args: unknown[]) => {
    original.log(...args);
    writeLine('INFO', args);
  };
  // `console.info` ma w Node własną referencję, więc samo podmienienie `log` nie wystarczy.
  console.info = (...args: unknown[]) => {
    original.info(...args);
    writeLine('INFO', args);
  };
  console.error = (...args: unknown[]) => {
    original.error(...args);
    writeLine('ERROR', args);
  };
  console.warn = (...args: unknown[]) => {
    original.warn(...args);
    writeLine('WARN', args);
  };
  // `debug` trafia do pliku tylko wtedy, gdy `logLevel` ma wartość 'debug'.
  console.debug = (...args: unknown[]) => {
    original.debug(...args);
    writeLine('DEBUG', args);
  };
}

/**
 * Rozwiązuje się, gdy każda zakolejkowana linia zostanie zapisana.
 *
 * Kolejka poza tym nie jest nigdy oczekiwana, co oznacza, że ostatnie linie przed
 * awarią przepadają, a każdy wywołujący, który chce odczytać log zaraz po
 * zapisaniu, musi zgadywać opóźnienie. `app:quit` czeka na to; testy czekają na to
 * zamiast spać.
 */
export async function flushLogWrites(): Promise<void> {
  await writeQueue.whenIdle();
}

export async function readLogTail(lines: number = LOG_LINES): Promise<string> {
  try {
    // Uwzględnia poprzednią rotację, aby żądanie ogona zaraz po rotacji
    // nadal pokazywało najnowszą aktywność.
    const [previous, current] = await Promise.all([
      readFile(`${getLogPath()}.1`, 'utf-8').catch(() => ''),
      readFile(getLogPath(), 'utf-8').catch(() => '')
    ]);
    const all = `${previous}${current}`.split('\n');
    return all.slice(-lines).join('\n');
  } catch {
    return '';
  }
}

export async function clearLogFile(): Promise<boolean> {
  try {
    await truncate(getLogPath(), 0);
    await rm(`${getLogPath()}.1`, { force: true }).catch(() => {});
    clearWarnings();
    return true;
  } catch (e) {
    logger.warn('logfile', 'clear failed', e);
    return false;
  }
}

export async function copyLogTo(destPath: string): Promise<void> {
  await copyFile(getLogPath(), destPath);
}

interface EnvironmentInfo {
  appName: string;
  appVersion: string;
  electron: string;
  chrome: string;
  node: string;
  v8: string;
  os: string;
  platform: string;
  arch: string;
  userDataPath: string;
  logPath: string;
  uptime: number;
}

export function getEnvironmentInfo(): EnvironmentInfo {
  return {
    appName: app.getName(),
    appVersion: app.getVersion(),
    electron: process.versions.electron ?? '',
    chrome: process.versions.chrome ?? '',
    node: process.versions.node ?? '',
    v8: process.versions.v8 ?? '',
    os: os.version(),
    platform: process.platform,
    arch: process.arch,
    userDataPath: app.getPath('userData'),
    logPath: getLogPath(),
    uptime: Math.round(process.uptime())
  };
}
