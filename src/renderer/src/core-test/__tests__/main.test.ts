import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  send: vi.fn(),
  invoke: vi.fn(),
  on: vi.fn(),
  handlers: {} as Record<string, (...args: unknown[]) => void>,
  getState: null as unknown,
  libraryChunk: null as unknown,
  openFile: null as unknown
}));

function createDom(): void {
  document.body.innerHTML = `
    <span id="core-status">łączenie…</span>
    <div id="title"></div>
    <div id="artist"></div>
    <div id="bar"></div>
    <span id="time"></span>
    <span id="duration"></span>
    <span id="revision"></span>
    <span id="playing"></span>
    <span id="loading"></span>
    <span id="error"></span>
    <span id="path"></span>
    <button id="play"></button>
    <button id="prev"></button>
    <button id="next"></button>
    <button id="back10"></button>
    <button id="fwd10"></button>
    <button id="volDown"></button>
    <button id="volUp"></button>
    <button id="load-library"></button>
    <button id="play-selected"></button>
    <button id="open-file"></button>
    <select id="library"></select>
    <pre id="log"></pre>
  `;
}

function el<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

function text(id: string): string {
  return el(id).textContent ?? '';
}

function click(id: string): void {
  el<HTMLButtonElement>(id).click();
}

function emit(event: string, ...args: unknown[]): void {
  state.handlers[event]?.(...args);
}

async function flush(): Promise<void> {
  for (let i = 0; i < 8; i += 1) await Promise.resolve();
}

function coreState(overrides: Record<string, unknown> = {}) {
  return {
    revision: 7,
    current: {
      id: 'a',
      name: 'a.mp3',
      path: 'C:\\music\\a.mp3',
      extension: 'mp3',
      mimeType: 'audio/mpeg',
      size: 1,
      type: 'audio',
      metadata: { title: 'Song', artist: 'Artist' },
      addedAt: 0,
      playCount: 0
    },
    currentTime: 65,
    duration: 125,
    buffered: 0,
    isPlaying: true,
    enginePlaying: true,
    isLoading: false,
    error: null,
    volume: 0.5,
    ...overrides
  };
}

async function loadModule(): Promise<void> {
  vi.resetModules();
  await import('../main');
  await flush();
}

beforeEach(() => {
  createDom();
  state.send.mockReset();
  state.invoke.mockReset();
  state.on.mockReset();
  state.handlers = {};
  state.getState = null;
  state.libraryChunk = null;
  state.openFile = { canceled: true, filePaths: [] };

  state.on.mockImplementation((event: string, cb: (...args: unknown[]) => void) => {
    state.handlers[event] = cb;
  });
  state.invoke.mockImplementation(async (channel: string) => {
    if (channel === 'core:getState') return state.getState;
    if (channel === 'library:loadScannedChunk') return state.libraryChunk;
    if (channel === 'dialog:openFile') return state.openFile;
    return undefined;
  });
  (window as { api?: unknown }).api = {
    send: state.send,
    invoke: state.invoke,
    on: state.on
  };
});

afterEach(() => {
  document.body.innerHTML = '';
  delete (window as { api?: unknown }).api;
});

describe('startup', () => {
  it('writes a startup log and registers the core listeners', async () => {
    await loadModule();

    expect(text('log')).toContain('shell gotowy');
    expect(state.on).toHaveBeenCalledWith('core:state', expect.any(Function));
    expect(state.on).toHaveBeenCalledWith('core:tick', expect.any(Function));
    expect(state.on).toHaveBeenCalledWith('core:ready', expect.any(Function));
    expect(state.on).toHaveBeenCalledWith('core:error', expect.any(Function));
    expect(state.invoke).toHaveBeenCalledWith('core:getState');
  });

  it('renders an existing core state and marks the core ready', async () => {
    state.getState = coreState();
    await loadModule();

    expect(text('core-status')).toBe('Core gotowy');
    expect(el('core-status').className).toBe('badge ok');
    expect(text('title')).toBe('Song');
    expect(text('artist')).toBe('Artist');
    expect(text('path')).toBe('C:\\music\\a.mp3');
    expect(text('bar')).toBe('');
    expect(el('bar').style.width).toBe('52%');
    expect(text('time')).toBe('1:05');
    expect(text('duration')).toBe('2:05');
    expect(text('revision')).toBe('rewizja 7');
    expect(text('play')).toBe('⏸');
    expect(text('playing')).toBe('true / true');
    expect(el('playing').className).toBe('ok');
    expect(text('loading')).toBe('false');
    expect(text('error')).toBe('—');
    expect(el('error').className).toBe('muted');
  });

  it('logs an empty stored state and reports getState failures', async () => {
    await loadModule();
    expect(text('log')).toContain('brak zapisanego stanu Core');

    document.body.innerHTML = '';
    createDom();
    state.invoke.mockRejectedValueOnce(new Error('ipc down'));
    await loadModule();
    expect(text('log')).toContain('getState: ipc down');
  });
});

describe('state rendering', () => {
  it('falls back to placeholders when nothing is playing', async () => {
    await loadModule();

    emit(
      'core:state',
      coreState({
        current: null,
        currentTime: 0,
        duration: 0,
        isPlaying: false,
        enginePlaying: false,
        error: 'boom'
      })
    );

    expect(text('title')).toBe('Nic nie gra');
    expect(text('artist')).toBe('—');
    expect(text('path')).toBe('—');
    expect(el('bar').style.width).toBe('0%');
    expect(text('time')).toBe('0:00');
    expect(text('duration')).toBe('0:00');
    expect(text('play')).toBe('▶');
    expect(el('playing').className).toBe('muted');
    expect(text('error')).toBe('boom');
    expect(el('error').className).toBe('bad');
  });

  it('rounds time values and clamps the progress bar', async () => {
    await loadModule();

    emit('core:state', coreState({ currentTime: 59, duration: 60 }));
    expect(text('time')).toBe('0:59');
    expect(text('duration')).toBe('1:00');
    expect(el('bar').style.width).toBe('98%');

    emit('core:state', coreState({ currentTime: 999, duration: 60 }));
    expect(el('bar').style.width).toBe('100%');

    emit('core:state', coreState({ currentTime: -5, duration: 60 }));
    expect(text('time')).toBe('0:00');
  });

  it('applies tick updates only after a full state', async () => {
    await loadModule();

    emit('core:tick', { currentTime: 30, revision: 9 });
    expect(text('revision')).toBe('');

    emit('core:state', coreState({ currentTime: 30, revision: 8 }));
    emit('core:tick', { currentTime: 90, isPlaying: false, revision: 9 });
    expect(text('time')).toBe('1:30');
    expect(text('revision')).toBe('rewizja 9');
    expect(text('play')).toBe('▶');
  });

  it('handles ready and error events', async () => {
    await loadModule();

    emit('core:ready');
    expect(text('core-status')).toBe('Core gotowy');
    expect(el('core-status').className).toBe('badge ok');
    expect(text('log')).toContain('Core zgłosił gotowość');

    emit('core:error', 'fatal');
    expect(text('core-status')).toBe('Błąd Core');
    expect(el('core-status').className).toBe('badge bad');
    expect(text('log')).toContain('Core error: fatal');
  });
});

describe('transport controls', () => {
  it('sends transport commands and logs them', async () => {
    await loadModule();

    click('play');
    click('prev');
    click('next');

    expect(state.send).toHaveBeenCalledWith('core:command', { type: 'toggle' });
    expect(state.send).toHaveBeenCalledWith('core:command', { type: 'prev' });
    expect(state.send).toHaveBeenCalledWith('core:command', { type: 'next' });
    expect(text('log')).toContain('→ toggle');
  });

  it('seeks by ten seconds within bounds', async () => {
    await loadModule();

    click('back10');
    expect(state.send).toHaveBeenLastCalledWith('core:command', { type: 'seek', time: 0 });

    emit('core:state', coreState({ currentTime: 5 }));
    click('back10');
    expect(state.send).toHaveBeenLastCalledWith('core:command', { type: 'seek', time: 0 });

    click('fwd10');
    expect(state.send).toHaveBeenLastCalledWith('core:command', { type: 'seek', time: 15 });
  });

  it('adjusts and clamps the volume', async () => {
    await loadModule();

    click('volDown');
    expect(state.send).toHaveBeenLastCalledWith('core:command', {
      type: 'setVolume',
      value: 0.8 - 0.1
    });

    emit('core:state', coreState({ volume: 0.05 }));
    click('volDown');
    expect(state.send).toHaveBeenLastCalledWith('core:command', {
      type: 'setVolume',
      value: 0
    });

    emit('core:state', coreState({ volume: 0.95 }));
    click('volUp');
    expect(state.send).toHaveBeenLastCalledWith('core:command', {
      type: 'setVolume',
      value: 1
    });
  });
});

describe('library', () => {
  it('loads audio files into the select', async () => {
    state.libraryChunk = {
      total: 5,
      files: [
        { path: 'C:\\a.mp3', name: 'a.mp3', type: 'audio' },
        { path: 'C:\\b.mp4', name: 'b.mp4', type: 'video' },
        { path: 'C:\\c.flac', name: 'c.flac', type: 'audio' }
      ]
    };
    await loadModule();

    click('load-library');
    await flush();

    expect(state.invoke).toHaveBeenCalledWith('library:loadScannedChunk', 0, 2000);
    const options = el<HTMLSelectElement>('library').querySelectorAll('option');
    expect(options).toHaveLength(2);
    expect(options[0].value).toBe('C:\\a.mp3');
    expect(options[0].textContent).toBe('a.mp3');
    expect(options[0].title).toBe('C:\\a.mp3');
    expect(text('log')).toContain('wczytano 2 utworów audio (z 5 plików)');
  });

  it('handles empty chunks, audio-less chunks and errors', async () => {
    state.libraryChunk = null;
    await loadModule();
    click('load-library');
    await flush();
    expect(text('log')).toContain('biblioteka jest pusta');

    state.libraryChunk = { total: 2, files: [{ path: 'C:\\b.mp4', type: 'video' }] };
    state.invoke.mockClear();
    click('load-library');
    await flush();
    expect(text('log')).toContain('brak utworów audio w pierwszym wycinku biblioteki');

    state.invoke.mockImplementationOnce(async () => {
      throw new Error('scan failed');
    });
    click('load-library');
    await flush();
    expect(text('log')).toContain('błąd biblioteki: scan failed');
  });

  it('plays the selected library track or explains what is missing', async () => {
    state.libraryChunk = {
      total: 1,
      files: [{ path: 'C:\\a.mp3', name: 'a.mp3', type: 'audio' }]
    };
    await loadModule();

    click('play-selected');
    expect(text('log')).toContain('najpierw wczytaj bibliotekę');

    click('load-library');
    await flush();
    el<HTMLSelectElement>('library').value = 'C:\\a.mp3';
    click('play-selected');

    expect(state.send).toHaveBeenLastCalledWith('core:command', {
      type: 'load',
      track: expect.objectContaining({ path: 'C:\\a.mp3', type: 'audio' }),
      autoplay: true
    });
  });
});

describe('open file', () => {
  it('loads a chosen audio file into the core', async () => {
    state.openFile = { canceled: false, filePaths: ['C:\\Music\\Track.FLAC'] };
    await loadModule();

    click('open-file');
    await flush();

    expect(state.invoke).toHaveBeenCalledWith('dialog:openFile', {
      properties: ['openFile'],
      filters: [{ name: 'Audio', extensions: ['mp3', 'flac', 'wav', 'ogg', 'm4a', 'aac'] }]
    });
    expect(state.send).toHaveBeenLastCalledWith('core:command', {
      type: 'load',
      track: expect.objectContaining({
        id: 'C:\\Music\\Track.FLAC',
        name: 'Track.FLAC',
        path: 'C:\\Music\\Track.FLAC',
        extension: 'flac',
        mimeType: 'audio/flac',
        size: 0,
        type: 'audio',
        playCount: 0
      }),
      autoplay: true
    });
  });

  it('uses the default mime type for extensionless files', async () => {
    state.openFile = { canceled: false, filePaths: ['/music/noext'] };
    await loadModule();

    click('open-file');
    await flush();

    expect(state.send).toHaveBeenLastCalledWith('core:command', {
      type: 'load',
      track: expect.objectContaining({
        name: 'noext',
        extension: '',
        mimeType: 'audio/mpeg'
      }),
      autoplay: true
    });
  });

  it('does nothing on cancel and logs failures', async () => {
    await loadModule();
    click('open-file');
    await flush();
    expect(state.send).not.toHaveBeenCalled();

    state.invoke.mockImplementationOnce(async () => {
      throw new Error('dialog broke');
    });
    click('open-file');
    await flush();
    expect(text('log')).toContain('błąd otwierania pliku: dialog broke');
  });
});
