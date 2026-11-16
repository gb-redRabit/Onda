import { describe, expect, it } from 'vitest';
import {
  AUDIO_PIP_DOCKS,
  migrateAppearance,
  migrateSettingsPayload,
  pipElementArray,
  SETTINGS_VERSION
} from '../settings-migrations';

describe('pipElementArray', () => {
  it('rejects non-arrays and filters unknown elements', () => {
    expect(pipElementArray(undefined)).toBeUndefined();
    expect(pipElementArray('cover')).toBeUndefined();
    expect(pipElementArray(['cover', 'bogus', 3, 'viz'])).toEqual(['cover', 'viz']);
  });
});

describe('migrateAppearance', () => {
  it('ignores non-object payloads', () => {
    expect(migrateAppearance(null)).toBeNull();
  });

  it('adds auxiliary layout elements once', () => {
    const layout = { preset: 'full', elements: [{ id: 'cover', x: 1 }] };
    const result = migrateAppearance({ audioLayout: layout }) as Record<string, unknown>;
    const elements = (result.audioLayout as { elements: Array<{ id: string; visible: boolean }> })
      .elements;

    expect(elements.map((el) => el.id)).toEqual(['cover', 'lyrics', 'favorite', 'technical']);
    expect(elements.slice(1).every((el) => el.visible)).toBe(true);

    const again = migrateAppearance(result) as Record<string, unknown>;
    expect((again.audioLayout as { elements: unknown[] }).elements).toHaveLength(4);
  });

  it('hides auxiliary elements in narrow presets', () => {
    const result = migrateAppearance({
      audioLayout: { preset: 'compact', elements: [] }
    }) as Record<string, unknown>;
    const elements = (result.audioLayout as { elements: Array<{ visible: boolean }> }).elements;
    expect(elements.every((el) => !el.visible)).toBe(true);
  });

  it('skips malformed layouts', () => {
    expect(migrateAppearance({ audioLayout: 5 })).toEqual({ audioLayout: 5 });
    expect(migrateAppearance({ audioLayout: { elements: 'nope' } })).toEqual({
      audioLayout: { elements: 'nope' }
    });
  });

  it('migrates legacy accent colors only when primary is absent', () => {
    const added = migrateAppearance({ accentColor: '#ABCDEF' }) as Record<string, unknown>;
    expect(added.customColors).toEqual({ primary: '#ABCDEF' });

    expect(
      (
        migrateAppearance({ accentColor: '#ABCDEF', customColors: { primary: 'red' } }) as Record<
          string,
          unknown
        >
      ).customColors
    ).toEqual({ primary: 'red' });

    expect(
      (migrateAppearance({ accentColor: 'nope', customColors: [] }) as Record<string, unknown>)
        .customColors
    ).toEqual([]);
  });

  it('maps legacy pip mode and position keys', () => {
    const wide = migrateAppearance({ audioPipMode: 'wide', audioPipEdgePosition: 'top' }) as Record<
      string,
      unknown
    >;
    expect(wide.audioPipDock).toBe('top');

    const max = migrateAppearance({ audioPipMode: 'max', audioPipEdgePosition: 'left' }) as Record<
      string,
      unknown
    >;
    expect(max.audioPipDock).toBe('bottom');

    const pos = migrateAppearance({ audioPipPosition: AUDIO_PIP_DOCKS[3] }) as Record<
      string,
      unknown
    >;
    expect(pos.audioPipDock).toBe(AUDIO_PIP_DOCKS[3]);

    const invalid = migrateAppearance({ audioPipPosition: 'bogus' }) as Record<string, unknown>;
    expect(invalid.audioPipDock).toBe('bottom-right');

    const badDock = migrateAppearance({ audioPipDock: 5 }) as Record<string, unknown>;
    expect(badDock.audioPipDock).toBe('bottom-right');
  });

  it('fills pip defaults and preserves an explicit dock', () => {
    const filled = migrateAppearance({ audioPipAutoShow: false }) as Record<string, unknown>;
    expect(filled).toMatchObject({
      audioPipCornerElements: ['cover', 'trackInfo', 'controls', 'progress', 'volume'],
      audioPipEdgeElements: ['cover', 'trackInfo', 'controls', 'progress', 'volume', 'viz'],
      audioPipAutoHide: true
    });

    const kept = migrateAppearance({ audioPipDock: 'left' }) as Record<string, unknown>;
    expect(kept.audioPipDock).toBe('left');
  });
});

describe('migrateSettingsPayload', () => {
  it('returns an empty object for non-object payloads', () => {
    expect(migrateSettingsPayload(null)).toEqual({});
    expect(migrateSettingsPayload('x')).toEqual({});
  });

  it('adds the context status bar section once', () => {
    const result = migrateSettingsPayload({
      statusBar: { sections: ['viewCounts'] }
    });
    expect(result.statusBar).toEqual({ sections: ['viewCounts', 'context'] });

    const untouched = migrateSettingsPayload({
      statusBar: { sections: ['viewCounts', 'context'] }
    });
    expect(untouched.statusBar).toEqual({ sections: ['viewCounts', 'context'] });

    expect(migrateSettingsPayload({ statusBar: { sections: 'x' } }).statusBar).toEqual({
      sections: 'x'
    });
  });

  it('maps legacy replay gain flags', () => {
    expect(migrateSettingsPayload({ playback: { replayGain: true } }).playback).toMatchObject({
      replayGainMode: 'track'
    });
    expect(migrateSettingsPayload({ playback: { normalization: true } }).playback).toMatchObject({
      replayGainMode: 'track'
    });
    expect(migrateSettingsPayload({ playback: { replayGain: false } }).playback).toMatchObject({
      replayGainMode: 'off'
    });
    expect(
      migrateSettingsPayload({ playback: { replayGainMode: 'album' } }).playback
    ).toMatchObject({ replayGainMode: 'album' });
    expect(migrateSettingsPayload({ playback: 'x' }).playback).toBe('x');
  });

  it('stamps the schema version', () => {
    expect(migrateSettingsPayload({})).toEqual({ version: SETTINGS_VERSION });
  });
});

describe('migrations with complete pip settings', () => {
  it('keeps explicit corner, edge and autohide keys', () => {
    const result = migrateAppearance({
      audioPipDock: 'top',
      audioPipCornerElements: ['cover'],
      audioPipEdgeElements: ['viz'],
      audioPipAutoHide: false
    }) as Record<string, unknown>;

    expect(result).toMatchObject({
      audioPipDock: 'top',
      audioPipCornerElements: ['cover'],
      audioPipEdgeElements: ['viz'],
      audioPipAutoHide: false
    });
  });
});
