import { describe, it, expect, vi } from 'vitest';

// Capture the channels the module registers without a real ipcMain.
const { handled } = vi.hoisted(() => ({ handled: [] as string[] }));

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string) => {
      handled.push(channel);
    },
    on: () => {},
    once: () => {}
  }
}));

import { registerPipHandlers } from '../windows/window-ipc-pip';
import type { PipManager } from '../pip/pip-manager';
import type { AudioPipManager } from '../pip/audio-pip-manager';

const pipManager = {
  show: () => true,
  stop: () => {},
  showPreview: () => true,
  hidePreview: () => {},
  updatePreview: () => {},
  preload: () => {},
  loadTrack: () => {},
  updateSubtitle: () => {}
} as unknown as PipManager;

const audioPipManager = {
  show: () => {},
  hide: () => {},
  autoHideNow: () => {},
  prewarm: () => {},
  showPreview: () => true,
  hidePreview: () => {},
  updatePreview: () => {},
  setLayout: () => {},
  update: () => {}
} as unknown as AudioPipManager;

describe('registerPipHandlers', () => {
  it('registers every video- and audio-PiP channel', () => {
    registerPipHandlers({ pipManager, audioPipManager });

    expect(handled).toEqual(
      expect.arrayContaining([
        'pip:start',
        'pip:stop',
        'pip:previewStart',
        'pip:previewStop',
        'pip:previewUpdate',
        'pip:preload',
        'pip:loadtrack',
        'pip:updateSubtitle',
        'audio-pip:show',
        'audio-pip:hide',
        'audio-pip:autoHide',
        'audio-pip:prewarm',
        'audio-pip:previewStart',
        'audio-pip:previewStop',
        'audio-pip:previewUpdate',
        'audio-pip:update'
      ])
    );
  });
});
