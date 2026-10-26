import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MediaFile } from '../../../../shared/types/media';

const deps = vi.hoisted(() => ({
  resolveBin: vi.fn(),
  runCommandResult: vi.fn()
}));

vi.mock('../../../binaries', () => ({ resolveBin: deps.resolveBin }));
vi.mock('../../../utils/exec', () => ({ runCommandResult: deps.runCommandResult }));

import { combineAlbumLufs, gainDbToRatio, loudnessToGainDb, parseEbur128 } from '../loudness';
import { analyzeLibraryLoudness } from '../loudness-analysis';

const EBUR128_OUTPUT = `
[Parsed_ebur128_0 @ 000001] Summary:

  Integrated loudness:
    I:         -23.0 LUFS
    Threshold: -33.0 LUFS

  Loudness range:
    LRA:         5.0 LU

  True peak:
    Peak:       -1.5 dBFS
`;

function file(path: string, overrides: Partial<MediaFile> = {}): MediaFile {
  return {
    id: path,
    name: path,
    path,
    extension: 'mp3',
    mimeType: 'audio/mpeg',
    size: 1,
    type: 'audio',
    addedAt: 0,
    playCount: 0,
    ...overrides
  };
}

describe('loudness math', () => {
  it('parses integrated loudness and true peak from ffmpeg output', () => {
    expect(parseEbur128(EBUR128_OUTPUT)).toEqual({ lufs: -23, peakDb: -1.5 });
  });

  it('returns null when the summary is missing', () => {
    expect(parseEbur128('ffmpeg version 7')).toBeNull();
  });

  it('turns loudness into gain relative to the ReplayGain target', () => {
    expect(loudnessToGainDb(-23)).toBe(5);
  });

  it('limits the gain so true peak does not exceed -1 dBFS', () => {
    expect(loudnessToGainDb(-23, -2)).toBe(1);
  });

  it('clamps extreme gain', () => {
    expect(loudnessToGainDb(-100)).toBe(24);
    expect(loudnessToGainDb(100)).toBe(-24);
  });

  it('converts dB to a linear ratio', () => {
    expect(gainDbToRatio(0)).toBe(1);
    expect(gainDbToRatio(-6)).toBeCloseTo(0.501, 3);
    expect(gainDbToRatio(6)).toBeCloseTo(1.995, 3);
  });

  it('combines album loudness weighted by duration', () => {
    expect(combineAlbumLufs([{ lufs: -20, duration: 100 }])).toBeCloseTo(-20, 5);
    const mixed = combineAlbumLufs([
      { lufs: -20, duration: 100 },
      { lufs: -18, duration: 100 }
    ]);
    expect(mixed).toBeCloseTo(-18.886, 3);
  });

  it('ignores samples without a usable duration', () => {
    expect(combineAlbumLufs([{ lufs: -20, duration: 0 }])).toBeNull();
  });
});

describe('analyzeLibraryLoudness', () => {
  beforeEach(() => {
    deps.resolveBin.mockReset().mockResolvedValue('/ffmpeg');
    deps.runCommandResult.mockReset().mockResolvedValue({
      stdout: '',
      stderr: EBUR128_OUTPUT
    });
  });

  it('computes track gain for untagged files and album gain from mixed sources', async () => {
    const files = [
      file('/a1.mp3', {
        duration: 100,
        metadata: { album: 'A', artist: 'X' }
      }),
      file('/a2.mp3', {
        duration: 100,
        metadata: {
          album: 'A',
          artist: 'X',
          replayGainTrackGain: 1
        }
      })
    ];

    const { updates, summary } = await analyzeLibraryLoudness(files, new AbortController().signal);

    expect(deps.runCommandResult).toHaveBeenCalledTimes(1);
    expect(summary).toMatchObject({ analyzed: 1, albums: 1, failed: 0, aborted: false });

    const albumLufs = combineAlbumLufs([
      { lufs: -23, duration: 100 },
      { lufs: -18, duration: 100 }
    ]) as number;
    const expectedAlbumGain = gainDbToRatio(loudnessToGainDb(albumLufs));

    const a1 = updates.find((u) => u.path === '/a1.mp3');
    const a2 = updates.find((u) => u.path === '/a2.mp3');
    expect(a1?.trackGain).toBeCloseTo(gainDbToRatio(loudnessToGainDb(-23, -1.5)), 5);
    expect(a1?.albumGain).toBeCloseTo(expectedAlbumGain, 5);
    expect(a2?.trackGain).toBeUndefined();
    expect(a2?.albumGain).toBeCloseTo(expectedAlbumGain, 5);
  });

  it('propagates an existing album gain to the rest of the album', async () => {
    const existingAlbumGain = gainDbToRatio(-1);
    const files = [
      file('/a1.mp3', {
        duration: 100,
        metadata: { album: 'A', artist: 'X', replayGainAlbumGain: existingAlbumGain }
      }),
      file('/a2.mp3', {
        duration: 100,
        metadata: { album: 'A', artist: 'X', replayGainTrackGain: 1 }
      })
    ];

    const { updates, summary } = await analyzeLibraryLoudness(files, new AbortController().signal);

    expect(summary.albums).toBe(1);
    expect(updates.find((u) => u.path === '/a1.mp3')?.albumGain).toBeUndefined();
    expect(updates.find((u) => u.path === '/a2.mp3')?.albumGain).toBe(existingAlbumGain);
  });

  it('can derive album gain from tags without invoking ffmpeg', async () => {
    const files = [
      file('/a1.mp3', {
        duration: 100,
        metadata: { album: 'A', artist: 'X', replayGainTrackGain: 1 }
      }),
      file('/a2.mp3', {
        duration: 200,
        metadata: { album: 'A', artist: 'X', replayGainTrackGain: 1 }
      })
    ];

    const { updates, summary } = await analyzeLibraryLoudness(files, new AbortController().signal);

    expect(deps.resolveBin).not.toHaveBeenCalled();
    expect(deps.runCommandResult).not.toHaveBeenCalled();
    expect(summary.albums).toBe(1);
    expect(updates).toHaveLength(2);
    for (const update of updates) expect(update.albumGain).toBeCloseTo(1, 5);
  });

  it('reports the abort flag without scheduling more work', async () => {
    const controller = new AbortController();
    controller.abort();
    const files = [file('/a1.mp3', { duration: 100, metadata: { album: 'A' } })];

    const { summary } = await analyzeLibraryLoudness(files, controller.signal);

    expect(summary.aborted).toBe(true);
    expect(deps.runCommandResult).not.toHaveBeenCalled();
  });
});
