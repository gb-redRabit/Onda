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
  /** Aktywny shell (main lub compact), do którego router wysyła stan. */
  getShellWindow?: () => BrowserWindow | null;
}

let core: BrowserWindow | null = null;
let testShell: BrowserWindow | null = null;
let getShellWindow: (() => BrowserWindow | null) | null = null;
let lastFull: CoreStateDto | null = null;
let lastTick: CoreTickDto | null = null;
let started = false;
let verbose = false;
let stateCount = 0;
let shuttingDown = false;
let restarting = false;
let restartTimer: ReturnType<typeof setTimeout> | null = null;
let restartWatchdog: ReturnType<typeof setTimeout> | null = null;
let pendingRestore: CoreStateDto | null = null;
let hasStartedOnce = false;
let crashCount = 0;
let crashWindowStartedAt = 0;

const MAX_CORE_RESTARTS = 3;
const CRASH_WINDOW_MS = 60_000;
const RESTART_DELAY_MS = 400;

function shellTarget(): BrowserWindow | null {
  if (testShell && !testShell.isDestroyed()) return testShell;
  return getShellWindow?.() ?? null;
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

/**
 * Po restarcie renderera Core odtwarza ostatni znany stan: utwór, kolejkę,
 * pozycję, głośność, mute, shuffle i repeat. Historii nie da się odtworzyć
 * komendami IPC (nie ma settera) — ta część zostaje pusta.
 */
function restoreCoreState(state: CoreStateDto): void {
  const win = core;
  if (!win || win.isDestroyed()) return;
  const send = (command: Record<string, unknown>): void => {
    win.webContents.send('core:command', command);
  };

  if (!state.current) {
    send({ type: 'clear' });
    return;
  }

  send({
    type: 'load',
    track: state.current,
    autoplay: false,
    resume: false,
    queue: state.queue,
    pendingQueue: state.pendingQueue
  });
  if (state.currentTime > 0) send({ type: 'seek', time: state.currentTime });
  send({ type: 'setVolume', value: state.volume });
  if (state.isMuted) send({ type: 'toggleMute' });
  if (state.shuffle) send({ type: 'toggleShuffle' });
  const repeatCycles = state.repeat === 'one' ? 1 : state.repeat === 'all' ? 2 : 0;
  for (let i = 0; i < repeatCycles; i += 1) send({ type: 'cycleRepeat' });
  if (state.pipActive) send({ type: 'setPip', active: true, time: state.pipTime });
  if (state.isPlaying) send({ type: 'play' });
}

/** Recreate/reload Core po crashu, z limitem restartów w oknie czasowym. */
function scheduleCoreRestart(reason: string): void {
  if (shuttingDown || restarting) return;

  const now = Date.now();
  if (now - crashWindowStartedAt > CRASH_WINDOW_MS) {
    crashWindowStartedAt = now;
    crashCount = 0;
  }
  crashCount += 1;
  if (crashCount > MAX_CORE_RESTARTS) {
    logger.error(
      'core-service',
      `Core crashed ${crashCount} times within ${CRASH_WINDOW_MS}ms — giving up (${reason})`
    );
    sendToShell('core:error', `Core crashed repeatedly: ${reason}`);
    return;
  }

  pendingRestore = mergedState();
  // Nowy renderer Core zaczyna revision od 0 — stary cache w mainie i shellu
  // muszą zostać wyczyszczone, żeby niższe numery nie zostały odrzucone.
  lastFull = null;
  lastTick = null;
  stateCount = 0;
  restarting = true;
  const delay = RESTART_DELAY_MS * crashCount;
  logger.warn('core-service', `restarting Core in ${delay}ms (${reason})`);
  sendToShell('core:error', `Core restarting: ${reason}`);

  restartTimer = setTimeout(() => {
    restartTimer = null;
    if (shuttingDown) return;
    if (core && !core.isDestroyed()) {
      core.webContents.reload();
    } else {
      core = createCoreWindow();
    }
    restartWatchdog = setTimeout(() => {
      restartWatchdog = null;
      if (!restarting || shuttingDown) return;
      logger.warn('core-service', 'Core did not become ready after restart — retrying');
      restarting = false;
      scheduleCoreRestart('ready timeout');
    }, 10_000);
  }, delay);
}

function createCoreWindow(): BrowserWindow {
  const win = createWindow({
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
  win.webContents.on('did-finish-load', () => logger.info('core-service', 'core renderer loaded'));
  win.webContents.on('console-message', (_event, level, message) => {
    if (verbose) logger.info('core-service', `core console [${level}]: ${message}`);
  });
  win.webContents.on('render-process-gone', (_event, details) => {
    logger.error('core-service', `core renderer gone: ${details.reason}`);
    if (shuttingDown) return;
    scheduleCoreRestart(`render process gone: ${details.reason}`);
  });
  win.on('closed', () => {
    if (core === win) core = null;
    logger.info('core-service', 'core window closed');
    if (!shuttingDown && started) scheduleCoreRestart('window closed');
  });
  return win;
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
    restarting = false;
    if (restartWatchdog) {
      clearTimeout(restartWatchdog);
      restartWatchdog = null;
    }
    logger.info('core-service', 'core ready');
    sendToShell('core:ready', true);
    if (pendingRestore) {
      const state = pendingRestore;
      pendingRestore = null;
      restoreCoreState(state);
      return;
    }
    if (!hasStartedOnce) {
      hasStartedOnce = true;
      void runAutoPlay();
    }
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
  shuttingDown = false;
  restarting = false;
  crashCount = 0;
  crashWindowStartedAt = 0;
  hasStartedOnce = false;
  pendingRestore = null;
  verbose = options.testShell || process.env.ONDA_CORE_SPIKE === '1';
  getShellWindow = options.getShellWindow ?? null;
  lastFull = null;
  lastTick = null;
  stateCount = 0;

  registerIpc();
  core = createCoreWindow();

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
    `started (testShell=${options.testShell}, shell=${!!options.getShellWindow})`
  );
}

export function stopCoreService(): void {
  shuttingDown = true;
  if (restartTimer) {
    clearTimeout(restartTimer);
    restartTimer = null;
  }
  if (restartWatchdog) {
    clearTimeout(restartWatchdog);
    restartWatchdog = null;
  }
  restarting = false;
  pendingRestore = null;
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
  getShellWindow = null;
  lastFull = null;
  lastTick = null;
  started = false;
}
