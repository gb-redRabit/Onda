import { ipcMain } from 'electron';
import type { PipManager } from '../pip/pip-manager';
import type { AudioPipManager } from '../pip/audio-pip-manager';
import type { AudioPipLayoutOpts, PipLayoutOpts } from '../../shared/types/ipc/channels-pip';

// Handlery IPC dla PiP wideo i audio, wyodrębnione z `window-ipc.ts`, aby
// sterowanie oknem i orkiestrację PiP można było analizować (i zmieniać) osobno.

interface PipSubtitlePayload {
  subContent: string;
  fonts: Array<{ name: string; data: number[] }>;
  availableFonts: Record<string, string>;
}

export function registerPipHandlers(context: {
  pipManager: PipManager;
  audioPipManager: AudioPipManager;
}): void {
  const { pipManager, audioPipManager } = context;

  ipcMain.handle(
    'pip:start',
    async (
      _event,
      videoSrc: string,
      pipSettings?: {
        position?: string;
        width?: number;
        height?: number;
        startTime?: number;
        subtitle?: PipSubtitlePayload | null;
      }
    ) => {
      return pipManager.show({
        src: videoSrc,
        startTime: pipSettings?.startTime ?? 0,
        position: pipSettings?.position,
        width: pipSettings?.width,
        height: pipSettings?.height,
        subtitle: pipSettings?.subtitle ?? null
      });
    }
  );

  ipcMain.handle('pip:stop', () => {
    pipManager.stop();
    return true;
  });

  ipcMain.handle('pip:previewStart', (_event, opts: PipLayoutOpts) => {
    return pipManager.showPreview(opts);
  });

  ipcMain.handle('pip:previewStop', () => {
    pipManager.hidePreview();
    return true;
  });

  ipcMain.handle('pip:previewUpdate', (_event, opts: PipLayoutOpts) => {
    pipManager.updatePreview(opts);
    return true;
  });

  ipcMain.handle(
    'pip:preload',
    (_event, videoSrc: string, subtitleData: PipSubtitlePayload | null) => {
      pipManager.preload(videoSrc, subtitleData);
    }
  );

  ipcMain.handle(
    'pip:loadtrack',
    (_event, videoSrc: string, subtitleData: PipSubtitlePayload | null) => {
      pipManager.loadTrack(videoSrc, subtitleData);
    }
  );

  ipcMain.handle('pip:updateSubtitle', (_event, data: PipSubtitlePayload | null) => {
    pipManager.updateSubtitle(data);
  });

  ipcMain.handle(
    'audio-pip:show',
    (_event: unknown, state: Record<string, unknown>, opts?: AudioPipLayoutOpts) => {
      audioPipManager.show(state, opts ?? {});
      return true;
    }
  );

  ipcMain.handle('audio-pip:hide', () => {
    audioPipManager.hide();
    return true;
  });

  ipcMain.handle('audio-pip:autoHide', () => {
    audioPipManager.autoHideNow();
    return true;
  });

  ipcMain.handle('audio-pip:prewarm', () => {
    audioPipManager.prewarm();
    return true;
  });

  ipcMain.handle('audio-pip:previewStart', (_event: unknown, opts?: AudioPipLayoutOpts) => {
    return audioPipManager.showPreview(opts ?? {});
  });

  ipcMain.handle('audio-pip:previewStop', () => {
    audioPipManager.hidePreview();
    return true;
  });

  ipcMain.handle('audio-pip:previewUpdate', (_event: unknown, opts?: AudioPipLayoutOpts) => {
    audioPipManager.updatePreview(opts ?? {});
    return true;
  });

  ipcMain.handle(
    'audio-pip:update',
    (_event: unknown, state: Record<string, unknown>, opts?: AudioPipLayoutOpts) => {
      if (
        opts &&
        (opts.dock || opts.cornerElements || opts.edgeElements || opts.autoHide !== undefined)
      ) {
        audioPipManager.setLayout(opts);
      }
      audioPipManager.update(state);
      return true;
    }
  );
}
