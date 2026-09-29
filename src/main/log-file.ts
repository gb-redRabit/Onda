import { app } from 'electron';
import { appendFile, mkdir, readFile, truncate, copyFile, stat } from 'fs/promises';
import { join } from 'path';
import os from 'os';
import { logger } from '../shared/logger';
import { redactSecrets } from '../shared/redact';
import { recordWarning, clearWarnings } from './warnings';

const LOG_LINES = 2000;

// `general.logLevel` / `general.logMaxSizeMB` (Settings → System → Logs). Applied
// at boot and whenever the settings change, so the level/cap are honoured instead
// of being decorative controls.
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

let writeQueue: Promise<void> = Promise.resolve();

function writeLine(level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR', args: unknown[]): void {
  if (LEVEL_WEIGHT[level.toLowerCase() as LogLevel] < LEVEL_WEIGHT[minLevel]) return;
  const dir = getLogDir();
  const file = getLogPath();
  const text = redactSecrets(formatArgs(args));
  if (level === 'WARN') recordWarning(text);
  const line = `[${ts()}] [${level}] ${text}\n`;
  writeQueue = writeQueue
    .then(async () => {
      await mkdir(dir, { recursive: true });
      const s = await stat(file).catch(() => null);
      if (s && s.size > maxFileBytes) {
        await truncate(file, 0);
      }
      await appendFile(file, line, 'utf-8');
    })
    .catch((e) => {
      logger.warn('logfile', 'write failed', e);
    });
}

// Patch console in the main process so every logger call also lands on disk.
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
  // `console.info` is its own reference in Node, so patching `log` is not enough.
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
  // `debug` only reaches the file when `logLevel` is 'debug'.
  console.debug = (...args: unknown[]) => {
    original.debug(...args);
    writeLine('DEBUG', args);
  };
}

export async function readLogTail(lines: number = LOG_LINES): Promise<string> {
  try {
    const data = await readFile(getLogPath(), 'utf-8');
    const all = data.split('\n');
    return all.slice(-lines).join('\n');
  } catch {
    return '';
  }
}

export async function clearLogFile(): Promise<boolean> {
  try {
    await truncate(getLogPath(), 0);
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
