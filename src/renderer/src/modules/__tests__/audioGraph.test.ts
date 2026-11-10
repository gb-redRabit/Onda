import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  loggerWarn: vi.fn(),
  ctx: null as any
}));

vi.mock('@shared/logger', () => ({
  logger: { warn: h.loggerWarn, info: vi.fn(), error: vi.fn() }
}));

type NodeLike = {
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  gain: { value: number };
};

function makeNode(extra: Record<string, unknown> = {}): NodeLike & Record<string, unknown> {
  return {
    connect: vi.fn(),
    disconnect: vi.fn(),
    gain: { value: 0 },
    ...extra
  };
}

class FakeAudioContext {
  sampleRate = 48000;
  state: AudioContextState = 'running';
  destination = {};
  nodes: Array<ReturnType<typeof makeNode>> = [];
  createAnalyser = vi.fn(() => this.track(makeNode({ fftSize: 0 })));
  createGain = vi.fn(() => this.track(makeNode()));
  createDynamicsCompressor = vi.fn(() =>
    this.track(
      makeNode({
        threshold: { value: 0 },
        knee: { value: 0 },
        ratio: { value: 0 },
        attack: { value: 0 },
        release: { value: 0 }
      })
    )
  );
  createBiquadFilter = vi.fn(() =>
    this.track(
      makeNode({
        type: 'peaking',
        frequency: { value: 0 },
        Q: { value: 0 },
        gain: { value: 0 }
      })
    )
  );
  createDelay = vi.fn(() => this.track(makeNode({ delayTime: { value: 0 } })));
  createIIRFilter = vi.fn(() => this.track(makeNode()));
  createMediaElementSource = vi.fn(() => this.track(makeNode()));
  resume = vi.fn(async () => undefined);
  suspend = vi.fn(async () => undefined);
  close = vi.fn(async () => undefined);

  constructor() {
    h.ctx = this;
  }

  private track<T>(node: T): T {
    this.nodes.push(node as never);
    return node;
  }
}

import { AudioGraph } from '../audioGraph';
import type { EqBand } from '@renderer/utils/constants/audio';

let graph: AudioGraph;

function band(frequency = 1000, gain = 0, overrides: Record<string, unknown> = {}): EqBand {
  return {
    type: 'peaking',
    frequency,
    q: 1,
    gain,
    ...overrides
  } as EqBand;
}

function audioElement() {
  return { volume: 1 } as unknown as HTMLAudioElement;
}

function videoElement() {
  return { volume: 1 } as unknown as HTMLVideoElement;
}

beforeEach(() => {
  h.loggerWarn.mockReset();
  h.ctx = null;
  vi.stubGlobal('AudioContext', FakeAudioContext);
  graph = new AudioGraph();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('context and chain', () => {
  it('creates the context lazily and only once', () => {
    expect(graph.getAudioContext()).toBeNull();

    graph.ensureContext();
    const ctx = graph.getAudioContext()!;

    expect(ctx).toBe(h.ctx);
    expect(graph.getAnalyserNode()).toBeTruthy();
    expect(graph.isContextRunning()).toBe(true);
    expect(h.ctx.createGain).toHaveBeenCalled();

    graph.ensureContext();
    expect(h.ctx.createAnalyser).toHaveBeenCalledTimes(1);
  });

  it('builds the EQ chain once', () => {
    graph.ensureEqChain();
    expect(graph.eqFilters).toHaveLength(12);
    expect(h.ctx.createIIRFilter).toHaveBeenCalledTimes(12);
    expect(graph.eqChainBuilt).toBe(true);

    graph.ensureEqChain();
    expect(h.ctx.createIIRFilter).toHaveBeenCalledTimes(12);
  });

  it('connects audio sources and reuses the chain', () => {
    const first = audioElement();
    const second = audioElement();
    graph.connectSource(first);
    const source = graph.sourceNode!;
    expect(h.ctx.createMediaElementSource).toHaveBeenCalledWith(first);

    const firstFilter = graph.eqFilters[0];
    expect(source.connect).toHaveBeenCalledWith(firstFilter);

    graph.connectSource(second);
    expect(source.disconnect).toHaveBeenCalled();
    expect(h.ctx.createMediaElementSource).toHaveBeenCalledTimes(1);
    expect(source.connect).toHaveBeenCalledWith(firstFilter);
  });

  it('rebuilds filters only when the band signature changes', () => {
    graph.setEqBands([band()]);
    graph.ensureEqChain();
    const builds = h.ctx.createIIRFilter.mock.calls.length;
    const signature = (graph as unknown as { eqSignature: string }).eqSignature;

    graph.setEqBands([band(1000, 0)]);
    expect(h.ctx.createIIRFilter).toHaveBeenCalledTimes(builds);
    expect((graph as unknown as { eqSignature: string }).eqSignature).toBe(signature);

    graph.setEqBands([band(2000, 5)]);
    expect(h.ctx.createIIRFilter.mock.calls.length).toBeGreaterThan(builds);
  });

  it('skips rebuilding before the chain exists', () => {
    graph.setEqBands([band()]);
    expect(h.ctx).toBeNull();
  });

  it('marks disabled bands and disabled EQ as passthrough', () => {
    graph.setEqBands([band(100, 6, { enabled: false }), band(200, 3)]);
    graph.setEqEnabled(false);
    graph.ensureEqChain();

    expect(h.ctx.createIIRFilter).toHaveBeenCalledWith([1, 0, 0], [1, 0, 0]);
  });
});

describe('parameters', () => {
  it('applies preamp, mono, night mode and delay', () => {
    graph.setEqPreamp(6);
    graph.setEqMono(true);
    graph.setNightMode(true);
    graph.setAudioDelayMs(250);
    graph.ensureContext();

    expect(graph.preampNode!.gain.value).toBeCloseTo(1.995, 2);
    expect(graph.eqMono).toBe(true);
    expect(graph.monitorNode!.channelCount).toBe(1);
    expect(graph.nightEnabled).toBe(true);
    expect(graph.nightCompressor!.threshold.value).toBe(-32);
    expect(graph.delayNode!.delayTime.value).toBeCloseTo(0.25);

    graph.setNightMode(false);
    graph.setAudioDelayMs(-10);
    expect(graph.nightCompressor!.threshold.value).toBe(0);
    expect(graph.delayNode!.delayTime.value).toBe(0);
  });

  it('updates existing nodes when parameters are set later', () => {
    graph.ensureContext();
    graph.setEqPreamp(-6);
    graph.setEqMono(false);
    graph.setAudioDelayMs(1000);

    expect(graph.preampNode!.gain.value).toBeCloseTo(0.501, 2);
    expect(graph.monitorNode!.channelCount).toBe(2);
    expect(graph.delayNode!.delayTime.value).toBeCloseTo(0.5);
  });
});

describe('video routing', () => {
  it('creates a video source and gain', () => {
    const video = videoElement();
    graph.connectVideoElement(video, 0.5);

    expect(h.ctx.createMediaElementSource).toHaveBeenCalledWith(video);
    expect(graph.videoSourceEl).toBe(video);
    expect(graph.videoGainNode!.gain.value).toBe(0.5);
    expect(graph.videoSourceNode!.connect).toHaveBeenCalledWith(graph.videoGainNode);
  });

  it('resumes a suspended context', () => {
    graph.ensureContext();
    h.ctx.state = 'suspended';

    graph.connectVideoElement(videoElement());

    expect(h.ctx.resume).toHaveBeenCalled();
  });

  it('restores volume for the same video element', () => {
    const video = videoElement();
    graph.connectVideoElement(video, 0.5);
    graph.videoGainNode!.gain.value = 0;

    graph.connectVideoElement(video, 0.8);

    expect(graph.videoGainNode!.gain.value).toBe(0.8);
    expect(h.ctx.createMediaElementSource).toHaveBeenCalledTimes(1);
  });

  it('replaces a different video element', () => {
    const first = videoElement();
    graph.connectVideoElement(first, 0.5);
    const oldSource = graph.videoSourceNode!;

    graph.connectVideoElement(videoElement(), 0.7);

    expect(oldSource.disconnect).toHaveBeenCalled();
    expect(h.ctx.createMediaElementSource).toHaveBeenCalledTimes(2);
  });

  it('disconnects the video and reconnects the audio head', () => {
    graph.connectSource(audioElement());
    graph.connectVideoElement(videoElement());
    const source = graph.sourceNode!;
    (source.connect as any).mockClear();

    graph.disconnectVideoElement();

    expect(graph.videoSourceNode).toBeNull();
    expect(graph.videoGainNode).toBeNull();
    expect(source.connect).toHaveBeenCalledWith(graph.eqFilters[0]);
  });

  it('disconnects video without an audio source', () => {
    graph.connectVideoElement(videoElement());
    expect(() => graph.disconnectVideoElement()).not.toThrow();
    expect(graph.videoSourceEl).toBeNull();
  });

  it('sets the video volume on both gain and element', () => {
    const video = videoElement();
    graph.connectVideoElement(video);

    graph.setVideoVolume(0.3);

    expect(graph.videoGainNode!.gain.value).toBe(0.3);
    expect(video.volume).toBe(0.3);
  });

  it('tolerates setting volume without a video node', () => {
    expect(() => graph.setVideoVolume(0.2)).not.toThrow();
  });
});

describe('teardown and errors', () => {
  it('disconnects source nodes and logs failures', () => {
    graph.connectSource(audioElement());
    graph.connectVideoElement(videoElement());
    (graph.sourceNode as any).disconnect.mockImplementationOnce(() => {
      throw new Error('source');
    });
    (graph.videoSourceNode as any).disconnect.mockImplementationOnce(() => {
      throw new Error('video source');
    });

    graph.disconnectSourceNode();

    expect(h.loggerWarn).toHaveBeenCalledWith(
      'audioEngine',
      'disconnect source node failed',
      expect.any(Error)
    );
    expect(h.loggerWarn).toHaveBeenCalledWith(
      'audioEngine',
      'disconnect video source node failed',
      expect.any(Error)
    );
  });

  it('disconnects every node and resets video state', () => {
    graph.connectSource(audioElement());
    graph.connectVideoElement(videoElement());

    graph.disconnectNodes();

    expect(graph.videoSourceNode).toBeNull();
    expect(graph.videoGainNode).toBeNull();
    expect(graph.videoSourceEl).toBeNull();
    expect(graph.gainNode!.disconnect).toHaveBeenCalled();
    expect(graph.analyserNode!.disconnect).toHaveBeenCalled();
  });

  it('logs failures during full disconnect', () => {
    graph.connectSource(audioElement());
    (graph.gainNode as any).disconnect.mockImplementationOnce(() => {
      throw new Error('gain');
    });
    (graph.eqFilters[0] as any).disconnect.mockImplementationOnce(() => {
      throw new Error('filter');
    });
    (graph.preampNode as any).disconnect.mockImplementationOnce(() => {
      throw new Error('preamp');
    });

    graph.disconnectNodes();

    expect(h.loggerWarn).toHaveBeenCalledWith(
      'audioEngine',
      'disconnect gain node failed',
      expect.any(Error)
    );
    expect(h.loggerWarn).toHaveBeenCalledWith(
      'audioEngine',
      'disconnect eq filter failed',
      expect.any(Error)
    );
    expect(h.loggerWarn).toHaveBeenCalledWith(
      'audioEngine',
      'disconnect graph node failed',
      expect.any(Error)
    );
  });

  it('logs failures when disconnecting video nodes', () => {
    graph.connectVideoElement(videoElement());
    (graph.videoSourceNode as any).disconnect.mockImplementationOnce(() => {
      throw new Error('video source');
    });
    (graph.videoGainNode as any).disconnect.mockImplementationOnce(() => {
      throw new Error('video gain');
    });

    graph.disconnectVideoElement();

    expect(h.loggerWarn).toHaveBeenCalledWith(
      'audioEngine',
      'disconnectVideoElement: video source disconnect failed',
      expect.any(Error)
    );
    expect(h.loggerWarn).toHaveBeenCalledWith(
      'audioEngine',
      'disconnectVideoElement: video gain disconnect failed',
      expect.any(Error)
    );
  });

  it('logs video and analyser failures during full disconnect', () => {
    graph.connectSource(audioElement());
    graph.connectVideoElement(videoElement());
    (graph.sourceNode as any).disconnect.mockImplementationOnce(() => {
      throw new Error('source');
    });
    (graph.videoSourceNode as any).disconnect.mockImplementationOnce(() => {
      throw new Error('video source');
    });
    (graph.videoGainNode as any).disconnect.mockImplementationOnce(() => {
      throw new Error('video gain');
    });
    (graph.analyserNode as any).disconnect.mockImplementationOnce(() => {
      throw new Error('analyser');
    });

    graph.disconnectNodes();

    expect(h.loggerWarn).toHaveBeenCalledWith(
      'audioEngine',
      'disconnect video source node failed',
      expect.any(Error)
    );
    expect(h.loggerWarn).toHaveBeenCalledWith(
      'audioEngine',
      'disconnect video gain node failed',
      expect.any(Error)
    );
    expect(h.loggerWarn).toHaveBeenCalledWith(
      'audioEngine',
      'disconnect analyser failed',
      expect.any(Error)
    );
  });

  it('logs source disconnect failures when switching to video', () => {
    graph.connectSource(audioElement());
    (graph.sourceNode as any).disconnect.mockImplementationOnce(() => {
      throw new Error('source');
    });

    graph.connectVideoElement(videoElement());

    expect(h.loggerWarn).toHaveBeenCalledWith(
      'audioEngine',
      'connectVideoElement: source disconnect failed',
      expect.any(Error)
    );
  });

  it('suspends, resumes and closes the context', async () => {
    graph.ensureContext();

    await graph.suspendContext();
    expect(h.ctx.suspend).toHaveBeenCalled();

    h.ctx.state = 'suspended';
    graph.resumeContext();
    expect(h.ctx.resume).toHaveBeenCalled();

    await graph.closeContext();
    expect(h.ctx.close).toHaveBeenCalled();
    expect(graph.audioCtx).toBeNull();
    expect(graph.analyserNode).toBeNull();
    expect(graph.sourceNode).toBeNull();
    expect(graph.gainNode).toBeNull();
    expect(graph.eqFilters).toEqual([]);
    expect(graph.eqChainBuilt).toBe(false);
  });

  it('handles missing contexts on control calls', async () => {
    expect(graph.isContextRunning()).toBe(false);
    expect(graph.getAnalyserNode()).toBeNull();

    await expect(graph.suspendContext()).resolves.toBeUndefined();
    expect(() => graph.resumeContext()).not.toThrow();
    await graph.closeContext();
  });
});
