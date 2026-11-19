import { handleIpc } from '../ipc/typed-handle';
import type { PipManager } from '../pip/pip-manager';
import type { AudioPipManager } from '../pip/audio-pip-manager';
import type { AudioPipLayoutOpts, PipLayoutOpts } from '../../shared/types/ipc/channels-pip';
import type { PipSubtitleData } from '../../shared/types/pip';

// Handlery IPC dla PiP wideo i audio, wyodrębnione z `window-ipc.ts`, aby
// sterowanie oknem i orkiestrację PiP można było analizować (i zmieniać) osobno.

// Jedno źródło prawdy dla kształtu napisów PiP (był zduplikowany w preload i main).
type PipSubtitlePayload = PipSubtitleData;

export function registerPipHandlers(context: {
  pipManager: PipManager;
  audioPipManager: AudioPipManager;
}): void {
  const { pipManager, audioPipManager } = context;

  handleIpc(
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

  handleIpc('pip:stop', () => {
    pipManager.stop();
    return true;
  });

  handleIpc('pip:previewStart', (_event, opts: PipLayoutOpts) => {
    return pipManager.showPreview(opts);
  });

  handleIpc('pip:previewStop', () => {
    pipManager.hidePreview();
    return true;
  });

  handleIpc('pip:previewUpdate', (_event, opts: PipLayoutOpts) => {
    pipManager.updatePreview(opts);
    return true;
  });

  handleIpc('pip:preload', (_event, videoSrc: string, subtitleData: PipSubtitlePayload | null) => {
    pipManager.preload(videoSrc, subtitleData);
  });

  handleIpc(
    'pip:loadtrack',
    (_event, videoSrc: string, subtitleData: PipSubtitlePayload | null) => {
      pipManager.loadTrack(videoSrc, subtitleData);
    }
  );

  handleIpc('pip:updateSubtitle', (_event, data: PipSubtitlePayload | null) => {
    pipManager.updateSubtitle(data);
  });

  handleIpc(
    'audio-pip:show',
    (_event: unknown, state: Record<string, unknown>, opts?: AudioPipLayoutOpts) => {
      audioPipManager.show(state, opts ?? {});
      return true;
    }
  );

  handleIpc('audio-pip:hide', () => {
    audioPipManager.hide();
    return true;
  });

  handleIpc('audio-pip:release', () => {
    audioPipManager.releaseWindow();
    return true;
  });

  handleIpc('audio-pip:autoHide', () => {
    audioPipManager.autoHideNow();
    return true;
  });

  handleIpc('audio-pip:prewarm', () => {
    audioPipManager.prewarm();
    return true;
  });

  handleIpc('audio-pip:previewStart', (_event: unknown, opts?: AudioPipLayoutOpts) => {
    return audioPipManager.showPreview(opts ?? {});
  });

  handleIpc('audio-pip:previewStop', () => {
    audioPipManager.hidePreview();
    return true;
  });

  handleIpc('audio-pip:previewUpdate', (_event: unknown, opts?: AudioPipLayoutOpts) => {
    audioPipManager.updatePreview(opts ?? {});
    return true;
  });

  handleIpc(
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
