import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn()
}));

vi.mock('@shared/logger', () => ({
  logger: { info: h.info, warn: h.warn, error: vi.fn(), debug: vi.fn() }
}));

import {
  attachMediaElementListeners,
  cleanupAudioElement,
  handleStreamSourceError,
  type MediaListenerDeps,
  type StreamErrorOps
} from '../audioEngineHelpers';
import { audioEvents } from '@renderer/utils/audioEvents';
import { toMediaStreamUrl } from '@renderer/utils/mediaUrl';

type Listener = (event?: unknown) => void;

function fakeElement(overrides: Partial<Record<string, unknown>> = {}) {
  const listeners = new Map<string, Listener>();
  const el = {
    duration: 120,
    currentTime: 5,
    volume: 1,
    src: '',
    crossOrigin: null as string | null,
    error: null as { code: number; message: string } | null,
    buffered: { length: 1, end: () => 60 },
    addEventListener: (type: string, callback: Listener) => listeners.set(type, callback),
    load: vi.fn(),
    pause: vi.fn(),
    removeAttribute: vi.fn(),
    ...overrides
  };
  return {
    el: el as unknown as HTMLAudioElement,
    fire: (type: string) => listeners.get(type)?.()
  };
}

function deps(overrides: Partial<MediaListenerDeps> = {}): MediaListenerDeps {
  return {
    onEnded: vi.fn(),
    onError: vi.fn(),
    loadStartTs: () => 0,
    onCanplay: vi.fn(),
    onPause: vi.fn(),
    onTimeUpdate: vi.fn(),
    ...overrides
  };
}

function streamOps(overrides: Partial<StreamErrorOps> = {}): StreamErrorOps {
  return {
    getStreamUrl: () => 'https://cdn/stream',
    getMode: () => 'proxy',
    getTriedDirect: () => false,
    getFinalRetried: () => false,
    setMode: vi.fn(),
    setTriedDirect: vi.fn(),
    setFinalRetried: vi.fn(),
    normalization: () => 1,
    isMuted: () => false,
    volume: () => 0.5,
    disconnectSourceNode: vi.fn(),
    disconnectSecondary: vi.fn(),
    connectAudio: vi.fn(),
    setGain: vi.fn(),
    ...overrides
  };
}

const emit = vi.spyOn(audioEvents, 'emit');

beforeEach(() => {
  emit.mockClear();
  h.info.mockClear();
  h.warn.mockClear();
});

describe('attachMediaElementListeners', () => {
  it('maps element events to audio events and callbacks', () => {
    const { el, fire } = fakeElement();
    const callbacks = deps();
    attachMediaElementListeners(el, callbacks);

    fire('durationchange');
    fire('ended');
    fire('play');
    fire('pause');
    fire('timeupdate');
    fire('loadedmetadata');
    fire('progress');
    fire('error');
    fire('loadstart');
    fire('loadeddata');
    fire('canplay');

    expect(emit).toHaveBeenCalledWith('durationChange', 120);
    expect(callbacks.onEnded).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith('playStateChange', true);
    expect(emit).toHaveBeenCalledWith('playStateChange', false);
    expect(callbacks.onPause).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith('timeUpdate', 5);
    expect(callbacks.onTimeUpdate).toHaveBeenCalledWith(5);
    expect(emit).toHaveBeenCalledWith('bufferChange', 0.5);
    expect(callbacks.onError).toHaveBeenCalledWith(el);
    expect(emit).toHaveBeenCalledWith('playable', undefined);
    expect(callbacks.onCanplay).toHaveBeenCalledWith(el);
    expect(h.info).toHaveBeenCalledWith('audioEngine', expect.stringContaining('loadstart +'));
    expect(h.info).toHaveBeenCalledWith('audioEngine', expect.stringContaining('canplay +'));
  });

  it('reports zero duration and zero buffering for unusual elements', () => {
    const { el, fire } = fakeElement({
      duration: 0,
      buffered: { length: 0, end: () => 10 }
    });
    attachMediaElementListeners(el, deps());

    fire('durationchange');
    fire('progress');

    expect(emit).toHaveBeenCalledWith('durationChange', 0);
    expect(emit).toHaveBeenCalledWith('bufferChange', 0);
  });

  it('treats a throwing buffered range as no progress', () => {
    const { el, fire } = fakeElement({
      buffered: {
        length: 1,
        end: () => {
          throw new Error('range');
        }
      }
    });
    attachMediaElementListeners(el, deps());

    fire('progress');

    expect(emit).toHaveBeenCalledWith('bufferChange', 0);
  });

  it('works without optional callbacks', () => {
    const { el, fire } = fakeElement();
    attachMediaElementListeners(el, {
      onEnded: vi.fn(),
      onError: vi.fn(),
      loadStartTs: () => 0,
      onCanplay: vi.fn()
    });

    expect(() => {
      fire('pause');
      fire('timeupdate');
    }).not.toThrow();
  });
});

describe('cleanupAudioElement', () => {
  it('does nothing without an element', () => {
    expect(() => cleanupAudioElement(null)).not.toThrow();
  });

  it('stops playback and releases the source', () => {
    const { el } = fakeElement();

    cleanupAudioElement(el);

    expect(el.pause).toHaveBeenCalledTimes(1);
    expect(el.removeAttribute).toHaveBeenCalledWith('src');
    expect(el.load).toHaveBeenCalledTimes(1);
  });
});

describe('handleStreamSourceError', () => {
  it('emits a track error for local files without a stream url', () => {
    const { el } = fakeElement({ error: { code: 4, message: 'missing' } });
    const ops = streamOps({ getStreamUrl: () => null });

    handleStreamSourceError(el, ops);

    expect(emit).toHaveBeenCalledWith('trackError', '4');
    expect(ops.setMode).not.toHaveBeenCalled();
  });

  it('uses unknown when the element reports no error object', () => {
    const { el } = fakeElement();
    handleStreamSourceError(el, streamOps({ getStreamUrl: () => null }));

    expect(emit).toHaveBeenCalledWith('trackError', 'unknown');
  });

  it('retries directly after exhausted proxy attempts', () => {
    const { el } = fakeElement();
    const ops = streamOps({
      normalization: () => 2,
      volume: () => 0.4
    });

    handleStreamSourceError(el, ops);

    expect(ops.setTriedDirect).toHaveBeenCalledWith(true);
    expect(ops.setMode).toHaveBeenCalledWith('direct');
    expect(ops.disconnectSourceNode).toHaveBeenCalledTimes(1);
    expect(ops.disconnectSecondary).toHaveBeenCalledTimes(1);
    expect(el.crossOrigin).toBeNull();
    expect(el.volume).toBeCloseTo(0.8);
    expect(el.src).toBe('https://cdn/stream');
    expect(el.load).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith('bufferChange', 0);
    expect(h.info).toHaveBeenCalledWith(
      'audioEngine',
      expect.stringContaining('stream proxy failed -> direct retry')
    );
  });

  it('falls back to the proxy after a failed direct attempt', () => {
    const { el } = fakeElement();
    const ops = streamOps({
      getMode: () => 'direct',
      getTriedDirect: () => true,
      isMuted: () => true
    });

    handleStreamSourceError(el, ops);

    expect(ops.setFinalRetried).toHaveBeenCalledWith(true);
    expect(ops.setMode).toHaveBeenCalledWith('proxy');
    expect(el.crossOrigin).toBe('anonymous');
    expect(el.volume).toBe(1);
    expect(ops.connectAudio).toHaveBeenCalledWith(el);
    expect(ops.setGain).toHaveBeenCalledWith(0);
    expect(el.src).toBe(toMediaStreamUrl('https://cdn/stream'));
    expect(el.load).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith('bufferChange', 0);
    expect(h.info).toHaveBeenCalledWith(
      'audioEngine',
      expect.stringContaining('stream direct failed -> proxy retry')
    );
  });

  it('emits a terminal stream error when every retry is spent', () => {
    const { el } = fakeElement();
    const ops = streamOps({
      getMode: () => 'proxy',
      getTriedDirect: () => true
    });

    handleStreamSourceError(el, ops);

    expect(emit).toHaveBeenCalledWith('streamError', 'stream-failed');
    expect(el.load).not.toHaveBeenCalled();
    expect(h.warn).toHaveBeenCalledWith('audioEngine', expect.stringContaining('code='));
  });
});
