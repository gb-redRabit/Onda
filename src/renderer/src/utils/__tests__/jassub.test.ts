import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('jassub/dist/worker/worker.js?worker&url', () => ({ default: 'worker.js' }));
vi.mock('jassub/dist/wasm/jassub-worker.wasm?url', () => ({ default: 'worker.wasm' }));
vi.mock('jassub/dist/wasm/jassub-worker-modern.wasm?url', () => ({ default: 'modern.wasm' }));
vi.mock('jassub/dist/default.woff2?url', () => ({ default: 'font.woff2' }));

import { createJassub, loadJassubWasmDataUrls } from '../jassub';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset().mockImplementation(async (url: string) => ({
    arrayBuffer: async () => new TextEncoder().encode(url).buffer
  }));
  vi.stubGlobal('fetch', fetchMock);
});

describe('loadJassubWasmDataUrls', () => {
  it('fetches both wasm files and returns base64 data urls', async () => {
    const result = await loadJassubWasmDataUrls();

    expect(fetchMock).toHaveBeenCalledWith('worker.wasm');
    expect(fetchMock).toHaveBeenCalledWith('modern.wasm');
    expect(result.wasmDataUrl).toBe('data:application/wasm;base64,' + btoa('worker.wasm'));
    expect(result.modernWasmDataUrl).toBe('data:application/wasm;base64,' + btoa('modern.wasm'));
  });
});

describe('createJassub', () => {
  let captured: Record<string, unknown> | null = null;

  class FakeJassub {
    ready = Promise.resolve();
    constructor(options: Record<string, unknown>) {
      captured = options;
    }
  }

  beforeEach(() => {
    captured = null;
  });

  const video = {} as HTMLVideoElement;
  const fonts = [new Uint8Array([1, 2])];

  it('creates an instance with defaults', async () => {
    const instance = await createJassub(FakeJassub as never, {
      video,
      subContent: 'sub',
      fonts,
      availableFonts: {}
    });

    expect(instance).toBeInstanceOf(FakeJassub);
    expect(captured).toMatchObject({
      video,
      subContent: 'sub',
      workerUrl: 'worker.js',
      wasmUrl: 'worker.wasm',
      modernWasmUrl: 'modern.wasm',
      timeOffset: 0,
      queryFonts: 'local',
      fonts,
      defaultFont: 'liberation sans'
    });
  });

  it('adds the bundled fallback font', async () => {
    await createJassub(FakeJassub as never, {
      video,
      subContent: 'sub',
      fonts: [],
      availableFonts: {}
    });

    expect((captured!.availableFonts as Record<string, string>)['liberation sans']).toBe(
      'font.woff2'
    );
  });

  it('keeps an explicitly supplied fallback font', async () => {
    await createJassub(FakeJassub as never, {
      video,
      subContent: 'sub',
      fonts: [],
      availableFonts: {},
      defaultFont: 'custom.woff2'
    });

    expect(captured).toMatchObject({ defaultFont: 'custom.woff2' });
    expect((captured!.availableFonts as Record<string, string>)['liberation sans']).toBeUndefined();
  });

  it('keeps a supplied liberation sans font', async () => {
    await createJassub(FakeJassub as never, {
      video,
      subContent: 'sub',
      fonts: [],
      availableFonts: { 'liberation sans': 'custom-liberation.woff2' }
    });

    expect((captured!.availableFonts as Record<string, string>)['liberation sans']).toBe(
      'custom-liberation.woff2'
    );
  });

  it('tolerates missing available fonts', async () => {
    await createJassub(
      FakeJassub as never,
      {
        video,
        subContent: 'sub',
        fonts: []
      } as never
    );

    expect((captured!.availableFonts as Record<string, string>)['liberation sans']).toBe(
      'font.woff2'
    );
  });

  it('honours overrides', async () => {
    await createJassub(FakeJassub as never, {
      video,
      subContent: 'sub',
      fonts,
      availableFonts: { arial: 'arial.woff2' },
      timeOffset: 2,
      queryFonts: false,
      workerUrlOverride: 'w.js',
      wasmUrlOverride: 'w.wasm',
      modernWasmUrlOverride: 'm.wasm'
    });

    expect(captured).toMatchObject({
      timeOffset: 2,
      queryFonts: false,
      workerUrl: 'w.js',
      wasmUrl: 'w.wasm',
      modernWasmUrl: 'm.wasm',
      availableFonts: expect.objectContaining({ arial: 'arial.woff2' })
    });
  });
});
