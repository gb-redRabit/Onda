import { describe, it, expect, vi, afterEach } from 'vitest';
import { audioEngine } from '@renderer/modules/audioEngine';
import {
  applyVolumeTarget,
  seekTarget,
  skipTarget,
  getTargetPosition,
  clampSpeed
} from '@renderer/utils/mediaTransport';

const stubVideo = () => ({ currentTime: 30, duration: 120 }) as HTMLVideoElement;

describe('mediaTransport', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('skipTarget advances the video time and clamps to duration', () => {
    const video = stubVideo();
    expect(skipTarget(video, 15)).toBe(45);
    expect(video.currentTime).toBe(45);
    expect(skipTarget(video, 500)).toBe(120);
    expect(video.currentTime).toBe(120);
    expect(skipTarget(video, -500)).toBe(0);
    expect(video.currentTime).toBe(0);
  });

  it('skipTarget falls back to the audio engine position when no video', () => {
    vi.spyOn(audioEngine, 'getMediaElement').mockReturnValue({
      currentTime: 10,
      duration: 60
    } as HTMLAudioElement);
    const seekSpy = vi.spyOn(audioEngine, 'seek');
    expect(skipTarget(null, 15)).toBe(25);
    expect(seekSpy).toHaveBeenCalledWith(25);
  });

  it('skipTarget returns null when neither video nor audio element is available', () => {
    expect(skipTarget(null, 15)).toBeNull();
  });

  it('seekTarget writes the video element directly', () => {
    const video = stubVideo();
    seekTarget(video, 12);
    expect(video.currentTime).toBe(12);
  });

  it('seekTarget delegates to the engine when no video', () => {
    const seekSpy = vi.spyOn(audioEngine, 'seek');
    seekTarget(null, 8);
    expect(seekSpy).toHaveBeenCalledWith(8);
  });

  it('applyVolumeTarget routes muted target through the graph for a video element', () => {
    const video = stubVideo();
    const spy = vi.spyOn(audioEngine, 'setVideoVolume');
    applyVolumeTarget(video, true, 0.6);
    expect(spy).toHaveBeenCalledWith(0);
    applyVolumeTarget(video, false, 0.6);
    expect(spy).toHaveBeenCalledWith(0.6);
  });

  it('applyVolumeTarget routes through the engine when no video', () => {
    const spy = vi.spyOn(audioEngine, 'setVolume');
    applyVolumeTarget(null, false, 0.4);
    expect(spy).toHaveBeenCalledWith(0.4);
    applyVolumeTarget(null, true, 0.4);
    expect(spy).toHaveBeenCalledWith(0);
  });

  it('getTargetPosition returns the video position or falls back to the engine', () => {
    const video = stubVideo();
    expect(getTargetPosition(video)).toEqual({ currentTime: 30, duration: 120 });
    vi.spyOn(audioEngine, 'getMediaElement').mockReturnValue({
      currentTime: 5,
      duration: 40
    } as HTMLAudioElement);
    expect(getTargetPosition(null)).toEqual({ currentTime: 5, duration: 40 });
  });
});

describe('clampSpeed', () => {
  it('keeps 0.25-multiples exact (no more 1.25 -> 1.3 drift)', () => {
    expect(clampSpeed(1.25)).toBe(1.25);
    expect(clampSpeed(1.5)).toBe(1.5);
    expect(clampSpeed(0.75)).toBe(0.75);
    expect(clampSpeed(1)).toBe(1);
  });

  it('clamps to the 0.25–3× range', () => {
    expect(clampSpeed(0.1)).toBe(0.25);
    expect(clampSpeed(9)).toBe(3);
    expect(clampSpeed(0.2)).toBe(0.25);
  });

  it('snaps arbitrary input to the 0.05 grid and guards non-finite values', () => {
    expect(clampSpeed(1.33)).toBe(1.35);
    expect(clampSpeed(Number.NaN)).toBe(1);
    expect(clampSpeed(Number.POSITIVE_INFINITY)).toBe(1);
  });
});
