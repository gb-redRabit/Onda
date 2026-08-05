import { app } from 'electron';
import { appendFile, mkdir, readFile, truncate, copyFile, stat } from 'fs/promises';
import { join } from 'path';
import os from 'os';
import { logger } from '../shared/logger';

const LOG_LINES = 2000;
const MAX_FILE_BYTES = 5 * 1024 * 1024;

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

function writeLine(level: string, args: unknown[]): void {
  const dir = getLogDir();
  const file = getLogPath();
  const line = `[${ts()}] [${level}] ${formatArgs(args)}\n`;
  writeQueue = writeQueue
    .then(async () => {
      await mkdir(dir, { recursive: true });
      const s = await stat(file).catch(() => null);
      if (s && s.size > MAX_FILE_BYTES) {
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
  const original = { log: console.log, error: console.error, warn: console.warn };
  console.log = (...args: unknown[]) => {
    original.log(...args);
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
    return true;
  } catch (e) {
    logger.warn('logfile', 'clear failed', e);
    return false;
  }
}

export async function copyLogTo(destPath: string): Promise<void> {
  await copyFile(getLogPath(), destPath);
}

export interface EnvironmentInfo {
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
