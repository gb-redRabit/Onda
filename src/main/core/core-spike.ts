import { app, ipcMain, type BrowserWindow, type IpcMainEvent } from 'electron';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import os from 'os';
import { logger } from '../../shared/logger';
import { addAllowedRoot } from '../media/media-server';
import { createWindow } from '../windows/window-factory';
import type { CoreStateDto } from '../../shared/types/ipc/channels-core';
import type { MediaFile } from '../../shared/types/media';

// Spike Fazy 1 (plan #23). Cel: udowodnić, że ukryty renderer może być jedynym
// właścicielem audio i publikować stan do osobnego okna. Kod jest celowo
// odizolowany i uruchamiany tylko przez ONDA_CORE_SPIKE=1 — nie wpływa na
// normalny start aplikacji.

let core: BrowserWindow | null = null;
let shell: BrowserWindow | null = null;
let lastState: CoreStateDto | null = null;
let started = false;
let stateCount = 0;

function fromCore(event: IpcMainEvent): boolean {
  return !!core && !core.isDestroyed() && event.sender.id === core.webContents.id;
}

function fromShell(event: IpcMainEvent): boolean {
  return !!shell && !shell.isDestroyed() && event.sender.id === shell.webContents.id;
}

function sendToShell(channel: string, payload: unknown): void {
  if (shell && !shell.isDestroyed()) shell.webContents.send(channel, payload);
}

function createToneWav(): Promise<{ path: string; size: number }> {
  return (async () => {
    const dir = join(os.tmpdir(), 'onda-core-spike');
    await mkdir(dir, { recursive: true });
    const path = join(dir, 'tone.wav');
    const sampleRate = 44100;
    const seconds = 3;
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
  if (process.env.ONDA_CORE_SPIKE_AUTOPLAY !== '1') return;
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
    logger.info('core-spike', `autoplay tone prepared: ${tone.path}`);
    logger.info('core-spike', 'autoplay → core: load');
    core?.webContents.send('core:command', { type: 'load', track, autoplay: true });
  } catch (error) {
    logger.error('core-spike', 'autoplay tone failed', error);
  }
}

export function startCoreSpike(): void {
  if (started) return;
  started = true;
  stateCount = 0;

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
  core.webContents.on('did-finish-load', () => logger.info('core-spike', 'core renderer loaded'));
  core.webContents.on('console-message', (_event, level, message) => {
    logger.info('core-spike', `core console [${level}]: ${message}`);
  });
  core.webContents.on('render-process-gone', (_event, details) => {
    logger.error('core-spike', `core renderer gone: ${details.reason}`);
    sendToShell('core:error', `core renderer gone: ${details.reason}`);
  });
  core.on('closed', () => {
    core = null;
    logger.info('core-spike', 'core window closed');
  });

  shell = createWindow({
    width: 760,
    height: 700,
    minWidth: 560,
    minHeight: 520,
    title: 'Onda — Core Spike',
    htmlFile: 'core-test.html',
    autoShow: true,
    webPreferences: { backgroundThrottling: false }
  });
  shell.on('closed', () => {
    shell = null;
    logger.info('core-spike', 'test shell closed');
  });

  ipcMain.on('core:command', (event, command: unknown) => {
    if (!fromShell(event) || !core || core.isDestroyed()) return;
    const type =
      command && typeof command === 'object' && 'type' in command
        ? String((command as { type: unknown }).type)
        : 'unknown';
    logger.info('core-spike', `command → core: ${type}`);
    core.webContents.send('core:command', command);
  });

  ipcMain.on('core:ready', (event) => {
    if (!fromCore(event)) return;
    logger.info('core-spike', 'core ready');
    sendToShell('core:ready', true);
    void runAutoPlay();
  });

  ipcMain.on('core:error', (event, message: unknown) => {
    if (!fromCore(event)) return;
    logger.warn('core-spike', `core error: ${String(message)}`);
    sendToShell('core:error', message);
  });

  ipcMain.on('core:state', (event, state: unknown) => {
    if (!fromCore(event) || !state || typeof state !== 'object') return;
    lastState = state as CoreStateDto;
    sendToShell('core:state', lastState);
    stateCount += 1;
    const diagnose = stateCount <= 40 || !!lastState.error || lastState.enginePlaying;
    if (diagnose && (stateCount <= 40 || stateCount % 8 === 0)) {
      logger.info(
        'core-spike',
        `state rev=${lastState.revision} intent=${lastState.isPlaying} ` +
          `engine=${lastState.enginePlaying} loading=${lastState.isLoading} ` +
          `time=${Number(lastState.currentTime).toFixed(1)}/${Number(lastState.duration).toFixed(1)} ` +
          `error=${lastState.error ?? 'none'}`
      );
    }
  });

  ipcMain.handle('core:getState', () => lastState);

  app.once('before-quit', stopCoreSpike);
  logger.info('core-spike', 'started');
}

export function stopCoreSpike(): void {
  ipcMain.removeHandler('core:getState');
  ipcMain.removeAllListeners('core:command');
  ipcMain.removeAllListeners('core:ready');
  ipcMain.removeAllListeners('core:error');
  ipcMain.removeAllListeners('core:state');
  if (core && !core.isDestroyed()) core.destroy();
  if (shell && !shell.isDestroyed()) shell.destroy();
  core = null;
  shell = null;
  lastState = null;
  started = false;
}
