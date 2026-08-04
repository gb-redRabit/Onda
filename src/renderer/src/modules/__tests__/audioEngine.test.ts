import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { audioEngine } from '../audioEngine';

type FakeNode = {
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  gain: { value: number };
  frequency: { value: number };
  Q: { value: number };
  type: string;
  fftSize: number;
  state: string;
};

type TestableAudioEngine = {
  sourceNode: FakeNode | null;
  eqFilters: FakeNode[];
  connectAudio(el: unknown): void;
  connectVideoElement(): void;
  disconnectVideoElement(): void;
};

function createFakeNode(): FakeNode {
  return {
    connect: vi.fn(),
    disconnect: vi.fn(),
    gain: { value: 0 },
    frequency: { value: 0 },
    Q: { value: 0 },
    type: '',
    fftSize: 2048,
    state: 'running'
  };
}

class FakeAudioContext {
  state = 'running';
  destination = createFakeNode();
  createAnalyser = (): FakeNode => createFakeNode();
  createGain = (): FakeNode => createFakeNode();
  createBiquadFilter = (): FakeNode => createFakeNode();
  createMediaElementSource = (): FakeNode => createFakeNode();
  resume = (): Promise<void> => {
    this.state = 'running';
    return Promise.resolve();
  };
  close = (): Promise<void> => {
    this.state = 'closed';
    return Promise.resolve();
  };
}

class FakeAudio {
  preload = '';
  crossOrigin = '';
  src = '';
  currentTime = 0;
  duration = 0;
  paused = true;
  volume = 1;
  removeAttribute = vi.fn();
  pause = vi.fn();
  load = vi.fn();
  play = vi.fn().mockResolvedValue(undefined);
  addEventListener = vi.fn();
  removeEventListener = vi.fn();
}

const engine = audioEngine as unknown as TestableAudioEngine;

describe('audioEngine video element routing', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.stubGlobal('AudioContext', FakeAudioContext);
    vi.stubGlobal('Audio', FakeAudio);
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await audioEngine.destroy().catch(() => {});
  });

  it('connectVideoElement disconnects the source node from the graph', () => {
    const el = new FakeAudio() as unknown as HTMLAudioElement;
    engine.connectAudio(el);
    expect(engine.sourceNode).not.toBeNull();

    engine.connectVideoElement();
    expect(engine.sourceNode?.disconnect).toHaveBeenCalled();
  });

  it('disconnectVideoElement reconnects the source node to the EQ chain', () => {
    const el = new FakeAudio() as unknown as HTMLAudioElement;
    engine.connectAudio(el);
    expect(engine.sourceNode).not.toBeNull();

    engine.connectVideoElement();
    engine.sourceNode!.disconnect.mockClear();

    engine.disconnectVideoElement();
    const firstFilter = engine.eqFilters[0];
    expect(engine.sourceNode?.connect).toHaveBeenCalledWith(firstFilter);
  });

  it('disconnectVideoElement is a no-op without a source node', () => {
    expect(() => engine.disconnectVideoElement()).not.toThrow();
  });

  it('connectVideoElement is a no-op without a source node', () => {
    expect(() => engine.connectVideoElement()).not.toThrow();
  });
});
