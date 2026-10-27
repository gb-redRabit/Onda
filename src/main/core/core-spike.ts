import { app, ipcMain, type BrowserWindow, type IpcMainEvent } from 'electron';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import os from 'os';
import { logger } from '../../shared/logger';
import { addAllowedRoot } from '../media/media-server';
import { createWindow } from '../windows/window-factory';
import type { CoreStateDto, CoreTickDto } from '../../shared/types/ipc/channels-core';
import type { MediaFile } from '../../shared/types/media';

// Faza 2 (#23). Ukryty renderer jest właścicielem audio, kolejki i historii.
// `ONDA_CORE_SHELL=1` podłącza do niego główne okno (shell), a
// `ONDA_CORE_SPIKE=1` dodatkowo otwiera testowy shell z podglądem stanu.

interface CoreServiceOptions {
  /** Otwórz `core-test.html` (spike) oprócz Core. */
  testShell: boolean;
  /** Główne okno, do którego router wysyła stan w trybie shellu. */
  getMainWindow?: () => BrowserWindow | null;
}

let core: BrowserWindow | null = null;
let testShell: BrowserWindow | null = null;
let getMainWindow: (() => BrowserWindow | null) | null = null;
let lastFull: CoreStateDto | null = null;
let lastTick: CoreTickDto | null = null;
let started = false;
let verbose = false;
let stateCount = 0;

function shellTarget(): BrowserWindow | null {
  if (testShell && !testShell.isDestroyed()) return testShell;
  return getMainWindow?.() ?? null;
}

function sendToShell(channel: string, payload: unknown): void {
  const target = shellTarget();
  if (target && !target.isDestroyed()) target.webContents.send(channel, payload);
}

function fromCore(event: IpcMainEvent): boolean {
  return !!core && !core.isDestroyed() && event.sender.id === core.webContents.id;
}

function fromShell(event: IpcMainEvent): boolean {
  const target = shellTarget();
  return !!target && !target.isDestroyed() && event.sender.id === target.webContents.id;
}

function mergedState(): CoreStateDto | null {
  if (!lastFull) return null;
  if (!lastTick) return lastFull;
  return { ...lastFull, ...lastTick };
}

function createToneWav(): Promise<{ path: string; size: number }> {
  return (async () => {
    const dir = join(os.tmpdir(), 'onda-core-spike');
    await mkdir(dir, { recursive: true });
    const path = join(dir, 'tone.wav');
    const sampleRate = 44100;
    const seconds = 10;
    const channels = 1;
    const bits = 16;
    const samples = sampleRate * seconds;
    const dataSize = samples * channels * (bits / 8);
    const buffer = Buffer.alloc(44 + dataSize);

    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + dataSize, 4);
    buffer.write('WAVE', 8);
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20);
    buffer.writeUInt16LE(channels, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(sampleRate * channels * (bits / 8), 28);
    buffer.writeUInt16LE(channels * (bits / 8), 32);
    buffer.writeUInt16LE(bits, 34);
    buffer.write('data', 36);
    buffer.writeUInt32LE(dataSize, 40);
    for (let i = 0; i < samples; i += 1) {
      const value = Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 0.2;
      buffer.writeInt16LE(Math.round(value * 32767), 44 + i * 2);
    }

    await writeFile(path, buffer);
    return { path, size: buffer.length };
  })();
}

async function runAutoPlay(): Promise<void> {
  const enabled =
    process.env.ONDA_CORE_SPIKE_AUTOPLAY === '1' || process.env.ONDA_CORE_SHELL_AUTOPLAY === '1';
  if (!enabled) return;
  try {
    const tone = await createToneWav();
    await addAllowedRoot(join(os.tmpdir(), 'onda-core-spike'));
    const track: MediaFile = {
      id: tone.path,
      name: 'core-spike-tone.wav',
      path: tone.path,
      extension: 'wav',
      mimeType: 'audio/wav',
      size: tone.size,
      type: 'audio',
      addedAt: Date.now(),
      playCount: 0
    };
    logger.info('core-service', `autoplay tone prepared: ${tone.path}`);
    core?.webContents.send('core:command', { type: 'load', track, autoplay: true });
  } catch (error) {
    logger.error('core-service', 'autoplay tone failed', error);
  }
}

function registerIpc(): void {
  ipcMain.on('core:command', (event, command: unknown) => {
    if (!fromShell(event) || !core || core.isDestroyed()) return;
    if (verbose) {
      const type =
        command && typeof command === 'object' && 'type' in command
          ? String((command as { type: unknown }).type)
          : 'unknown';
      logger.info('core-service', `command → core: ${type}`);
    }
    core.webContents.send('core:command', command);
  });

  ipcMain.on('core:ready', (event) => {
    if (!fromCore(event)) return;
    logger.info('core-service', 'core ready');
    sendToShell('core:ready', true);
    void runAutoPlay();
  });

  ipcMain.on('core:error', (event, message: unknown) => {
    if (!fromCore(event)) return;
    logger.warn('core-service', `core error: ${String(message)}`);
    sendToShell('core:error', message);
  });

  ipcMain.on('core:state', (event, state: unknown) => {
    if (!fromCore(event) || !state || typeof state !== 'object') return;
    lastFull = state as CoreStateDto;
    sendToShell('core:state', lastFull);
    if (verbose) {
      logger.info(
        'core-service',
        `full rev=${lastFull.revision} track=${lastFull.current?.name ?? 'none'} ` +
          `queue=${lastFull.queue.length} playing=${lastFull.isPlaying}`
      );
    }
  });

  ipcMain.on('core:viz', (event, bins: unknown) => {
    if (!fromCore(event)) return;
    sendToShell('core:viz', bins);
  });

  ipcMain.on('core:tick', (event, tick: unknown) => {
    if (!fromCore(event) || !tick || typeof tick !== 'object') return;
    lastTick = tick as CoreTickDto;
    sendToShell('core:tick', lastTick);
    stateCount += 1;
    if (verbose && (stateCount <= 40 || stateCount % 16 === 0)) {
      logger.info(
        'core-service',
        `tick rev=${lastTick.revision} intent=${lastTick.isPlaying} ` +
          `engine=${lastTick.enginePlaying} time=${Number(lastTick.currentTime).toFixed(1)}/` +
          `${Number(lastTick.duration).toFixed(1)} error=${lastTick.error ?? 'none'}`
      );
    }
  });

  ipcMain.handle('core:getState', () => mergedState());
}

export function startCoreService(options: CoreServiceOptions): void {
  if (started) return;
  started = true;
  verbose = options.testShell || process.env.ONDA_CORE_SPIKE === '1';
  getMainWindow = options.getMainWindow ?? null;
  lastFull = null;
  lastTick = null;
  stateCount = 0;

  registerIpc();

  core = createWindow({
    width: 200,
    height: 120,
    show: false,
    frame: false,
    skipTaskbar: true,
    resizable: false,
    htmlFile: 'core.html',
    autoShow: false,
    webPreferences: {
      backgroundThrottling: false,
      autoplayPolicy: 'no-user-gesture-required'
    }
  });
  core.webContents.on('did-finish-load', () => logger.info('core-service', 'core renderer loaded'));
  core.webContents.on('console-message', (_event, level, message) => {
    if (verbose) logger.info('core-service', `core console [${level}]: ${message}`);
  });
  core.webContents.on('render-process-gone', (_event, details) => {
    logger.error('core-service', `core renderer gone: ${details.reason}`);
    sendToShell('core:error', `core renderer gone: ${details.reason}`);
  });
  core.on('closed', () => {
    core = null;
    logger.info('core-service', 'core window closed');
  });

  if (options.testShell) {
    testShell = createWindow({
      width: 760,
      height: 700,
      minWidth: 560,
      minHeight: 520,
      title: 'Onda — Core Spike',
      htmlFile: 'core-test.html',
      autoShow: true,
      webPreferences: { backgroundThrottling: false }
    });
    testShell.on('closed', () => {
      testShell = null;
      logger.info('core-service', 'test shell closed');
    });
  }

  app.once('before-quit', stopCoreService);
  logger.info(
    'core-service',
    `started (testShell=${options.testShell}, mainShell=${!!options.getMainWindow})`
  );
}

export function stopCoreService(): void {
  ipcMain.removeHandler('core:getState');
  ipcMain.removeAllListeners('core:command');
  ipcMain.removeAllListeners('core:ready');
  ipcMain.removeAllListeners('core:error');
  ipcMain.removeAllListeners('core:state');
  ipcMain.removeAllListeners('core:tick');
  ipcMain.removeAllListeners('core:viz');
  if (core && !core.isDestroyed()) core.destroy();
  if (testShell && !testShell.isDestroyed()) testShell.destroy();
  core = null;
  testShell = null;
  getMainWindow = null;
  lastFull = null;
  lastTick = null;
  started = false;
}
