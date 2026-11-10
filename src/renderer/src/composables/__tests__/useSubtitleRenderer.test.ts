import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  convert: vi.fn(),
  buildFontMap: vi.fn(),
  releaseFonts: vi.fn(),
  ensure: vi.fn(),
  newSeq: vi.fn(),
  isCurrent: vi.fn(),
  getVideo: vi.fn(),
  setVideo: vi.fn(),
  clearVideo: vi.fn(),
  destroyInstance: vi.fn(),
  createInstance: vi.fn(),
  saveLast: vi.fn(),
  getLast: vi.fn(),
  loggerInfo: vi.fn()
}));

vi.mock('@renderer/utils/subtitleConvert', () => ({ convertToAss: state.convert }));
vi.mock('../subtitleFonts', () => ({
  buildFontMap: state.buildFontMap,
  releaseFontBlobUrls: state.releaseFonts
}));
vi.mock('../subtitleState', () => ({
  ensureJASSUB: state.ensure,
  newSubtitleLoadSeq: state.newSeq,
  isSubtitleLoadCurrent: state.isCurrent,
  getVideoElement: state.getVideo,
  setVideoElement: state.setVideo,
  clearVideoElement: state.clearVideo,
  destroySubtitleInstance: state.destroyInstance,
  createJassubInstance: state.createInstance,
  saveLastSubtitleData: state.saveLast,
  getLastSubtitleData: state.getLast
}));
vi.mock('@shared/logger', () => ({
  logger: { info: state.loggerInfo, warn: vi.fn(), error: vi.fn() }
}));

import {
  destroySubtitleRenderer,
  getLastSubtitleData,
  initSubtitleRenderer,
  loadSubtitleTrack,
  preparePiPSubtitleData,
  removeSubtitleTrack
} from '../useSubtitleRenderer';

function track(overrides: Record<string, unknown> = {}) {
  return {
    format: 'srt',
    content: 'subs',
    fonts: [{ name: 'Arial', ext: 'ttf', data: [1, 2] }],
    ...overrides
  } as never;
}

beforeEach(() => {
  state.convert.mockReset();
  state.convert.mockReturnValue('[Script Info]');
  state.buildFontMap.mockReset();
  state.buildFontMap.mockResolvedValue({ Arial: 'data:font', Blob: 'blob:x' });
  state.releaseFonts.mockReset();
  state.ensure.mockReset();
  state.ensure.mockResolvedValue(function Ctor() {});
  state.newSeq.mockReset();
  state.newSeq.mockReturnValue(1);
  state.isCurrent.mockReset();
  state.isCurrent.mockReturnValue(true);
  state.getVideo.mockReset();
  state.getVideo.mockReturnValue({ id: 'video' });
  state.setVideo.mockReset();
  state.clearVideo.mockReset();
  state.destroyInstance.mockReset();
  state.createInstance.mockReset();
  state.createInstance.mockResolvedValue(true);
  state.saveLast.mockReset();
  state.getLast.mockReset();
  state.loggerInfo.mockReset();
  (window as unknown as { api?: unknown }).api = {};
});

describe('initialisation', () => {
  it('stores and clears the video element', () => {
    const video = {} as HTMLVideoElement;
    initSubtitleRenderer(video, document.body);
    expect(state.setVideo).toHaveBeenCalledWith(video);

    destroySubtitleRenderer();
    expect(state.destroyInstance).toHaveBeenCalled();
    expect(state.clearVideo).toHaveBeenCalled();
    expect(state.releaseFonts).toHaveBeenCalled();
  });
});

describe('loading tracks', () => {
  it('does nothing without a video element', async () => {
    state.getVideo.mockReturnValueOnce(null);
    await loadSubtitleTrack(track());
    expect(state.newSeq).not.toHaveBeenCalled();
  });

  it('removes the old track before converting', async () => {
    state.convert.mockReturnValueOnce('');
    await loadSubtitleTrack(track());

    expect(state.destroyInstance).toHaveBeenCalled();
    expect(state.buildFontMap).not.toHaveBeenCalled();
  });

  it('loads fonts, saves data and creates the instance', async () => {
    const fonts = [{ name: 'Arial', ext: 'ttf', data: [1, 2] }];
    await loadSubtitleTrack(track({ fonts }));

    expect(state.buildFontMap).toHaveBeenCalledWith('[Script Info]', fonts);
    expect(state.ensure).toHaveBeenCalled();
    expect(state.saveLast).toHaveBeenCalledWith({
      subContent: '[Script Info]',
      fonts,
      availableFonts: { Arial: 'data:font', Blob: 'blob:x' }
    });
    expect(state.createInstance).toHaveBeenCalledWith(expect.any(Function), {
      subContent: '[Script Info]',
      fonts: [new Uint8Array([1, 2])],
      availableFonts: { Arial: 'data:font', Blob: 'blob:x' },
      isCurrent: expect.any(Function)
    });
    expect(state.loggerInfo).toHaveBeenCalledWith(
      'Subtitles',
      expect.stringContaining('format=srt fonts=1')
    );
  });

  it('defaults missing fonts', async () => {
    await loadSubtitleTrack(track({ fonts: undefined }));

    expect(state.buildFontMap).toHaveBeenCalledWith('[Script Info]', []);
    expect(state.saveLast).toHaveBeenCalledWith(expect.objectContaining({ fonts: [] }));
    expect(state.createInstance.mock.calls[0][1].fonts).toEqual([]);
  });

  it('stops when JASSUB cannot be loaded', async () => {
    state.ensure.mockResolvedValueOnce(null);
    await loadSubtitleTrack(track());

    expect(state.saveLast).not.toHaveBeenCalled();
    expect(state.createInstance).not.toHaveBeenCalled();
  });

  it('stops when the load becomes stale', async () => {
    state.isCurrent.mockReturnValueOnce(false);
    await loadSubtitleTrack(track());

    expect(state.saveLast).not.toHaveBeenCalled();
    expect(state.createInstance).not.toHaveBeenCalled();
  });

  it('exposes the current check to the instance factory', async () => {
    await loadSubtitleTrack(track());
    const isCurrent = state.createInstance.mock.calls[0][1].isCurrent;
    expect(isCurrent()).toBe(true);
    expect(state.isCurrent).toHaveBeenCalled();
  });

  it('removes the active instance', () => {
    removeSubtitleTrack();
    expect(state.destroyInstance).toHaveBeenCalledTimes(1);
  });

  it('re-exports the last subtitle data', () => {
    state.getLast.mockReturnValue({ subContent: '' });
    expect(getLastSubtitleData()).toEqual({ subContent: '' });
  });
});

describe('PiP subtitle preparation', () => {
  beforeEach(() => {
    (window as unknown as { api: unknown }).api = {
      listEmbeddedSubtitles: vi.fn(async () => [
        { index: 1, language: 'eng' },
        { index: 2, language: 'pol' }
      ]),
      extractEmbeddedSubtitle: vi.fn(async () => ({
        format: 'srt',
        content: 'subs'
      })),
      extractSubtitleFonts: vi.fn(async () => [
        { name: 'Arial', ext: '', data: [1, 2] },
        { name: 'Empty', data: undefined }
      ])
    };
  });

  it('returns null without embedded subtitles', async () => {
    (window as any).api.listEmbeddedSubtitles.mockResolvedValueOnce([]);
    await expect(preparePiPSubtitleData('D:/v.mkv')).resolves.toBeNull();
  });

  it('prefers the Polish track and maps fonts', async () => {
    const result = await preparePiPSubtitleData('D:/v.mkv');

    expect((window as any).api.extractEmbeddedSubtitle).toHaveBeenCalledWith('D:/v.mkv', 2);
    expect(result).toEqual({
      subContent: '[Script Info]',
      fonts: [
        { name: 'Arial', ext: 'ttf', data: [1, 2] },
        { name: 'Empty', ext: 'ttf', data: [] }
      ],
      availableFonts: { Arial: 'data:font' }
    });
  });

  it('uses the first track when no Polish track exists', async () => {
    (window as any).api.listEmbeddedSubtitles.mockResolvedValueOnce([
      { index: 5, language: 'eng' }
    ]);
    await preparePiPSubtitleData('D:/v.mkv');
    expect((window as any).api.extractEmbeddedSubtitle).toHaveBeenCalledWith('D:/v.mkv', 5);
  });

  it('returns null when extraction fails or conversion is empty', async () => {
    (window as any).api.extractEmbeddedSubtitle.mockResolvedValueOnce(null);
    await expect(preparePiPSubtitleData('D:/v.mkv')).resolves.toBeNull();

    (window as any).api.extractEmbeddedSubtitle.mockResolvedValueOnce({
      format: 'srt',
      content: 'x'
    });
    state.convert.mockReturnValueOnce('');
    await expect(preparePiPSubtitleData('D:/v.mkv')).resolves.toBeNull();
  });

  it('works without the bridge', async () => {
    delete (window as unknown as { api?: unknown }).api;
    await expect(preparePiPSubtitleData('D:/v.mkv')).resolves.toBeNull();
  });
});
